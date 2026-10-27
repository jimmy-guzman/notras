use std::ops::Range;

use pulldown_cmark::{Event, LinkType, Options, Parser, Tag, TagEnd};
use unicode_properties::general_category::{GeneralCategoryGroup, UnicodeGeneralCategory};

use crate::frontmatter;

/// GFM as the editor reads it, short of its bare autolinks, which `autolinks`
/// finds in prose.
const OPTIONS: Options = Options::ENABLE_TABLES
    .union(Options::ENABLE_TASKLISTS)
    .union(Options::ENABLE_STRIKETHROUGH);

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

/// The value an attribute carries and what follows it, per CommonMark's
/// attribute grammar: double-quoted, single-quoted, or a bare run.
fn attribute_value(html: &str) -> Option<(&str, &str)> {
    for quote in ['"', '\''] {
        if let Some(rest) = html.strip_prefix(quote) {
            let end = rest.find(quote)?;
            return Some((&rest[..end], &rest[end + 1..]));
        }
    }
    let end = html
        .find(|c: char| c.is_whitespace() || matches!(c, '"' | '\'' | '=' | '<' | '>' | '`'))
        .unwrap_or(html.len());
    (end > 0).then(|| (&html[..end], &html[end..]))
}

/// Kept in parity with `imageTagAttrs` in `src/components/editor/image-tag.ts`,
/// which `fixtures/image-tags.json` checks on both sides: one complete `<img>`
/// tag carrying only `src`, `alt`, `title` and a whole positive `width`. Rich
/// mode draws that tag as an image rather than code, so the search body leaves
/// it out the way it leaves out a markdown image.
pub(crate) fn is_image_tag(html: &str) -> bool {
    let Some(rest) = html.strip_prefix('<') else {
        return false;
    };
    let name_len = rest.chars().take_while(char::is_ascii_alphanumeric).count();
    if !rest[..name_len].eq_ignore_ascii_case("img") {
        return false;
    }
    let mut rest = &rest[name_len..];
    let mut has_src = false;
    loop {
        let trimmed = rest.trim_start();
        if let Some(after) = trimmed
            .strip_prefix("/>")
            .or_else(|| trimmed.strip_prefix('>'))
        {
            return has_src && after.is_empty();
        }
        if trimmed.len() == rest.len() {
            return false;
        }
        let name_len = trimmed
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | ':' | '.' | '-'))
            .count();
        if name_len == 0 {
            return false;
        }
        let name = trimmed[..name_len].to_ascii_lowercase();
        let after_name = &trimmed[name_len..];
        let (value, after_value) = match after_name.trim_start().strip_prefix('=') {
            Some(after_equals) => match attribute_value(after_equals.trim_start()) {
                Some((value, after_value)) => (Some(value), after_value),
                None => return false,
            },
            None => (None, after_name),
        };
        match name.as_str() {
            "src" => has_src = true,
            "alt" | "title" => {}
            "width" => {
                let whole = value.is_some_and(|value| {
                    !value.starts_with('0')
                        && !value.is_empty()
                        && value.bytes().all(|b| b.is_ascii_digit())
                });
                if !whole {
                    return false;
                }
            }
            _ => return false,
        }
        rest = after_value;
    }
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

/// A byte mask over `len` bytes that holds inside any of `spans`.
fn span_mask(len: usize, spans: impl IntoIterator<Item = Range<usize>>) -> Vec<bool> {
    let mut mask = vec![false; len];
    for span in spans {
        mask[span].fill(true);
    }
    mask
}

struct Scan<'a> {
    link_spans: Vec<Range<usize>>,
    links: Vec<(usize, String)>,
    prose: Vec<bool>,
    wikilinks: Vec<(usize, &'a str)>,
}

