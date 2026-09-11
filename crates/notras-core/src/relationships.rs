use std::collections::{BTreeMap, BTreeSet, HashMap};

use serde::{Deserialize, Serialize};

use crate::{frontmatter, index, markdown, queries::NoteMeta};

#[derive(Clone, Debug, Deserialize)]
pub struct NoteLink {
    pub context: String,
    pub kind: String,
    pub line: usize,
    pub path: String,
    pub target: String,
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct MentionLine {
    pub context: String,
    #[cfg_attr(feature = "bindings", specta(type = f64))]
    pub line: usize,
    pub r#match: String,
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Clone, Debug, Serialize)]
pub struct Mention {
    pub lines: Vec<MentionLine>,
    pub note: NoteMeta,
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Hub {
    Folder { folder: String },
    Tag { tag: String },
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Debug, Serialize)]
pub struct HubPill {
    #[cfg_attr(feature = "bindings", specta(type = f64))]
    pub count: usize,
    pub hub: Hub,
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum RingMember {
    Hub { pill: HubPill },
    Note { note: NoteMeta },
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Debug, Serialize)]
pub struct Graph {
    pub dangling: Vec<String>,
    pub hubs: Vec<HubPill>,
    pub incoming: Vec<Mention>,
    pub outgoing: Vec<Mention>,
}

fn folder(path: &str) -> &str {
    path.rsplit_once('/').map_or("", |(parent, _)| parent)
}

fn escaped_byte(bytes: &[u8]) -> Option<u8> {
    if bytes.first() != Some(&b'%') {
        return None;
    }
    let high = (*bytes.get(1)? as char).to_digit(16)?;
    let low = (*bytes.get(2)? as char).to_digit(16)?;
    Some((high * 16 + low) as u8)
}

// mdurl replaces each byte of an invalid scalar separately, but consumes a
// structurally complete sequence together. Rust's lossy decoder groups them differently.
fn decode_run(bytes: &[u8]) -> String {
    let mut decoded = String::new();
    let mut at = 0;
    while at < bytes.len() {
        let first = bytes[at];
        if first < 0x80 {
            if b";/?:@&=+$,#".contains(&first) {
                decoded.push_str(&format!("%{first:02X}"));
            } else {
                decoded.push(first as char);
            }
            at += 1;
            continue;
        }
        let (length, mask, minimum) = match first {
            0xc0..=0xdf => (2, 0x1f, 0x80),
            0xe0..=0xef => (3, 0x0f, 0x800),
            0xf0..=0xf7 => (4, 0x07, 0x10000),
            _ => (1, 0, 0),
        };
        let sequence = bytes
            .get(at..at + length)
            .filter(|seq| length > 1 && seq[1..].iter().all(|byte| byte & 0xc0 == 0x80));
        if let Some(sequence) = sequence {
            let scalar = sequence[1..]
                .iter()
                .fold(u32::from(first & mask), |n, byte| {
                    (n << 6) | u32::from(byte & 0x3f)
                });
            if let Some(ch) = char::from_u32(scalar).filter(|_| scalar >= minimum) {
                decoded.push(ch);
            } else {
                decoded.extend(std::iter::repeat_n('\u{fffd}', length));
            }
            at += length;
        } else {
            decoded.push('\u{fffd}');
            at += 1;
        }
    }
    decoded
}

fn decode_destination(input: &str) -> String {
    let mut decoded = String::new();
    let mut at = 0;
    while at < input.len() {
        if escaped_byte(&input.as_bytes()[at..]).is_some() {
            let mut run = Vec::new();
            while let Some(byte) = escaped_byte(&input.as_bytes()[at..]) {
                run.push(byte);
                at += 3;
            }
            decoded.push_str(&decode_run(&run));
        } else {
            let ch = input[at..].chars().next().expect("at is before the end");
            decoded.push(ch);
            at += ch.len_utf8();
        }
    }
    decoded
}

pub fn resolve_path(destination: &str, from: &str) -> Option<String> {
    let bare = decode_destination(destination.split(['#', '?']).next().unwrap_or_default());
    let mut segments = Vec::new();
    for segment in folder(from).split('/').chain(bare.split('/')) {
        match segment {
            "" | "." => (),
            ".." => {
                segments.pop()?;
            }
            part => segments.push(part),
        }
    }
    Some(segments.join("/"))
}

pub struct Resolver<'a> {
    by_name: HashMap<String, Vec<&'a NoteMeta>>,
    by_path: HashMap<&'a str, &'a NoteMeta>,
    by_lower_path: HashMap<String, &'a NoteMeta>,
}

impl<'a> Resolver<'a> {
    pub fn new(notes: &'a [NoteMeta]) -> Self {
        let mut by_name: HashMap<String, Vec<&NoteMeta>> = HashMap::new();
        for note in notes {
            let title = note.title.to_lowercase();
            let stem = markdown::title_of(&note.path).to_lowercase();
            if stem != title {
                by_name.entry(stem).or_default().push(note);
            }
            by_name.entry(title).or_default().push(note);
        }
        Self {
            by_name,
            by_path: notes
                .iter()
                .map(|note| (note.path.as_str(), note))
                .collect(),
            by_lower_path: notes
                .iter()
                .map(|note| (note.path.to_lowercase(), note))
                .collect(),
        }
    }

