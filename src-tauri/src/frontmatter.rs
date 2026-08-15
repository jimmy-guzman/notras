/// Tolerant parser for the tiny frontmatter dialect notras cares about.
///
/// Only `pinned` and `tags` are interpreted; everything else is ignored (the
/// TypeScript side preserves unknown keys verbatim when rewriting). Kept as a
/// hand-rolled parser so Rust and TS stay in parity over a deliberately tiny
/// format instead of dragging in a full YAML implementation.
#[derive(Debug, Default, PartialEq)]
pub struct Frontmatter {
    pub pinned: bool,
    pub tags: Vec<String>,
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
        .trim()
        .to_lowercase();

    if tag.is_empty() {
        None
    } else {
        Some(tag)
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
        let trimmed = line.trim_end_matches(['\r', '\n']);
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
            _ => {}
        }
    }

    parsed.frontmatter.tags.dedup();
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
    fn handles_crlf() {
        let parsed = parse("---\r\npinned: true\r\n---\r\nbody\r\n");
        assert!(parsed.frontmatter.pinned);
        assert_eq!(parsed.body, "body\r\n");
    }
}
