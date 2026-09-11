use std::ops::Range;

use pulldown_cmark::{Event, Options, Parser, Tag};

use crate::frontmatter;

/// `strip_suffix`, ignoring ASCII case, so `.MD` strips the way `.md` does.
fn strip_suffix_ignore_case<'a>(name: &'a str, suffix: &str) -> Option<&'a str> {
    let split = name.len().checked_sub(suffix.len())?;

    if !name.is_char_boundary(split) {
        return None;
    }

    let (head, tail) = name.split_at(split);

    tail.eq_ignore_ascii_case(suffix).then_some(head)
}

/// The filename stem, which is the last source `resolve_title` falls back to.
///
/// The extension is stripped case-insensitively, matching `noteTitle` in
/// `src/core/notes.ts`. The two must agree or the same file gets one title in
/// the index and another in the open note.
pub(crate) fn title_of(rel_path: &str) -> String {
    let name = rel_path.rsplit('/').next().unwrap_or(rel_path);
    strip_suffix_ignore_case(name, ".markdown")
        .or_else(|| strip_suffix_ignore_case(name, ".md"))
        .unwrap_or(name)
        .to_string()
}

/// The body's leading `#` heading, when it has one.
///
/// CommonMark's ATX level-1 shape: up to three spaces of indent, one `#`, then
/// a space, a tab, or end of line. `##` never matches, and a tab indent makes
/// the line a code block rather than a heading.
///
/// Only the first non-blank line is considered, which is what lets this skip
/// fenced code blocks without tracking them: a fence opener cannot match the
/// pattern. Kept in parity with `leadingHeading` in `src/core/notes.ts`.
pub(crate) fn leading_heading(body: &str) -> Option<String> {
    let line = body.lines().find(|line| !line.trim().is_empty())?;
    let indent = line.len() - line.trim_start_matches(' ').len();

    if indent > 3 {
        return None;
    }

    let rest = line[indent..].strip_prefix('#')?;

    if !rest.is_empty() && !rest.starts_with(' ') && !rest.starts_with('\t') {
        return None;
    }

    let text = rest.trim();
    // Closed ATX form: `# title #`. The closing run has to be preceded by
    // whitespace, so `# C#` keeps its trailing character.
    let text = match text.rsplit_once(char::is_whitespace) {
        Some((head, tail)) if !tail.is_empty() && tail.chars().all(|c| c == '#') => head.trim_end(),
        _ => text,
    };

    if text.is_empty() {
        None
    } else {
        Some(text.to_string())
    }
}

/// A note's display title: the leading `#` heading, then imported frontmatter `title:`,
/// then the filename stem. Kept in parity with `resolveTitle` in
/// `src/core/notes.ts`.
pub(crate) fn resolve_title(parsed: &frontmatter::Parsed<'_>, rel_path: &str) -> String {
    leading_heading(parsed.body)
        .or_else(|| parsed.frontmatter.title.clone())
        .unwrap_or_else(|| title_of(rel_path))
}

/// `line` is 1-based and `target` is the text between the brackets as written.
pub(crate) struct Wikilink<'a> {
    pub(crate) context: &'a str,
    pub(crate) line: usize,
    pub(crate) target: &'a str,
}

enum HtmlTag {
    Open(String),
    Close(String),
}

/// Elements that never take a closing tag, per the HTML standard.
const VOID_ELEMENTS: [&str; 13] = [
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track",
    "wbr",
];

/// The element an inline HTML token opens or closes. A comment, a void element
/// and a self-closing tag pair with nothing.
fn html_tag(html: &str) -> Option<HtmlTag> {
    let rest = html.strip_prefix('<')?;
    let (closing, rest) = match rest.strip_prefix('/') {
        Some(rest) => (true, rest),
        None => (false, rest),
    };
    let name: String = rest
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect::<String>()
        .to_ascii_lowercase();

    if name.is_empty() {
        return None;
    }
    if closing {
        return Some(HtmlTag::Close(name));
    }
    if html.trim_end().ends_with("/>") || VOID_ELEMENTS.contains(&name.as_str()) {
        return None;
    }

    Some(HtmlTag::Open(name))
}