    pub fn resolve(&self, link: &NoteLink) -> Option<&'a NoteMeta> {
        match link.kind.as_str() {
            "wikilink" => {
                let wanted = link
                    .target
                    .trim_matches(frontmatter::is_space)
                    .to_lowercase();
                self.by_name
                    .get(&wanted)?
                    .iter()
                    .copied()
                    .min_by_key(|note| {
                        (
                            note.title.to_lowercase() != wanted,
                            folder(&note.path) != folder(&link.path),
                            &note.path,
                        )
                    })
            }
            "link" => {
                let joined = resolve_path(&link.target, &link.path)?;
                self.by_path
                    .get(joined.as_str())
                    .or_else(|| self.by_lower_path.get(&joined.to_lowercase()))
                    .copied()
            }
            _ => None,
        }
    }
}

fn line_of(link: &NoteLink) -> MentionLine {
    MentionLine {
        context: link.context.clone(),
        line: link.line,
        r#match: if link.kind == "link" {
            link.target.clone()
        } else {
            format!("[[{}]]", link.target)
        },
    }
}

pub fn mentions(
    path: &str,
    links: &[NoteLink],
    notes: &[NoteMeta],
    bare: &[index::BareMention],
) -> Vec<Mention> {
    let resolver = Resolver::new(notes);
    let mut groups: BTreeMap<&str, Vec<MentionLine>> = BTreeMap::new();
    for link in links.iter().filter(|link| link.path != path) {
        if resolver.resolve(link).is_some_and(|note| note.path == path) {
            groups.entry(&link.path).or_default().push(line_of(link));
        }
    }
    if let Some(target) = notes.iter().find(|note| note.path == path) {
        for row in bare.iter().filter(|row| row.path != path) {
            groups.entry(&row.path).or_default().push(MentionLine {
                context: row.context.clone(),
                line: row.line,
                r#match: target.title.clone(),
            });
        }
    }
    groups
        .into_iter()
        .filter_map(|(path, mut lines)| {
            let note = notes.iter().find(|note| note.path == path)?.clone();
            lines.sort_by_key(|line| line.line);
            Some(Mention { lines, note })
        })
        .collect()
}

fn children<'a>(parent: &str, notes: &'a [NoteMeta]) -> BTreeSet<&'a str> {
    notes
        .iter()
        .flat_map(|note| {
            note.folder
                .match_indices('/')
                .map(|(end, _)| &note.folder[..end])
                .chain(std::iter::once(note.folder.as_str()))
        })
        .filter(|candidate| !candidate.is_empty() && folder(candidate) == parent)
        .collect()
}

fn belongs(note: &NoteMeta, hub: &Hub) -> bool {
    match hub {
        Hub::Folder { folder } => note.folder == *folder,
        Hub::Tag { tag } => note.tags.contains(tag),
    }
}

pub fn hub_pill(hub: &Hub, notes: &[NoteMeta]) -> HubPill {
    let subfolders = match hub {
        Hub::Folder { folder } => children(folder, notes).len(),
        Hub::Tag { .. } => 0,
    };
    HubPill {
        count: subfolders + notes.iter().filter(|note| belongs(note, hub)).count(),
        hub: hub.clone(),
    }
}

pub fn hub_ring(hub: &Hub, notes: &[NoteMeta]) -> Vec<RingMember> {
    let mut members = Vec::new();
    if let Hub::Folder { folder: current } = hub {
        let parent = folder(current);
        if !parent.is_empty() {
            members.push(RingMember::Hub {
                pill: hub_pill(
                    &Hub::Folder {
                        folder: parent.to_owned(),
                    },
                    notes,
                ),
            });
        }
        let mut subfolders: Vec<_> = children(current, notes).into_iter().collect();
        // Folder display used JavaScript's default string sort before queries moved.
        subfolders.sort_by(|left, right| left.encode_utf16().cmp(right.encode_utf16()));
        members.extend(subfolders.into_iter().map(|folder| RingMember::Hub {
            pill: hub_pill(
                &Hub::Folder {
                    folder: folder.to_owned(),
                },
                notes,
            ),
        }));
    }
    let mut matching: Vec<_> = notes.iter().filter(|note| belongs(note, hub)).collect();
    matching.sort_by(|left, right| left.path.cmp(&right.path));
    members.extend(
        matching
            .into_iter()
            .map(|note| RingMember::Note { note: note.clone() }),
    );
    members
}