/// What the editor draws, byte by byte: true for prose, false for what its
/// parser reads as code, HTML, a link destination, or an image, which it draws
/// without its description. Wikilinks and embeds come from `masked_wikilinks`,
/// and one counts where its first byte is prose.
///
/// CommonMark decides the blocks, so a fence, an indented block and a backtick
/// span are opaque on both sides. Emphasis delimiters are prose, since the
/// editor's tokenizer takes `[[**a**]]` whole. Text between a matching pair of
/// inline tags is opaque too, because the editor parses that stretch as HTML
/// rather than markdown, while an unmatched tag hides only itself.
fn scan(body: &str) -> Scan<'_> {
    let (drawn, masked) = masked_wikilinks(body);
    let mut prose = vec![false; body.len()];
    let mut opaque: Vec<Range<usize>> = Vec::new();
    let mut open_tags: Vec<(String, usize)> = Vec::new();
    let mut links = Vec::new();
    let mut link_spans: Vec<Range<usize>> = drawn.iter().map(|link| link.span.clone()).collect();

    for (event, range) in Parser::new_ext(&masked, OPTIONS).into_offset_iter() {
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
                Tag::Image { .. } => {
                    opaque.push(range.clone());
                    link_spans.push(range);
                }
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

    // A bare URL runs on through a link that follows it with no space, which
    // the editor then draws as part of the URL.
    let bare = autolinks(body, &masked, &prose, &link_spans);
    let swallowed = span_mask(body.len(), bare.iter().map(|(at, _, end)| *at..*end));
    links.retain(|(at, _)| !swallowed[*at]);
    for (at, target, end) in bare {
        links.push((at, target));
        link_spans.push(at..end);
    }
    links.sort_by_key(|(at, _)| *at);

    let wikilinks = drawn
        .iter()
        .filter(|link| prose[link.span.start])
        .map(|link| (link.span.start + usize::from(link.embed), link.target))
        .collect();

    Scan {
        link_spans,
        links,
        prose,
        wikilinks,
    }
}

/// `raw` less the trailing punctuation GFM leaves out of a bare URL.
/// `next_close` gives the offset in `raw` of the first `)` at or after an
/// offset, so a run of unclosed `(` is not searched once per URL.
fn trim_autolink(raw: &str, next_close: impl Fn(usize) -> Option<usize>) -> &str {
    let mut end = 0;
    while end < raw.len() {
        let rest = &raw[end..];
        let ch = rest.chars().next().unwrap();
        if ch == '(' {
            let Some(close) = next_close(end) else {
                break;
            };
            end = close + 1;
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
    // The same byte class as `email_local_ends`, which `autolinks` reads to
    // skip a run whose `@` already failed.
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

fn bare_url(raw: &str, next_close: impl Fn(usize) -> Option<usize>) -> Option<(&str, String)> {
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
        })?;
    if !raw
        .as_bytes()
        .get(prefix.len())
        .is_some_and(|c| c.is_ascii_alphanumeric() || *c == b'-')
    {
        return None;
    }
    let value = trim_autolink(raw, next_close);
    let target = if prefix == "www." {
        format!("http://{value}")
    } else {
        value.to_string()
    };

    Some((value, target))
}

/// Whether the editor leaves open an emphasis span that CommonMark closes at
/// `range.end`. GFM in the editor's parser counts `~` as a letter when it
/// decides whether a `*` run can close, so a `*` run with Unicode punctuation
/// or a symbol other than `~` before it and `~` after it closes nothing there, as in
/// `*a(b)*~~c~~`. A `_` run closes there in both parsers. A nested span ends
/// inside the run, so the whole run is read on both sides.
fn editor_keeps_open(text: &str, range: &Range<usize>) -> bool {
    let span = &text[range.start..range.end];
    let before = span.trim_end_matches('*').chars().next_back();

    span.ends_with('*')
        && text[range.end..].trim_start_matches('*').starts_with('~')
        && before.is_some_and(|ch| {
            ch != '~'
                && matches!(
                    ch.general_category_group(),
                    GeneralCategoryGroup::Punctuation | GeneralCategoryGroup::Symbol
                )
        })
}

/// Where a bare URL starting at each byte of `text` has to end: at whitespace,
/// `<`, the end of its block, or the closing delimiter of emphasis it starts
/// inside. The editor's URL rule, `[^\s<]*`, runs on through code, escapes and
/// emphasis that opens after the URL starts, while emphasis around the URL
/// lexes its content on its own.
fn url_ends(text: &str) -> Vec<usize> {
    let mut in_block = vec![false; text.len()];
    // Pulldown starts an outer span before the spans inside it, so an inner
    // span's end overwrites the outer one's and each byte keeps its innermost.
    let mut closes = vec![text.len(); text.len()];
    for (event, range) in Parser::new_ext(text, OPTIONS).into_offset_iter() {
        match event {
            Event::Start(Tag::Paragraph | Tag::Heading { .. } | Tag::TableCell | Tag::Item) => {
                in_block[range].fill(true);
            }
            Event::Start(Tag::Emphasis | Tag::Strong | Tag::Strikethrough)
                if !editor_keeps_open(text, &range) =>
            {
                closes[range.clone()].fill(range.end);
            }
            _ => {}
        }
    }

    let mut ends = vec![text.len(); text.len()];
    let mut stop = text.len();
    for (at, ch) in text.char_indices().rev() {
        if !in_block[at] || ch.is_whitespace() || ch == '<' {
            stop = at;
        }
        ends[at] = stop.min(closes[at]);
    }

    ends
}

/// Each byte's offset of the end of the email local part it starts, the run
/// of bytes `bare_email` accepts before an `@`.
fn email_local_ends(body: &str) -> Vec<usize> {
    let mut ends = vec![body.len(); body.len() + 1];
    for (at, byte) in body.bytes().enumerate().rev() {
        let local = byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'+' | b'-');
        ends[at] = if local { ends[at + 1] } else { at };
    }
    ends
}