/// Kept in parity with `isNotePath` in `src/core/links.ts`.
pub(crate) fn is_note_path(destination: &str) -> bool {
    if destination.starts_with('#') || destination.starts_with('/') {
        return false;
    }
    if let Some((head, _)) = destination.split_once(':') {
        let scheme = head.chars().next().is_some_and(|c| c.is_ascii_alphabetic())
            && head
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-'));
        if scheme {
            return false;
        }
    }
    let path = destination.split(['#', '?']).next().unwrap_or("");
    let name = path.rsplit('/').next().unwrap_or("");
    !name.starts_with('.')
        && (strip_suffix_ignore_case(name, ".md").is_some()
            || strip_suffix_ignore_case(name, ".markdown").is_some())
}

struct Scan {
    link_spans: Vec<Range<usize>>,
    links: Vec<(usize, String)>,
    prose: Vec<bool>,
}

/// Where a `[[link]]` counts, byte by byte: true for prose, false for what the
/// editor's parser reads as code, HTML, or a link destination.
///
/// CommonMark decides the blocks, so a fence, an indented block and a backtick
/// span are opaque on both sides. Emphasis delimiters are prose, since the
/// editor's tokenizer takes `[[**a**]]` whole. Text between a matching pair of
/// inline tags is opaque too, because the editor parses that stretch as HTML
/// rather than markdown, while an unmatched tag hides only itself.
fn scan(body: &str) -> Scan {
    let options =
        Options::ENABLE_TABLES | Options::ENABLE_TASKLISTS | Options::ENABLE_STRIKETHROUGH;
    let mut prose = vec![false; body.len()];
    let mut opaque: Vec<Range<usize>> = Vec::new();
    let mut open_tags: Vec<(String, usize)> = Vec::new();
    let mut links = Vec::new();
    let mut link_spans = Vec::new();

    for (event, range) in Parser::new_ext(body, options).into_offset_iter() {
        match event {
            Event::Text(_) => {
                prose[range.clone()].fill(true);
                // An escaped character arrives as its own text event with the
                // backslash left out of its range. The backslash is prose to
                // the editor's tokenizer, which counts them to decide whether
                // the bracket after them is escaped.
                if range.start > 0 && body.as_bytes()[range.start - 1] == b'\\' {
                    prose[range.start - 1] = true;
                }
            }
            Event::Code(_) | Event::Html(_) => opaque.push(range),
            Event::InlineHtml(html) => {
                opaque.push(range.clone());
                match html_tag(&html) {
                    Some(HtmlTag::Open(name)) => open_tags.push((name, range.start)),
                    Some(HtmlTag::Close(name)) => {
                        if let Some(at) = open_tags.iter().rposition(|(open, _)| *open == name) {
                            opaque.push(open_tags[at].1..range.end);
                            open_tags.truncate(at);
                        }
                    }
                    None => {}
                }
            }
            Event::Start(tag) => match tag {
                Tag::Emphasis | Tag::Strong | Tag::Strikethrough => prose[range].fill(true),
                Tag::Link { dest_url, .. } => {
                    link_spans.push(range.clone());
                    links.push((range.start, dest_url.to_string()));
                }
                Tag::Image { .. } => link_spans.push(range),
                Tag::Superscript | Tag::Subscript => {}
                Tag::CodeBlock(_) | Tag::HtmlBlock => {
                    opaque.push(range);
                    open_tags.clear();
                }
                _ => open_tags.clear(),
            },
            _ => {}
        }
    }

    for range in &opaque {
        prose[range.clone()].fill(false);
    }
    links.retain(|(at, _)| !opaque.iter().any(|span| span.contains(at)));

    for (at, target, end) in autolinks(body, &prose, &link_spans) {
        links.push((at, target));
        link_spans.push(at..end);
    }
    links.sort_by_key(|(at, _)| *at);

    Scan {
        link_spans,
        links,
        prose,
    }
}

