use std::collections::HashSet;

/// Tolerant parser for the tiny frontmatter dialect notras cares about.
///
/// Only `pinned`, `tags` and `title` are interpreted; everything else is
/// ignored (the TypeScript side preserves unknown keys verbatim when
/// rewriting). Kept as a hand-rolled parser so Rust and TS stay in parity over
/// a deliberately tiny format instead of dragging in a full YAML
/// implementation.
///
/// `title` is read-only: notras resolves a title from it but never authors it,
/// so it round-trips as a foreign key through the TypeScript serializer.
#[derive(Debug, Default, PartialEq)]
pub struct Frontmatter {
    pub pinned: bool,
    pub tags: Vec<String>,
    pub title: Option<String>,
}

pub struct Parsed<'a> {
    pub frontmatter: Frontmatter,
    /// The note body with the frontmatter block stripped.
    pub body: &'a str,
}

fn clean_tag(raw: &str) -> Option<String> {
    let tag = raw
        .trim()
        .trim_matches(|c| c == '"' || c == '\'')
        // Separators are dropped, never kept: a tag carrying one would
        // serialize into `tags: [a, b]` and re-parse as two tags.
        .replace([',', '[', ']'], "")
        .trim()
        .to_lowercase();

    if tag.is_empty() {
        None
    } else {
        Some(tag)
    }
}

/// A `title:` value with surrounding quotes stripped. An empty value counts as
/// absent so title resolution falls through to the next source.
fn clean_title(raw: &str) -> Option<String> {
    let title = raw.trim().trim_matches(|c| c == '"' || c == '\'').trim();

    if title.is_empty() {
        None
    } else {
        Some(title.to_string())
    }
}

fn parse_inline_tags(value: &str) -> Vec<String> {
    value
        .trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .split(',')
        .filter_map(clean_tag)
        .collect()
}

pub fn parse(content: &str) -> Parsed<'_> {
    let mut parsed = Parsed {
        frontmatter: Frontmatter::default(),
        body: content,
    };

    let Some(rest) = content
        .strip_prefix("---\n")
        .or_else(|| content.strip_prefix("---\r\n"))
    else {
        return parsed;
    };

    // Find the closing delimiter line.
    let mut close = None;
    let mut offset = 0;
    for line in rest.split_inclusive('\n') {
        let trimmed = line.trim_end();
        if trimmed == "---" || trimmed == "..." {
            close = Some((offset, offset + line.len()));
            break;
        }
        offset += line.len();
    }

    let Some((block_end, body_start)) = close else {
        return parsed;
    };

    let block = &rest[..block_end];
    parsed.body = &rest[body_start..];

    let mut in_tags_list = false;
    for line in block.lines() {
        let trimmed = line.trim_end();

        if in_tags_list {
            if let Some(item) = trimmed.trim_start().strip_prefix("- ") {
                if let Some(tag) = clean_tag(item) {
                    parsed.frontmatter.tags.push(tag);
                }
                continue;
            }
            in_tags_list = false;
        }

        let Some((key, value)) = trimmed.split_once(':') else {
            continue;
        };
        let value = value.trim();

        match key.trim() {
            "pinned" => {
                parsed.frontmatter.pinned = value.eq_ignore_ascii_case("true");
            }
            "tags" => {
                if value.is_empty() {
                    in_tags_list = true;
                } else {
                    parsed.frontmatter.tags = parse_inline_tags(value);
                }
            }
            "title" => {
                parsed.frontmatter.title = clean_title(value);
            }
            _ => {}
        }
    }

    // Dedupe by value, not just adjacency -- the TypeScript twin uses a Set.
    let mut seen = HashSet::new();
    parsed
        .frontmatter
        .tags
        .retain(|tag| seen.insert(tag.clone()));

    parsed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_frontmatter_returns_whole_body() {
        let parsed = parse("# hello\n");
        assert_eq!(parsed.body, "# hello\n");
        assert_eq!(parsed.frontmatter, Frontmatter::default());
    }

    #[test]
    fn parses_pinned_and_inline_tags() {
        let parsed = parse("---\npinned: true\ntags: [Errands, home]\n---\n- eggs\n");
        assert!(parsed.frontmatter.pinned);
        assert_eq!(parsed.frontmatter.tags, vec!["errands", "home"]);
        assert_eq!(parsed.body, "- eggs\n");
    }

    #[test]
    fn parses_block_list_tags() {
        let parsed = parse("---\ntags:\n  - \"work\"\n  - ideas\n---\nbody\n");
        assert_eq!(parsed.frontmatter.tags, vec!["work", "ideas"]);
        assert_eq!(parsed.body, "body\n");
    }

    #[test]
    fn ignores_unknown_keys_and_unclosed_blocks() {
        let parsed = parse("---\ncustom: thing\npinned: false\n---\nbody");
        assert!(!parsed.frontmatter.pinned);
        assert_eq!(parsed.body, "body");

        let unclosed = parse("---\npinned: true\nno close");
        assert!(!unclosed.frontmatter.pinned);
        assert_eq!(unclosed.body, "---\npinned: true\nno close");
    }

    #[test]
    fn dedupes_non_adjacent_tags() {
        let parsed = parse("---\ntags: [a, b, A]\n---\nbody");
        assert_eq!(parsed.frontmatter.tags, vec!["a", "b"]);
    }

    #[test]
    fn closes_on_a_delimiter_with_trailing_space() {
        let parsed = parse("---\npinned: true\n---  \nbody\n");
        assert!(parsed.frontmatter.pinned);
        assert_eq!(parsed.body, "body\n");

        let dots = parse("---\npinned: true\n...\nbody\n");
        assert!(dots.frontmatter.pinned);
        assert_eq!(dots.body, "body\n");
    }

    #[test]
    fn strips_separators_from_tags() {
        let parsed = parse("---\ntags:\n  - \"a,b\"\n---\nbody\n");
        assert_eq!(parsed.frontmatter.tags, vec!["ab"]);
    }

    #[test]
    fn parses_title_with_quotes_and_colons() {
        let plain = parse("---\ntitle: effect: a primer\n---\nbody\n");
        assert_eq!(
            plain.frontmatter.title,
            Some("effect: a primer".to_string())
        );

        let quoted = parse("---\ntitle: \"effect: a primer\"\n---\nbody\n");
        assert_eq!(
            quoted.frontmatter.title,
            Some("effect: a primer".to_string())
        );

        let single = parse("---\ntitle: 'my note'\n---\nbody\n");
        assert_eq!(single.frontmatter.title, Some("my note".to_string()));
    }

    #[test]
    fn treats_an_empty_title_as_absent() {
        let empty = parse("---\ntitle:\n---\nbody\n");
        assert_eq!(empty.frontmatter.title, None);

        let blank = parse("---\ntitle: \"\"\n---\nbody\n");
        assert_eq!(blank.frontmatter.title, None);

        let missing = parse("---\npinned: true\n---\nbody\n");
        assert_eq!(missing.frontmatter.title, None);
    }

    #[test]
    fn handles_crlf() {
        let parsed = parse("---\r\npinned: true\r\n---\r\nbody\r\n");
        assert!(parsed.frontmatter.pinned);
        assert_eq!(parsed.body, "body\r\n");
    }
}