/// Each byte's offset of the first `)` at or after it, or `body.len()`.
fn next_closing_parens(body: &str) -> Vec<usize> {
    let mut closes = vec![body.len(); body.len() + 1];
    for (at, byte) in body.bytes().enumerate().rev() {
        closes[at] = if byte == b')' { at } else { closes[at + 1] };
    }
    closes
}

/// GFM bare destinations that start inside parser-approved prose, ending where
/// `url_ends` reads them in `parsed`, the text CommonMark parsed. Explicit
/// links and wikilinks own their spans, so their labels never produce nested
/// links.
///
/// A long run with no space would cost a scan per byte, so each byte's end,
/// email local part and next `)` are found once, and an `@` that fails as an
/// email is not read again from the same run.
fn autolinks(
    body: &str,
    parsed: &str,
    prose: &[bool],
    spans: &[Range<usize>],
) -> Vec<(usize, String, usize)> {
    // Every bare URL holds `://` or `www.` and every email an `@`, so a body
    // with none of them skips the parse `url_ends` makes. On a 188 KB note
    // with no address that parse cost about a quarter of the scan.
    if !(body.contains("://") || body.contains("www.") || body.contains('@')) {
        return Vec::new();
    }
    let linked = span_mask(body.len(), spans.iter().cloned());
    let bytes = body.as_bytes();
    let ends = url_ends(parsed);
    let local_ends = email_local_ends(body);
    let closes = next_closing_parens(body);
    let mut failed_email = None;
    let mut found = Vec::new();
    let mut until = 0;
    for (at, _) in body.char_indices() {
        if at < until || !prose[at] || linked[at] {
            continue;
        }
        let at_sign = local_ends[at];
        let email = at_sign > at && bytes.get(at_sign) == Some(&b'@');
        let end = ends[at];
        let raw = &body[at..end];
        let next_close =
            |offset: usize| (closes[at + offset] < end).then(|| closes[at + offset] - at);
        let destination = match bare_url(raw, next_close) {
            Some(url) => Some(url),
            None if email && failed_email != Some((at_sign, end)) => {
                let value = bare_email(raw);
                if value.is_none() {
                    failed_email = Some((at_sign, end));
                }
                value.map(|value| (value, format!("mailto:{value}")))
            }
            None => None,
        };
        if let Some((value, target)) = destination {
            until = at + value.len();
            found.push((at, target, until));
        }
    }
    found
}

/// The byte offset each line of `body` starts at, so a note with thousands of
/// links counts its newlines once rather than once per link.
fn line_starts(body: &str) -> Vec<usize> {
    std::iter::once(0)
        .chain(body.match_indices('\n').map(|(at, _)| at + 1))
        .collect()
}

/// How much of a long line a link keeps around itself as its context. Storing
/// the whole line for each of thousands of links on one line grows the index
/// as links times line length, and the mentions row shows 32 characters before
/// a link and what fits after it.
const CONTEXT_BEFORE: usize = 160;
const CONTEXT_AFTER: usize = 400;

/// The 1-based line holding byte `at`, and that line's text, cut to a window
/// around `at` when the line is long.
fn line_at<'a>(body: &'a str, starts: &[usize], at: usize) -> (usize, &'a str) {
    let line = starts.partition_point(|&start| start <= at);
    let line_end = starts.get(line).map_or(body.len(), |next| next - 1);
    let from = body.floor_char_boundary(at.saturating_sub(CONTEXT_BEFORE).max(starts[line - 1]));
    let to = body.ceil_char_boundary((at + CONTEXT_AFTER).min(line_end));

    (line, body[from..to].trim_end_matches('\r'))
}