fn trim_autolink(raw: &str) -> &str {
    let mut end = 0;
    while end < raw.len() {
        let rest = &raw[end..];
        let ch = rest.chars().next().unwrap();
        if ch == '(' {
            let Some(close) = rest.find(')') else {
                break;
            };
            end += close + 1;
        } else if ch == '&' {
            let entity = rest.strip_prefix('&').unwrap().strip_suffix(';');
            if entity.is_some_and(|name| {
                !name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric())
            }) {
                break;
            }
            end += 1;
        } else if matches!(
            ch,
            '?' | '!' | '.' | ',' | ':' | ';' | '*' | '_' | '\'' | '"' | '~' | ')'
        ) {
            let punctuation = rest
                .chars()
                .take_while(|c| {
                    matches!(
                        c,
                        '?' | '!' | '.' | ',' | ':' | ';' | '*' | '_' | '\'' | '"' | '~' | ')'
                    )
                })
                .count();
            if punctuation == rest.len() {
                break;
            }
            end += punctuation;
        } else {
            end += ch.len_utf8();
        }
    }
    &raw[..end]
}

fn bare_email(raw: &str) -> Option<&str> {
    let local = raw
        .bytes()
        .take_while(|c| c.is_ascii_alphanumeric() || matches!(c, b'.' | b'_' | b'+' | b'-'))
        .count();
    if local == 0 || raw.as_bytes().get(local) != Some(&b'@') {
        return None;
    }
    let domain_char = |c: &u8| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-');
    let first = raw[local + 1..].bytes().take_while(domain_char).count();
    if first == 0 {
        return None;
    }
    let mut at = local + 1 + first;
    let mut end = None;
    while raw.as_bytes().get(at) == Some(&b'.') {
        let length = raw[at + 1..].bytes().take_while(domain_char).count();
        if length == 0 || !raw.as_bytes()[at + length].is_ascii_alphanumeric() {
            break;
        }
        at += 1 + length;
        end = Some(at);
    }
    end.map(|end| &raw[..end])
}

fn bare_destination(raw: &str) -> Option<(&str, String)> {
    let prefix = ["https://", "http://", "ftp://", "www."]
        .into_iter()
        .find(|prefix| {
            raw.get(..prefix.len()).is_some_and(|start| {
                if *prefix == "www." {
                    start == *prefix
                } else {
                    start.eq_ignore_ascii_case(prefix)
                }
            })
        });
    if let Some(prefix) = prefix {
        if !raw
            .as_bytes()
            .get(prefix.len())
            .is_some_and(|c| c.is_ascii_alphanumeric() || *c == b'-')
        {
            return None;
        }
        let value = trim_autolink(raw);
        let target = if prefix == "www." {
            format!("http://{value}")
        } else {
            value.to_string()
        };
        Some((value, target))
    } else {
        bare_email(raw).map(|value| (value, format!("mailto:{value}")))
    }
}

/// GFM bare destinations inside parser-approved prose. Explicit links and
/// wikilinks own their spans, so their labels never produce nested links.
fn autolinks(body: &str, prose: &[bool], spans: &[Range<usize>]) -> Vec<(usize, String, usize)> {
    let mut linked = vec![false; body.len()];
    for span in spans {
        linked[span.clone()].fill(true);
    }
    let mut wikilinks = wikilink_targets(body, 0..body.len()).into_iter().peekable();
    let mut found = Vec::new();
    let mut until = 0;
    for (at, _) in body.char_indices() {
        if at < until || !prose[at] || linked[at] {
            continue;
        }
        while wikilinks.peek().is_some_and(|(open, _)| *open < at) {
            wikilinks.next();
        }
        if let Some(&(open, target)) = wikilinks.peek() {
            if open == at {
                until = open + target.len() + 4;
                wikilinks.next();
                continue;
            }
        }
        let rest = &body[at..];
        let raw_end = rest
            .char_indices()
            .find(|(offset, c)| !prose[at + offset] || c.is_whitespace() || *c == '<')
            .map_or(rest.len(), |(offset, _)| offset);
        if let Some((value, target)) = bare_destination(&rest[..raw_end]) {
            until = at + value.len();
            found.push((at, target, until));
        }
    }
    found
}

fn prose_mask(body: &str) -> Vec<bool> {
    scan(body).prose
}

fn line_at(body: &str, at: usize) -> (usize, &str) {
    let line_start = body[..at].rfind('\n').map_or(0, |i| i + 1);
    let line_end = body[at..].find('\n').map_or(body.len(), |i| at + i);

    (
        body[..at].matches('\n').count() + 1,
        body[line_start..line_end].trim_end_matches('\r'),
    )
}