pub fn graph(
    path: &str,
    links: &[NoteLink],
    notes: &[NoteMeta],
    bare: &[index::BareMention],
) -> Graph {
    let resolver = Resolver::new(notes);
    let mut outgoing: Vec<Mention> = Vec::new();
    let mut dangling = Vec::new();
    for link in links.iter().filter(|link| link.path == path) {
        let Some(note) = resolver.resolve(link) else {
            if !dangling.contains(&link.target) {
                dangling.push(link.target.clone());
            }
            continue;
        };
        if note.path == path {
            continue;
        }
        if let Some(known) = outgoing
            .iter_mut()
            .find(|group| group.note.path == note.path)
        {
            known.lines.push(line_of(link));
        } else {
            outgoing.push(Mention {
                lines: vec![line_of(link)],
                note: note.clone(),
            });
        }
    }
    let hubs = notes
        .iter()
        .find(|note| note.path == path)
        .map(|note| {
            let folder = (!note.folder.is_empty()).then(|| Hub::Folder {
                folder: note.folder.clone(),
            });
            folder
                .into_iter()
                .chain(note.tags.iter().map(|tag| Hub::Tag { tag: tag.clone() }))
                .map(|hub| hub_pill(&hub, notes))
                .collect()
        })
        .unwrap_or_default();
    Graph {
        dangling,
        hubs,
        incoming: mentions(path, links, notes, bare),
        outgoing,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn bare_rows(value: &Value) -> Vec<index::BareMention> {
        value
            .as_array()
            .unwrap()
            .iter()
            .map(|row| index::BareMention {
                context: row["context"].as_str().unwrap().to_owned(),
                line: row["line"].as_u64().unwrap() as usize,
                path: row["path"].as_str().unwrap().to_owned(),
            })
            .collect()
    }

    #[test]
    fn should_preserve_the_existing_graph_and_mention_contracts() {
        for source in [
            include_str!("../../../fixtures/graph-queries.json"),
            include_str!("../../../fixtures/links-queries.json"),
        ] {
            let cases: Vec<Value> = serde_json::from_str(source).unwrap();
            for case in cases {
                let args = &case["args"];
                let actual = match case["operation"].as_str().unwrap() {
                    "graphOf" => json!(graph(
                        args[0].as_str().unwrap(),
                        &serde_json::from_value::<Vec<NoteLink>>(args[1].clone()).unwrap(),
                        &serde_json::from_value::<Vec<NoteMeta>>(args[2].clone()).unwrap(),
                        &bare_rows(&args[3])
                    )),
                    "mentionsOf" => json!(mentions(
                        args[0].as_str().unwrap(),
                        &serde_json::from_value::<Vec<NoteLink>>(args[1].clone()).unwrap(),
                        &serde_json::from_value::<Vec<NoteMeta>>(args[2].clone()).unwrap(),
                        &bare_rows(&args[3])
                    )),
                    "hubPill" => json!(hub_pill(
                        &serde_json::from_value(args[0].clone()).unwrap(),
                        &serde_json::from_value::<Vec<NoteMeta>>(args[1].clone()).unwrap()
                    )),
                    "hubRing" => json!(hub_ring(
                        &serde_json::from_value(args[0].clone()).unwrap(),
                        &serde_json::from_value::<Vec<NoteMeta>>(args[1].clone()).unwrap()
                    )),
                    operation => panic!("unknown fixture operation: {operation}"),
                };
                assert_eq!(actual, case["expected"], "{case}");
            }
        }
    }

    #[test]
    fn should_choose_duplicate_titles_in_unicode_scalar_path_order() {
        let fixture: Value =
            serde_json::from_str(include_str!("../../../fixtures/note-queries.json")).unwrap();
        for case in fixture["titles"].as_array().unwrap() {
            let mut notes: Vec<NoteMeta> = case["notes"]
                .as_array()
                .unwrap()
                .iter()
                .map(|note| NoteMeta {
                    created_at: 0,
                    folder: folder(note["path"].as_str().unwrap()).into(),
                    path: note["path"].as_str().unwrap().into(),
                    pinned: false,
                    snippet: None,
                    tags: vec![],
                    title: note["title"].as_str().unwrap().into(),
                    updated_at: 0,
                })
                .collect();
            let link = NoteLink {
                context: String::new(),
                kind: "wikilink".into(),
                line: 1,
                path: case["from"].as_str().unwrap().into(),
                target: case["target"].as_str().unwrap().into(),
            };
            assert_eq!(
                json!(Resolver::new(&notes).resolve(&link).map(|note| &note.path)),
                case["expected"]
            );
            notes.reverse();
            assert_eq!(
                json!(Resolver::new(&notes).resolve(&link).map(|note| &note.path)),
                case["expected"]
            );
        }
    }

    #[test]
    fn should_decode_relative_paths_like_the_editor_including_malformed_escapes() {
        let fixture: Value =
            serde_json::from_str(include_str!("../../../fixtures/note-queries.json")).unwrap();
        for case in fixture["paths"].as_array().unwrap() {
            assert_eq!(
                json!(resolve_path(
                    case["destination"].as_str().unwrap(),
                    case["from"].as_str().unwrap()
                )),
                case["expected"],
                "{case}"
            );
        }
    }
}