fn prose_ranges(mask: &[bool]) -> Vec<Range<usize>> {
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

/// Every `[[target]]` in `body`, read the way the editor's tokenizer reads it:
/// the target holds no bracket and no newline, a `[[` that opens nothing is
/// text, and a bracket behind an odd run of backslashes is escaped. Yields each
/// target with the byte offset of its `[[`.
fn wikilink_targets(body: &str) -> Vec<(usize, &str)> {
    let mut found = Vec::new();
    let mut at = 0;

    while let Some(offset) = body[at..].find("[[") {
        let open = at + offset;
        let inner = open + 2;
        let escaped = body[..open]
            .bytes()
            .rev()
            .take_while(|&byte| byte == b'\\')
            .count()
            % 2
            == 1;
        let target = body[inner..]
            .find(']')
            .map(|end| &body[inner..inner + end])
            .filter(|target| !target.is_empty() && !target.contains(['[', '\n']))
            .filter(|target| body[inner + target.len()..].starts_with("]]"));

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

/// A `[[target]]`, or an `![[target]]` embed when `embed` is set, whose bytes
/// `span` holds, the embed's `!` included.
struct DrawnWikilink<'a> {
    embed: bool,
    span: Range<usize>,
    target: &'a str,
}

/// Every wikilink and embed the editor's grammar reads, before CommonMark has
/// a say. A `!` behind an odd run of backslashes is text, and the wikilink
/// after it stays a wikilink.
fn wikilink_candidates(body: &str) -> Vec<DrawnWikilink<'_>> {
    wikilink_targets(body)
        .into_iter()
        .map(|(open, target)| {
            let embed = body[..open].strip_suffix('!').is_some_and(|before| {
                before
                    .bytes()
                    .rev()
                    .take_while(|&byte| byte == b'\\')
                    .count()
                    % 2
                    == 0
            });

            DrawnWikilink {
                embed,
                span: open - usize::from(embed)..open + target.len() + 4,
                target,
            }
        })
        .collect()
}

/// Which of `candidates` the editor draws, given how CommonMark parses `text`.
/// The editor's tokenizer tries a `[[` before anything else at its byte, so a
/// link, image or code span that opens there or inside it loses to it. Code,
/// HTML, an image, an autolink or a bare URL that opens before it hides it, and
/// none is drawn in a link destination, in a definition, or across a table
/// cell.
fn editor_draws(text: &str, candidates: &[DrawnWikilink<'_>]) -> Vec<bool> {
    let mut visible = vec![false; text.len()];
    let mut opens = vec![false; text.len()];
    let mut hidden = vec![false; text.len()];
    let mut cells = Vec::new();
    let mut explicit = Vec::new();

    for (event, range) in Parser::new_ext(text, OPTIONS).into_offset_iter() {
        let hides = match &event {
            Event::Text(_) => {
                visible[range.clone()].fill(true);
                false
            }
            Event::Code(_) | Event::InlineHtml(_) => {
                opens[range.start] = true;
                true
            }
            Event::Html(_)
            | Event::Start(
                Tag::CodeBlock(_)
                | Tag::HtmlBlock
                | Tag::Link {
                    link_type: LinkType::Autolink | LinkType::Email,
                    ..
                },
            ) => true,
            Event::Start(Tag::Image { .. }) => {
                opens[range.start] = true;
                explicit.push(range.clone());
                true
            }
            Event::Start(Tag::Link { .. }) => {
                opens[range.start] = true;
                explicit.push(range.clone());
                false
            }
            Event::Start(Tag::Emphasis | Tag::Strong | Tag::Strikethrough) => {
                opens[range.start] = true;
                false
            }
            Event::Start(Tag::TableCell) => {
                cells.push(range.clone());
                false
            }
            _ => false,
        };
        if hides {
            hidden[range.start + 1..range.end].fill(true);
        }
    }
    for (at, _, end) in autolinks(text, text, &visible, &explicit) {
        hidden[at + 1..end].fill(true);
    }

    candidates
        .iter()
        .map(|link| {
            let start = link.span.start;
            let last = link.span.end - 1;
            let reached = visible[start] || opens[link.span.clone()].contains(&true);
            let split = cells
                .iter()
                .any(|cell| cell.contains(&start) != cell.contains(&last));

            reached && !hidden[start] && !split
        })
        .collect()
}

/// The wikilinks and embeds the editor draws in `text`, and `text` with each
/// of their bytes turned to `%`, so CommonMark reads them as plain text and
/// opens no link, image or code span inside one. `%` is punctuation like the
/// brackets it replaces, so emphasis beside a wikilink flanks the same way.
/// Masking a wikilink can end a code span that hid a later one, so the
/// decisions repeat until they settle.
fn masked_wikilinks(text: &str) -> (Vec<DrawnWikilink<'_>>, String) {
    let candidates = wikilink_candidates(text);
    if candidates.is_empty() {
        return (candidates, text.to_owned());
    }
    let mut kept = vec![false; candidates.len()];
    let mut masked = text.to_owned();

    // Each round that changes a decision is followed by another, and a note
    // that never settles keeps the last round's.
    for _ in 0..=candidates.len() {
        let next = editor_draws(&masked, &candidates);
        if next == kept {
            break;
        }
        kept = next;
        let mut bytes = text.as_bytes().to_vec();
        for (link, _) in candidates.iter().zip(&kept).filter(|(_, kept)| **kept) {
            bytes[link.span.clone()].fill(b'%');
        }
        masked = String::from_utf8(bytes).expect("a span starts and ends on an ASCII bracket");
    }

    let drawn = candidates
        .into_iter()
        .zip(kept)
        .filter_map(|(link, kept)| kept.then_some(link))
        .collect();

    (drawn, masked)
}

pub(crate) struct BodyTitle {
    pub text: String,
    pub line: usize,
}

/// `text[range]` with each wikilink inside it read as its target, as written,
/// and each embed as nothing.
fn titled(text: &str, range: Range<usize>, wikilinks: &[DrawnWikilink<'_>]) -> String {
    let mut titled = String::new();
    let mut at = range.start;

    for link in wikilinks
        .iter()
        .filter(|link| range.contains(&link.span.start))
    {
        titled.push_str(&text[at..link.span.start]);
        if !link.embed {
            titled.push_str(link.target);
        }
        at = link.span.end;
    }
    titled.push_str(&text[at..range.end]);

    titled
}

/// The first readable source line of `text`.
fn readable_line(text: &str) -> Option<BodyTitle> {
    let (wikilinks, masked) = masked_wikilinks(text);
    let mut excluded = 0;
    let mut title = String::new();
    let mut title_line = None;
    for (event, range) in Parser::new_ext(&masked, OPTIONS).into_offset_iter() {
        if excluded > 0 {
            match event {
                Event::Start(_) => excluded += 1,
                Event::End(_) => excluded -= 1,
                _ => {}
            }
            continue;
        }
        let part = match event {
            Event::Start(
                Tag::CodeBlock(_) | Tag::HtmlBlock | Tag::Table(_) | Tag::Image { .. },
            ) => {
                excluded = 1;
                continue;
            }
            Event::Text(part) => {
                if wikilinks
                    .iter()
                    .any(|link| range.contains(&link.span.start))
                {
                    titled(text, range.clone(), &wikilinks).into()
                } else {
                    part
                }
            }
            Event::Code(part) => part,
            Event::SoftBreak
            | Event::HardBreak
            | Event::End(TagEnd::Paragraph | TagEnd::Heading(_) | TagEnd::Item) => {
                if title_line.is_some() {
                    break;
                }
                continue;
            }
            _ => continue,
        };
        let line = text[..range.start]
            .bytes()
            .filter(|byte| *byte == b'\n')
            .count();
        if title_line.is_some_and(|previous| previous != line) {
            break;
        }
        if part.chars().any(|ch| !frontmatter::is_space(ch)) {
            title_line = Some(line);
        }
        title.push_str(&part);
    }
    title_line.map(|line| BodyTitle {
        text: title
            .split(frontmatter::is_space)
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join(" "),
        line,
    })
}

/// Enough for a title and the block after it in nearly every note.
const TITLE_WINDOW: usize = 2048;

/// Whether a `[label]: destination` sits anywhere in `body`, which can resolve
/// a `[label]` above it.
fn has_link_definition(body: &str) -> bool {
    body.match_indices("]:").any(|(at, _)| {
        body[..at]
            .rfind(['[', ']', '\n'])
            .is_some_and(|open| body.as_bytes()[open] == b'[')
    })
}

/// Whether `line` ends a paragraph above it whatever follows: a blank line, or
/// an ATX heading, a fence or a non-empty list item at most three spaces in:
/// some of the starts CommonMark lets interrupt a paragraph. A quote, a rule
/// or an HTML start also interrupts one, and leaving them out only widens the
/// window. `PARAGRAPH_BREAK` in `src/core/notes.ts` is the same test.
fn breaks_paragraph(line: &str) -> bool {
    let line = line.trim_end_matches('\r');
    let rest = line.trim_start_matches(' ');
    if rest.bytes().all(|byte| matches!(byte, b' ' | b'\t')) {
        return true;
    }
    if line.len() - rest.len() > 3 {
        return false;
    }
    let hashes = rest.bytes().take_while(|&byte| byte == b'#').count();
    let heading = (1..=6).contains(&hashes)
        && rest[hashes..]
            .chars()
            .next()
            .is_none_or(|ch| matches!(ch, ' ' | '\t'));
    let ticks = rest.bytes().take_while(|&byte| byte == b'`').count();
    let fence = (ticks >= 3 && !rest[ticks..].contains('`')) || rest.starts_with("~~~");
    let item = rest
        .strip_prefix(['-', '+', '*'])
        .or_else(|| rest.strip_prefix("1."))
        .or_else(|| rest.strip_prefix("1)"))
        .is_some_and(|after| {
            after.starts_with([' ', '\t']) && !after.trim_matches([' ', '\t']).is_empty()
        });

    heading || fence || item
}

/// Whether a whole line after line `line` of `window` ends the title's
/// paragraph, so no later line can close a link or code span the title line
/// opens, or turn it into a table header or a setext heading.
fn ends_title_paragraph(window: &str, line: usize) -> bool {
    window
        .rsplit_once('\n')
        .is_some_and(|(whole, _)| whole.split('\n').skip(line + 1).any(breaks_paragraph))
}

/// The first readable source line, matching `bodyTitle` in TypeScript.
///
/// Reading wikilinks parses the text more than once, so like `bodyTitle` this
/// reads a window from the start that doubles until it holds the answer: the
/// title, with a line after it that ends its paragraph.
pub(crate) fn body_title(body: &str) -> Option<BodyTitle> {
    std::iter::successors(Some(TITLE_WINDOW), |end| end.checked_mul(2))
        .take_while(|end| *end < body.len())
        .find_map(|end| {
            let window = &body[..body.floor_char_boundary(end)];

            // An unresolved reference keeps its brackets, and a definition
            // further down would resolve it.
            readable_line(window).filter(|found| {
                ends_title_paragraph(window, found.line)
                    && !(found.text.contains('[') && has_link_definition(body))
            })
        })
        .or_else(|| readable_line(body))
}

/// Readable body title, imported title, then filename stem, matching TypeScript.
pub(crate) fn resolve_title(parsed: &frontmatter::Parsed<'_>, rel_path: &str) -> String {
    body_title(parsed.body)
        .map(|title| title.text)
        .or_else(|| parsed.frontmatter.title.clone())
        .unwrap_or_else(|| title_of(rel_path))
}

/// The body text rich mode shows, less reference definitions, which is what
/// search indexes. Link destinations and images show as no text in the editor,
/// so a hit on them could never be found in the note. A definition shows as
/// code, but it holds a link's destination, so it is left out the way an inline
/// link's destination is. `link:` finds the destinations links use.
pub(crate) fn readable_text(body: &str) -> String {
    let mut text = String::new();
    let mut images = 0_usize;
    // An HTML block arrives one line per event, and whether rich mode draws it
    // as an image is a question about the whole block.
    let mut html_block: Option<String> = None;
    for event in Parser::new_ext(body, OPTIONS) {
        match event {
            Event::Start(Tag::Image { .. }) => images += 1,
            // Find reads an image as a line break, so it splits words here too.
            Event::End(TagEnd::Image) => {
                images -= 1;
                text.push('\n');
            }
            Event::Start(Tag::HtmlBlock) => html_block = Some(String::new()),
            Event::End(TagEnd::HtmlBlock) => {
                let block = html_block.take().unwrap_or_default();
                if !is_image_tag(block.trim_end()) {
                    text.push_str(&block);
                }
                text.push('\n');
            }
            Event::Html(part) => {
                if let Some(block) = html_block.as_mut() {
                    block.push_str(&part);
                }
            }
            Event::InlineHtml(part) if images == 0 => {
                if is_image_tag(&part) {
                    text.push('\n');
                } else {
                    text.push_str(&part);
                }
            }
            Event::Text(part) | Event::Code(part) if images == 0 => {
                text.push_str(&part);
            }
            Event::End(
                TagEnd::Emphasis
                | TagEnd::Strong
                | TagEnd::Strikethrough
                | TagEnd::Link
                | TagEnd::Superscript
                | TagEnd::Subscript,
            ) => {}
            Event::SoftBreak | Event::HardBreak | Event::End(_) => text.push('\n'),
            _ => {}
        }
    }
    text.truncate(text.trim_end_matches('\n').len());
    text
}

/// Kept in parity with the editor's tokenizer: `should_find_the_wikilinks_the_editor_renders`
/// below and `src/components/editor/wikilink.spec.ts` assert one table of cases.
pub(crate) fn wikilinks(body: &str) -> Vec<Wikilink<'_>> {
    let starts = line_starts(body);

    scan(body)
        .wikilinks
        .into_iter()
        .map(|(open, target)| {
            let (line, context) = line_at(body, &starts, open);

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
/// `should_find_the_markdown_note_links_the_editor_renders` below and
/// `src/components/editor/markdown-link.spec.ts` assert one table of cases.
pub(crate) fn destinations(body: &str) -> Vec<MarkdownLink<'_>> {
    let starts = line_starts(body);

    scan(body)
        .links
        .into_iter()
        .map(|(open, target)| {
            let (line, context) = line_at(body, &starts, open);

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
/// already. The readable line naming the note is excluded from mentions.
pub(crate) fn bare_mentions<'a>(
    body: &'a str,
    title: &str,
    exclude_title_line: bool,
) -> Vec<(usize, &'a str)> {
    let needle: Vec<char> = title.chars().flat_map(char::to_lowercase).collect();
    let Scan {
        link_spans: links,
        prose,
        ..
    } = scan(body);
    let title_line = exclude_title_line
        .then(|| body_title(body))
        .flatten()
        .map(|title| title.line);
    let is_word = |ch: char| ch.is_alphanumeric() || ch == '_';
    let starts = line_starts(body);
    let mut found = Vec::new();

    for range in prose_ranges(&prose) {
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
            let (line, context) = line_at(body, &starts, start);

            if !bounded || linked || title_line == Some(line - 1) {
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

    #[test]
    fn should_resolve_the_shared_readable_title_cases() {
        let cases: serde_json::Value =
            serde_json::from_str(include_str!("../../../fixtures/note-titles.json")).unwrap();
        for case in cases.as_array().unwrap() {
            let content = case["content"].as_str().unwrap();
            let parsed = frontmatter::parse(content);
            assert_eq!(
                resolve_title(&parsed, case["path"].as_str().unwrap()),
                case["expected"].as_str().unwrap(),
                "{}",
                case["name"]
            );
            assert_eq!(
                body_title(parsed.body).map(|title| title.line as u64),
                case["line"].as_u64(),
                "{}",
                case["name"]
            );
        }
    }

    #[test]
    fn should_leave_destinations_images_and_definitions_out_of_readable_text() {
        let text = readable_text(
            "See the [roadmap](https://hidden.example/plan) and ![diagram alt](hidden.png).\n\n\
             word![inline](x.png)next\n\n\
             [ref]: https://also.hidden/definition\n",
        );

        assert!(text.contains("roadmap"));
        assert!(!text.contains("wordnext"), "{text:?}");
        for hidden in ["hidden", "diagram", "definition"] {
            assert!(!text.contains(hidden), "{hidden} in {text:?}");
        }
    }

    #[test]
    fn should_recognize_the_image_tags_the_editor_draws() {
        let cases: serde_json::Value =
            serde_json::from_str(include_str!("../../../fixtures/image-tags.json")).unwrap();
        for case in cases.as_array().unwrap() {
            assert_eq!(
                is_image_tag(case["html"].as_str().unwrap()),
                case["image"].as_bool().unwrap(),
                "{}",
                case["name"]
            );
        }
    }

    #[test]
    fn should_leave_out_of_readable_text_the_image_tags_rich_mode_draws() {
        let text = readable_text(
            "<img src=\"attachments/shot.png\" alt=\"shot\" width=\"400\">\n\n\
             word<img src=\"x.png\">next\n\n\
             <img src=\"y.png\">\ncaption\n\n\
             <img src=\"z.png\" style=\"width: 1px\">\n",
        );

        assert!(!text.contains("shot") && !text.contains("400"), "{text:?}");
        assert!(!text.contains("wordnext"), "{text:?}");
        assert!(text.contains("<img src=\"y.png\">\ncaption"), "{text:?}");
        assert!(text.contains("<img src=\"z.png\" style"), "{text:?}");
    }

    #[test]
    fn should_keep_in_readable_text_what_rich_mode_shows() {
        let text = readable_text(
            "Ada **Lovelace** wrote `notes` and [[Atlas]].\n\n\
             | left | right |\n| --- | --- |\n| cell | other |\n\n\
             <kbd>raw</kbd>\n\n```ts\nconst fenced = 1;\n```\n",
        );

        assert!(text.contains("Ada Lovelace"), "{text:?}");
        for shown in ["notes", "[[Atlas]]", "<kbd>raw</kbd>", "const fenced = 1;"] {
            assert!(text.contains(shown), "{shown} missing from {text:?}");
        }
        assert!(!text.contains("leftright") && !text.contains("cellother"));
    }

    /// The extension strips case-insensitively, the same way `noteTitle` does in
    /// TypeScript, so the index and the open note cannot disagree.
    #[test]
    fn should_strip_the_markdown_extension_case_insensitively() {
        let parsed = frontmatter::parse("");
        assert_eq!(resolve_title(&parsed, "NOTE.MD"), "NOTE");
        assert_eq!(resolve_title(&parsed, "note.md"), "note");
        assert_eq!(resolve_title(&parsed, "Note.Markdown"), "Note");
        assert_eq!(resolve_title(&parsed, "note.markdown"), "note");
        // Not an extension, so nothing is stripped.
        assert_eq!(resolve_title(&parsed, "notes.txt"), "notes.txt");
        assert_eq!(resolve_title(&parsed, ".md"), "");
    }

    #[test]
    fn should_keep_a_window_of_a_long_line_as_a_link_context() {
        let long = format!("{}[[a]]{}\nnext", "x ".repeat(1000), " y".repeat(1000));
        let links = wikilinks(&long);

        assert_eq!(links[0].line, 1);
        assert!(links[0].context.contains("[[a]]"));
        assert!(links[0].context.len() <= CONTEXT_BEFORE + CONTEXT_AFTER);
        assert_eq!(wikilinks("see [[a]] here\r\n")[0].context, "see [[a]] here");
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
            // An embed links to its note, and an escaped `!` leaves a plain wikilink.
            ("![[a]]", &["a"]),
            ("\\![[a]]", &["a"]),
            // A bracket inside the target, or nothing inside, opens no link.
            ("[[a]b]]", &[]),
            ("[[[a]]]", &["a"]),
            ("[[a]]]", &["a"]),
            ("[[]]", &[]),
            // A wikilink takes its bytes before a link or code span opens in them.
            ("[[a]](u)", &["a"]),
            ("[[`a`]]", &["`a`"]),
            ("[[a`]] [[b]] `c`", &["a`", "b"]),
            // A bare URL that runs into a wikilink takes it.
            ("http://x[[a]]", &[]),
            ("http://x**y**[[a]]", &[]),
            ("http://x`y`[[a]]", &[]),
            ("www.x*y*[[a]]", &[]),
            // A bare URL inside emphasis ends where the emphasis closes.
            ("*http://x*[[a]]", &["a"]),
            ("**http://x**[[a]]", &["a"]),
            ("~~http://x~~[[a]]", &["a"]),
            ("_http://x_[[a]]", &["a"]),
            ("a *b http://x*[[c]]", &["c"]),
            ("x*http://y*[[a]]", &["a"]),
            ("*http://x*~~[[a]]~~", &["a"]),
            ("*http://x*_[[a]]_", &["a"]),
            ("**http://x**__[[a]]__", &["a"]),
            // The editor closes no emphasis at a `*` between punctuation and `~`.
            ("*http://x(a)*~~[[b]]~~", &[]),
            ("***http://x(a)***~~[[b]]~~", &[]),
            ("_http://x(a)_~~[[b]]~~", &["b"]),
            ("*http://xe\u{301}*~~[[b]]~~", &["b"]),
            ("*http://x$*~~[[b]]~~", &[]),
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
            // An image's description is not prose.
            ("![see [[a]]](x)", &[]),
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
            ("[[a]](b.md)", &[]),
            ("see http://x[a](b.md)", &[]),
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