fn prose_ranges(body: &str) -> Vec<Range<usize>> {
    let mask = prose_mask(body);
    let mut ranges = Vec::new();
    let mut start = None;

    for (at, &is_prose) in mask.iter().enumerate() {
        match (start, is_prose) {
            (None, true) => start = Some(at),
            (Some(from), false) => {
                ranges.push(from..at);
                start = None;
            }
            _ => {}
        }
    }
    if let Some(from) = start {
        ranges.push(from..mask.len());
    }

    ranges
}

/// Every `[[target]]` in `body[range]`, read the way the editor's tokenizer
/// reads it: the target holds no bracket and no newline, a `[[` that opens
/// nothing is text, and a bracket behind an odd run of backslashes is escaped.
/// Yields each target with the byte offset of its `[[`.
fn wikilink_targets(body: &str, range: Range<usize>) -> Vec<(usize, &str)> {
    let mut found = Vec::new();
    let mut at = range.start;

    while let Some(offset) = body[at..range.end].find("[[") {
        let open = at + offset;
        let inner = open + 2;
        let escaped = body[..open]
            .bytes()
            .rev()
            .take_while(|&byte| byte == b'\\')
            .count()
            % 2
            == 1;
        let target = body[inner..range.end]
            .find(']')
            .map(|end| &body[inner..inner + end])
            .filter(|target| !target.is_empty() && !target.contains(['[', '\n']))
            .filter(|target| body[inner + target.len()..range.end].starts_with("]]"));

        match target {
            Some(target) if !escaped => {
                found.push((open, target));
                at = inner + target.len() + 2;
            }
            _ => at = open + 1,
        }
    }

    found
}

/// Kept in parity with the editor's tokenizer: `finds_the_wikilinks_the_editor_renders`
/// below and `src/components/editor/wikilink.spec.ts` assert one table of cases.
pub(crate) fn wikilinks(body: &str) -> Vec<Wikilink<'_>> {
    prose_ranges(body)
        .into_iter()
        .flat_map(|range| wikilink_targets(body, range))
        .map(|(open, target)| {
            let (line, context) = line_at(body, open);

            Wikilink {
                context,
                line,
                target,
            }
        })
        .collect()
}

pub(crate) struct MarkdownLink<'a> {
    pub(crate) context: &'a str,
    pub(crate) line: usize,
    pub(crate) target: String,
}

/// Kept in parity with the editor's parser the way `wikilinks` is:
/// `finds_the_markdown_note_links_the_editor_renders` below and
/// `src/components/editor/markdown-link.spec.ts` assert one table of cases.
pub(crate) fn destinations(body: &str) -> Vec<MarkdownLink<'_>> {
    scan(body)
        .links
        .into_iter()
        .map(|(open, target)| {
            let (line, context) = line_at(body, open);

            MarkdownLink {
                context,
                line,
                target,
            }
        })
        .collect()
}

#[cfg(test)]
pub(crate) fn markdown_links(body: &str) -> Vec<MarkdownLink<'_>> {
    destinations(body)
        .into_iter()
        .filter(|link| is_note_path(&link.target))
        .collect()
}

/// Byte length of the prefix that folds to `needle`. Both sides fold char by
/// char, so a dotted I or a final sigma cannot fold one way in the title and
/// another in the text.
fn case_insensitive_prefix(text: &str, needle: &[char]) -> Option<usize> {
    let mut wanted = needle.iter();
    let mut consumed = 0;

    for ch in text.chars() {
        if wanted.len() == 0 {
            break;
        }
        for lower in ch.to_lowercase() {
            if wanted.next() != Some(&lower) {
                return None;
            }
        }
        consumed += ch.len_utf8();
    }

    (wanted.len() == 0 && consumed > 0).then_some(consumed)
}

/// Inside `[[...]]` or a markdown link the title is a link and counted
/// already, and on the heading that names the note it is the note's name. A
/// leading heading names the note even when imported frontmatter has a title.
pub(crate) fn bare_mentions<'a>(
    body: &'a str,
    title: &str,
    heading_names_note: bool,
) -> Vec<(usize, &'a str)> {
    let needle: Vec<char> = title.chars().flat_map(char::to_lowercase).collect();
    let markdown_links = scan(body).link_spans;
    let heading_line = heading_names_note
        .then(|| leading_heading(body))
        .flatten()
        .and_then(|_| body.lines().position(|line| !line.trim().is_empty()));
    let is_word = |ch: char| ch.is_alphanumeric() || ch == '_';
    let mut found = Vec::new();

    for range in prose_ranges(body) {
        let links: Vec<Range<usize>> = wikilink_targets(body, range.clone())
            .into_iter()
            .map(|(open, target)| open..open + target.len() + 4)
            .chain(markdown_links.iter().cloned())
            .collect();
        let run = &body[range.clone()];
        let mut skip_until = 0;

        for (at, _) in run.char_indices() {
            if at < skip_until {
                continue;
            }
            let Some(len) = case_insensitive_prefix(&run[at..], &needle) else {
                continue;
            };
            let start = range.start + at;
            let end = start + len;
            let bounded = !run[..at].chars().next_back().is_some_and(is_word)
                && !run[at + len..].chars().next().is_some_and(is_word);
            let linked = links
                .iter()
                .any(|span| start < span.end && end > span.start);
            let (line, context) = line_at(body, start);

            if !bounded || linked || heading_line == Some(line - 1) {
                continue;
            }

            found.push((line, context));
            skip_until = at + len;
        }
    }

    found
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The title-resolution parity table. `src/core/notes.spec.ts` asserts the
    /// same cases in the same order, so the two resolvers can be diffed by eye.
    #[test]
    fn should_resolve_heading_then_imported_title_then_filename() {
        // Held one-per-line against rustfmt so this table stays diffable by eye
        // against its twin in `src/core/notes.spec.ts`.
        #[rustfmt::skip]
        let cases: &[(&str, &str, &str)] = &[
            ("---\ntitle: from frontmatter\n---\n# from heading\n", "note.md", "from heading"),
            ("---\ntitle: \"effect: a primer\"\n---\nbody\n", "note.md", "effect: a primer"),
            ("---\ntitle: effect: a primer\n---\nbody\n", "note.md", "effect: a primer"),
            // An empty title is absent, so the heading takes over.
            ("---\ntitle:\n---\n# from heading\n", "note.md", "from heading"),
            // Heading beats the filename.
            ("# from heading\n", "note.md", "from heading"),
            ("\n\n# after blank lines\n", "note.md", "after blank lines"),
            ("   # three spaces\n", "note.md", "three spaces"),
            ("# closed form #\n", "note.md", "closed form"),
            ("# closed form ###\n", "note.md", "closed form"),
            // No whitespace before the trailing run, so it is part of the text.
            ("# C#\n", "note.md", "C#"),
            ("#\ttab after hash\n", "note.md", "tab after hash"),
            // Not headings: too much indent, deeper level, no space, empty.
            ("    # four spaces\n", "note.md", "note"),
            ("## level two\n", "note.md", "note"),
            ("#nospace\n", "note.md", "note"),
            ("#\n", "note.md", "note"),
            // A heading below content is a section heading, not the title.
            ("intro paragraph\n\n# a section\n", "note.md", "note"),
            // A fence opener cannot match, so code blocks need no tracking.
            ("```\n# not a heading\n```\n", "note.md", "note"),
            // Filename fallback.
            ("just an idea\n", "work/ideas.md", "ideas"),
            ("", "untitled.md", "untitled"),
            ("# crlf heading\r\n", "note.md", "crlf heading"),
            ("---\r\ntitle: crlf fm\r\n---\r\nbody\r\n", "note.md", "crlf fm"),
        ];

        for (content, rel_path, expected) in cases {
            let parsed = frontmatter::parse(content);
            assert_eq!(
                resolve_title(&parsed, rel_path),
                *expected,
                "resolving {content:?} at {rel_path:?}"
            );
        }
    }

    /// The extension strips case-insensitively, the same way `noteTitle` does in
    /// TypeScript, so the index and the open note cannot disagree.
    #[test]
    fn should_strip_the_markdown_extension_case_insensitively() {
        let parsed = frontmatter::parse("body\n");
        assert_eq!(resolve_title(&parsed, "NOTE.MD"), "NOTE");
        assert_eq!(resolve_title(&parsed, "note.md"), "note");
        assert_eq!(resolve_title(&parsed, "Note.Markdown"), "Note");
        assert_eq!(resolve_title(&parsed, "note.markdown"), "note");
        // Not an extension, so nothing is stripped.
        assert_eq!(resolve_title(&parsed, "notes.txt"), "notes.txt");
        assert_eq!(resolve_title(&parsed, ".md"), "");
    }

    /// The wikilink parity table. `src/components/editor/wikilink.spec.ts`
    /// asserts the same cases in the same order against the editor's parser,
    /// so what the index records and what the editor renders as a pill can be
    /// diffed by eye.
    #[test]
    fn should_find_the_wikilinks_the_editor_renders() {
        // Held one-per-line against rustfmt so this table stays diffable by eye
        // against its twin in `src/components/editor/wikilink.spec.ts`.
        #[rustfmt::skip]
        let cases: &[(&str, &[&str])] = &[
            ("see [[a]] here", &["a"]),
            ("[[a]] and [[b]]", &["a", "b"]),
            ("[[a]] [[a]]", &["a", "a"]),
            ("[[a]]\nnext line [[b]]", &["a", "b"]),
            ("[[a]]\n\n[[b]]", &["a", "b"]),
            ("a [[b]]  \nc", &["b"]),
            // The target is the text between the brackets, as written.
            ("[[a|alias]]", &["a|alias"]),
            ("[[a#h]]", &["a#h"]),
            ("[[ spaced ]]", &[" spaced "]),
            ("[[**a**]]", &["**a**"]),
            ("[[a\\]]", &["a\\"]),
            // An embed reads as a wikilink behind a `!` until transclusion lands.
            ("![[a]]", &["a"]),
            // A bracket inside the target, or nothing inside, opens no link.
            ("[[a]b]]", &[]),
            ("[[[a]]]", &["a"]),
            ("[[a]]]", &["a"]),
            ("[[]]", &[]),
            // A bracket behind an odd run of backslashes is text.
            ("a\\[[b]]", &[]),
            ("\\\\[[a]]", &["a"]),
            ("# see [[a]]", &["a"]),
            ("> [[a]]", &["a"]),
            ("| [[a]] |\n| --- |\n| x |", &["a"]),
            ("1. [[a]]", &["a"]),
            ("- [ ] [[a]]", &["a"]),
            ("- [[a]]\n  - [[b]]", &["a", "b"]),
            ("**[[a]]**", &["a"]),
            ("*[[a]]*", &["a"]),
            ("[see [[a]]](http://x)", &["a"]),
            ("[see [[**a**]]](x)", &["**a**"]),
            ("![see [[a]]](x)", &["a"]),
            // A link destination is not prose.
            ("[t]([[a]])", &[]),
            ("[x]: http://y\n[[a]]", &["a"]),
            ("`[[a]]`", &[]),
            ("`` ` [[a]] ``", &[]),
            ("` unclosed [[a]]", &["a"]),
            ("`` [[a]] `", &["a"]),
            ("text `code` [[a]] `more`", &["a"]),
            ("[[a]] `[[b]]`", &["a"]),
            ("`[[a]]` and [[b]]", &["b"]),
            ("```\n[[a]]\n```", &[]),
            ("~~~\n[[a]]\n~~~", &[]),
            ("```js\n[[a]]\n```\n[[b]]", &["b"]),
            ("````\n```\n[[a]]\n```\n````", &[]),
            ("~~~\n```\n[[a]]\n~~~", &[]),
            ("```\n[[a]]\n````", &[]),
            ("   ```\n[[a]]\n   ```", &[]),
            ("```\n[[a]]", &[]),
            ("[[a]]\n```\n[[b]]\n```", &["a"]),
            ("``` [[a]]\n```", &[]),
            // Backticks in the info string make it a paragraph, not a fence.
            ("```inline``` [[a]]", &["a"]),
            ("> ```\n> [[a]]\n> ```", &[]),
            ("- ```\n  [[a]]\n  ```", &[]),
            // Indented code, which CommonMark measures from the container.
            ("    [[a]]", &[]),
            ("\t[[a]]", &[]),
            ("para\n\n    [[a]]", &[]),
            ("para\n    [[a]]", &["a"]),
            ("- item\n    [[a]]", &["a"]),
            ("- item\n\n      [[a]]", &[]),
            // HTML blocks and comments are opaque.
            ("<!-- [[a]] -->", &[]),
            ("[[a]]<!-- [[b]] -->", &["a"]),
            ("<div>[[a]]</div>", &[]),
            ("line\n<div>\n[[a]]\n</div>", &[]),
            ("<span>\n[[a]]\n</span>", &[]),
            // A matching pair of inline tags hides what sits between them.
            ("<span>[[a]]</span>", &[]),
            ("x <span>[[a]]</span> y", &[]),
            ("<span>y</span> [[a]]", &["a"]),
            ("[[a]] <span>y</span>", &["a"]),
            ("<span>x</span>[[a]]<span>y</span>", &["a"]),
            ("<b>[[a]]</b> [[c]]", &["c"]),
            ("<span>x [[a]]</span> [[b]] <i>[[c]]</i>", &["b"]),
            ("<span>[[a]] <b>x</b></span>", &[]),
            ("<span title=\"[[a]]\">x</span>", &[]),
            // An unmatched tag hides only itself.
            ("<span>[[a]]", &["a"]),
            ("[[a]]</span>", &["a"]),
            ("a <br> [[b]]", &["b"]),
            ("<kbd>k</kbd> [[a]]", &["a"]),
            ("<em>x</em>[[a]]", &["a"]),
        ];

        for (markdown, expected) in cases {
            let found: Vec<&str> = wikilinks(markdown).iter().map(|link| link.target).collect();
            assert_eq!(&found, expected, "scanning {markdown:?}");
        }
    }

    /// The markdown-link parity table. `src/components/editor/markdown-link.spec.ts`
    /// asserts the same cases in the same order against the editor's parser and
    /// `isNotePath`, so what the index records and what the editor opens on
    /// ⌘-click can be diffed by eye.
    #[test]
    fn should_find_the_markdown_note_links_the_editor_renders() {
        #[rustfmt::skip]
        let cases: &[(&str, &[&str])] = &[
            ("[a](b.md)", &["b.md"]),
            ("[a](./b.md)", &["./b.md"]),
            ("[a](../b.md)", &["../b.md"]),
            ("[a](B.MD)", &["B.MD"]),
            ("[a](b.md#h)", &["b.md#h"]),
            ("[a](sub/b%20c.md)", &["sub/b%20c.md"]),
            ("[a](b.md \"title\")", &["b.md"]),
            ("[a](b.md 'single')", &["b.md"]),
            ("[a](<b c.md>)", &["b c.md"]),
            ("[a](  b.md  )", &["b.md"]),
            ("[a](b\\(1\\).md)", &["b(1).md"]),
            ("[a][r]\n\n[r]: b.md", &["b.md"]),
            ("[b.md][]\n\n[b.md]: b.md", &["b.md"]),
            ("<http://x>", &[]),
            ("[a](http://x/b.md)", &[]),
            ("[a](file:///x/b.md)", &[]),
            ("[a](mailto:x@y.z)", &[]),
            ("[a](#h)", &[]),
            ("[a](/abs/b.md)", &[]),
            ("[a](b.txt)", &[]),
            ("[a](b.md.txt)", &[]),
            ("[a](.md)", &[]),
            ("[a](b.MD.md)", &["b.MD.md"]),
            ("[a](b.markdown)", &["b.markdown"]),
            ("[a](b.md?x=1)", &["b.md?x=1"]),
            ("[a](b.md#^block)", &["b.md#^block"]),
            ("[a](b.md#h?x)", &["b.md#h?x"]),
            ("[a](notes/../b.md)", &["notes/../b.md"]),
            ("![i](b.md)", &[]),
            ("```\n[a](b.md)\n```", &[]),
            ("`[a](b.md)`", &[]),
            ("<span>[a](b.md)</span>", &[]),
            ("# [a](b.md)", &["b.md"]),
            ("- [a](b.md)", &["b.md"]),
            ("[**a**](b.md)", &["b.md"]),
            ("[a](b.md) and [c](b.md)", &["b.md", "b.md"]),
            ("[a](b.md)[c](d.md)", &["b.md", "d.md"]),
            ("[a](b.md \"t\") x [[b]]", &["b.md"]),
        ];

        for (markdown, expected) in cases {
            let links = markdown_links(markdown);
            let found: Vec<&str> = links
                .iter()
                .filter(|link| is_note_path(&link.target))
                .map(|link| link.target.as_str())
                .collect();
            assert_eq!(&found, expected, "scanning {markdown:?}");
        }
    }
}
