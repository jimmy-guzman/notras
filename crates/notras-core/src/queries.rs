use std::collections::HashMap;
use std::sync::LazyLock;

use regex::Regex;
use rusqlite::{named_params, Connection, OpenFlags};
use serde::{Deserialize, Serialize};

use crate::application::CommandError;
use crate::relationships::{self, Graph, Hub, HubPill, Mention, NoteLink, RingMember};
use crate::Library;
use crate::{frontmatter, index};

/// A read-only transaction containing one complete indexed library version.
/// Its connection is independent of the writer and is released when dropped.
pub struct ReadView {
    conn: Connection,
}

impl Library {
    /// Capture the current healthy index. The host must prevent a scan step or
    /// mutation until this method returns, and must not expose partial scans.
    pub fn read_view(&self) -> Result<ReadView, CommandError> {
        if self.index_needs_rebuild() {
            return Err(std::io::Error::other("the index is still incomplete").into());
        }
        for suffix in ["", "-wal", "-shm", "-journal"] {
            crate::relative_path::reject_symlink(
                &self.notes_dir.join(format!(".notras/index.db{suffix}")),
            )?;
        }
        crate::relative_path::reject_symlink(&self.notes_dir.join(".notras"))?;
        let conn = Connection::open_with_flags(
            self.notes_dir.join(".notras/index.db"),
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;
        conn.execute_batch("BEGIN DEFERRED")?;
        // BEGIN alone does not establish a WAL snapshot; the first read does.
        conn.query_row("SELECT count(*) FROM sqlite_schema", [], |row| {
            row.get::<_, i64>(0)
        })?;
        Ok(ReadView { conn })
    }

    pub fn list_notes(&self, filters: &NoteFilters) -> Result<Vec<NoteMeta>, CommandError> {
        self.ensure_index()?;
        self.read_view()?.list_notes(filters)
    }

    pub fn list_tags(&self) -> Result<Vec<CountedTag>, CommandError> {
        self.ensure_index()?;
        self.read_view()?.list_tags()
    }

    pub fn find_mentions(&self, path: &str) -> Result<Vec<Mention>, CommandError> {
        self.ensure_index()?;
        self.read_view()?.find_mentions(path)
    }

    pub fn read_graph(&self, target: &GraphTarget) -> Result<GraphResult, CommandError> {
        self.ensure_index()?;
        self.read_view()?.read_graph(target)
    }

    pub fn search_notes(&self, search: NoteSearch) -> Result<Vec<NoteMeta>, CommandError> {
        if search.incomplete {
            return Ok(Vec::new());
        }
        self.ensure_index()?;
        self.read_view()?.search_notes(search)
    }
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteMeta {
    #[cfg_attr(feature = "bindings", specta(type = f64))]
    pub created_at: i64,
    pub folder: String,
    pub path: String,
    pub pinned: bool,
    pub snippet: Option<String>,
    pub tags: Vec<String>,
    pub title: String,
    #[cfg_attr(feature = "bindings", specta(type = f64))]
    pub updated_at: i64,
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteFilters {
    pub folder: Option<String>,
    pub limit: Option<u32>,
    pub pinned_only: Option<bool>,
    pub query: Option<String>,
    pub sort: Option<NoteSort>,
    pub tag: Option<String>,
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NoteSort {
    Updated,
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "lowercase")]
pub enum SearchFilter {
    Folder(String),
    From(String),
    Link(String),
    Mention(String),
    Tag(String),
    To(String),
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Deserialize)]
pub struct NoteSearch {
    pub filters: Vec<SearchFilter>,
    pub incomplete: bool,
    pub query: String,
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Serialize)]
pub struct CountedTag {
    pub count: u32,
    pub tag: String,
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum GraphTarget {
    Note { path: String },
    Hub { hub: Hub },
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Picture {
    Note {
        note: NoteMeta,
        graph: Graph,
    },
    Hub {
        hub: HubPill,
        members: Vec<RingMember>,
    },
}

#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphResult {
    pub picture: Option<Picture>,
    pub mentions_error: Option<CommandError>,
}

fn fts_match(query: &str) -> Option<String> {
    static NON_WORD: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"[^\p{L}\p{N}_]+").expect("valid FTS normalization pattern"));
    let terms: Vec<_> = query
        .split(frontmatter::is_space)
        .map(|term| NON_WORD.replace_all(term, ""))
        .filter(|term| !term.is_empty())
        .map(|term| format!("{term}*"))
        .collect();
    (!terms.is_empty()).then(|| terms.join(" AND "))
}

fn select_notes(
    conn: &Connection,
    filters: &NoteFilters,
    matches: &[HashMap<String, Option<String>>],
) -> Result<Vec<NoteMeta>, CommandError> {
    let matched = filters.query.as_deref().and_then(fts_match);
    let (source, condition) = if matched.is_some() {
        (
            "note JOIN note_fts ON note_fts.rowid = note.id",
            "note_fts MATCH :query",
        )
    } else {
        ("note", ":query IS NULL")
    };
    let order = if matched.is_some() {
        "note.pinned DESC, bm25(note_fts), note.updated_at DESC, note.path"
    } else if filters.sort.is_some() {
        "note.updated_at DESC"
    } else {
        "note.pinned DESC, note.updated_at DESC"
    };
    let sql = format!(
        "SELECT note.id, note.path FROM {source}
         WHERE (:folder IS NULL OR note.folder = :folder)
         AND (:pinned = 0 OR note.pinned = 1)
         AND (:tag IS NULL OR note.path IN (SELECT path FROM note_tag WHERE tag = :tag))
         AND {condition}
         ORDER BY {order} LIMIT :limit"
    );
    let mut statement = conn.prepare(&sql)?;
    let mut metadata = conn.prepare(
        "SELECT created_at, folder, path, pinned, title, updated_at FROM note WHERE id = ?1",
    )?;
    let mut tags = conn.prepare("SELECT tag FROM note_tag WHERE path = ?1 ORDER BY rowid")?;
    let mut snippet = conn.prepare(
        "SELECT snippet(note_fts, 2, '[[hl]]', '[[/hl]]', '...', 24)
         FROM note_fts WHERE note_fts MATCH ?1 AND rowid = ?2",
    )?;
    let rows = statement.query_map(named_params! {
        ":query": matched, ":folder": filters.folder, ":pinned": filters.pinned_only.unwrap_or(false),
        ":tag": filters.tag,
        ":limit": if matches.is_empty() { filters.limit.map(i64::from).unwrap_or(-1) } else { -1 },
    }, |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))?;
    rows.filter(|row| match row {
        Ok((_, path)) => matches.iter().all(|found| found.contains_key(path)),
        Err(_) => true,
    })
    .take(filters.limit.map_or(usize::MAX, |limit| limit as usize))
    .map(|row| {
        let (id, path) = row?;
        let context = match &matched {
            Some(query) => snippet.query_row((query, id), |row| row.get(0))?,
            None => matches
                .iter()
                .find_map(|found| found.get(&path).cloned().flatten()),
        };
        let note_tags = tags
            .query_map([&path], |row| row.get(0))?
            .collect::<rusqlite::Result<_>>()?;
        metadata.query_row([id], |row| {
            Ok(NoteMeta {
                created_at: row.get(0)?,
                folder: row.get(1)?,
                path: row.get(2)?,
                pinned: row.get(3)?,
                snippet: context,
                tags: note_tags,
                title: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
    })
    .collect::<rusqlite::Result<_>>()
    .map_err(CommandError::from)
}

fn select_links(conn: &Connection, destinations: bool) -> Result<Vec<NoteLink>, CommandError> {
    let mut statement = conn.prepare(
        "SELECT context, kind, line, path, target FROM note_link
         WHERE ?1 OR kind IN ('link', 'wikilink') ORDER BY path, line, rowid",
    )?;
    let rows = statement.query_map([destinations], |row| {
        Ok(NoteLink {
            context: row.get(0)?,
            kind: row.get(1)?,
            line: row.get(2)?,
            path: row.get(3)?,
            target: row.get(4)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

fn bare_mentions(
    core: &ReadView,
    target: &NoteMeta,
) -> Result<Vec<index::BareMention>, CommandError> {
    let candidates = index::mention_candidates(&core.conn, &target.path, &target.title)?;
    Ok(index::scan_mentions(&core.conn, candidates, &target.title)?)
}

fn filter_matches(
    core: &ReadView,
    filter: &SearchFilter,
    notes: &[NoteMeta],
    links: &[NoteLink],
) -> Result<HashMap<String, Option<String>>, CommandError> {
    match filter {
        SearchFilter::Folder(value) => Ok(notes
            .iter()
            .filter(|note| {
                value == "/"
                    || note.folder == *value
                    || note.folder.starts_with(&format!("{value}/"))
            })
            .map(|note| (note.path.clone(), None))
            .collect()),
        SearchFilter::Tag(value) => Ok(notes
            .iter()
            .filter(|note| note.tags.contains(value))
            .map(|note| (note.path.clone(), None))
            .collect()),
        SearchFilter::Mention(value) => {
            let candidates = index::phrase_candidates(&core.conn, value)?;
            Ok(index::scan_prose(&core.conn, candidates, value, true)?
                .into_iter()
                .map(|row| (row.path, Some(row.context)))
                .collect())
        }
        SearchFilter::Link(value) => Ok(links
            .iter()
            .filter(|link| link.target.to_lowercase().contains(&value.to_lowercase()))
            .map(|link| (link.path.clone(), Some(link.context.clone())))
            .collect()),
        SearchFilter::To(value) => {
            let Some(target) = notes.iter().find(|note| note.path == *value) else {
                return Ok(HashMap::new());
            };
            let bare = bare_mentions(core, target)?;
            Ok(relationships::mentions(value, links, notes, &bare)
                .into_iter()
                .map(|mention| {
                    let context = mention
                        .lines
                        .first()
                        .expect("mention has at least one line")
                        .context
                        .clone();
                    (mention.note.path, Some(context))
                })
                .collect())
        }
        SearchFilter::From(value) => {
            let Some(target) = notes.iter().find(|note| note.path == *value) else {
                return Ok(HashMap::new());
            };
            let resolver = relationships::Resolver::new(notes);
            Ok(links
                .iter()
                .filter(|link| link.path == *value)
                .filter_map(|link| {
                    let note = resolver.resolve(link)?;
                    (note.path != *value).then(|| {
                        (
                            note.path.clone(),
                            Some(format!(
                                "{} ({}): {}",
                                target.title, target.path, link.context
                            )),
                        )
                    })
                })
                .collect())
        }
    }
}

impl ReadView {
    pub fn list_notes(&self, filters: &NoteFilters) -> Result<Vec<NoteMeta>, CommandError> {
        select_notes(&self.conn, filters, &[])
    }

    pub fn list_tags(&self) -> Result<Vec<CountedTag>, CommandError> {
        let mut statement = self
            .conn
            .prepare("SELECT count(*), tag FROM note_tag GROUP BY tag ORDER BY tag")?;
        let rows = statement.query_map([], |row| {
            Ok(CountedTag {
                count: row.get(0)?,
                tag: row.get(1)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn find_mentions(&self, path: &str) -> Result<Vec<Mention>, CommandError> {
        let notes = select_notes(&self.conn, &NoteFilters::default(), &[])?;
        let Some(target) = notes.iter().find(|note| note.path == path) else {
            return Ok(Vec::new());
        };
        let links = select_links(&self.conn, false)?;
        let bare = bare_mentions(self, target)?;
        Ok(relationships::mentions(path, &links, &notes, &bare))
    }

    pub fn read_graph(&self, target: &GraphTarget) -> Result<GraphResult, CommandError> {
        let notes = select_notes(&self.conn, &NoteFilters::default(), &[])?;
        match target {
            GraphTarget::Hub { hub } => Ok(GraphResult {
                picture: Some(Picture::Hub {
                    hub: relationships::hub_pill(hub, &notes),
                    members: relationships::hub_ring(hub, &notes),
                }),
                mentions_error: None,
            }),
            GraphTarget::Note { path } => {
                let Some(note) = notes.iter().find(|note| note.path == *path) else {
                    return Ok(GraphResult {
                        picture: None,
                        mentions_error: None,
                    });
                };
                let links = select_links(&self.conn, false)?;
                let (bare, mentions_error) = match bare_mentions(self, note) {
                    Ok(bare) => (bare, None),
                    Err(error) => (Vec::new(), Some(error)),
                };
                Ok(GraphResult {
                    picture: Some(Picture::Note {
                        note: note.clone(),
                        graph: relationships::graph(path, &links, &notes, &bare),
                    }),
                    mentions_error,
                })
            }
        }
    }

    pub fn search_notes(&self, search: NoteSearch) -> Result<Vec<NoteMeta>, CommandError> {
        if search.incomplete {
            return Ok(Vec::new());
        }
        let filters = NoteFilters {
            query: Some(search.query),
            limit: Some(30),
            ..Default::default()
        };
        if search.filters.is_empty() {
            return select_notes(&self.conn, &filters, &[]);
        }
        let notes = select_notes(&self.conn, &NoteFilters::default(), &[])?;
        let links = if search.filters.iter().any(|filter| {
            matches!(
                filter,
                SearchFilter::Link(_) | SearchFilter::To(_) | SearchFilter::From(_)
            )
        }) {
            select_links(&self.conn, true)?
        } else {
            Vec::new()
        };
        let matches = search
            .filters
            .iter()
            .map(|filter| filter_matches(self, filter, &notes, &links))
            .collect::<Result<Vec<_>, _>>()?;
        select_notes(&self.conn, &filters, &matches)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};
    use std::fs;

    fn library() -> (tempfile::TempDir, Library) {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join(".notras")).unwrap();
        let conn = index::open(directory.path()).unwrap();
        let core = Library {
            notes_dir: directory.path().to_owned(),
            conn,
            index_dirty: Default::default(),
        };
        (directory, core)
    }

    fn save(core: &Library, path: &str, content: &str, updated_at: i64) {
        let absolute = core.notes_dir.join(path);
        fs::create_dir_all(absolute.parent().unwrap()).unwrap();
        fs::write(absolute, content).unwrap();
        index::index_file(&core.conn, &core.notes_dir, path).unwrap();
        core.conn
            .execute(
                "UPDATE note SET created_at = 0, updated_at = ?1 WHERE path = ?2",
                (updated_at, path),
            )
            .unwrap();
    }

    #[test]
    fn should_keep_metadata_links_and_prose_in_one_read_view() {
        let (_directory, core) = library();
        save(&core, "ada.md", "# Ada", 1);
        save(&core, "grace.md", "# Grace", 2);
        save(
            &core,
            "source.md",
            "---\ntags: [old]\n---\n# Source\n[[Ada]]\nAda wrote this.",
            3,
        );
        let view = core.read_view().unwrap();

        core.save_note("source.md", "# Changed\n[[Grace]]\nGrace wrote this.", None)
            .unwrap();

        assert!(view.conn.execute("DELETE FROM note", []).is_err());
        let mentions = view.find_mentions("ada.md").unwrap();
        assert_eq!(mentions.len(), 1);
        assert_eq!(mentions[0].note.title, "Source");
        assert_eq!(mentions[0].note.tags, ["old"]);
        assert_eq!(
            mentions[0]
                .lines
                .iter()
                .map(|line| line.line)
                .collect::<Vec<_>>(),
            [5, 6]
        );
        assert_eq!(view.list_tags().unwrap()[0].tag, "old");
        assert!(core.find_mentions("ada.md").unwrap().is_empty());
        assert_eq!(
            core.find_mentions("grace.md").unwrap()[0].note.title,
            "Changed"
        );
        assert!(core.list_tags().unwrap().is_empty());
    }

    #[test]
    fn should_keep_saved_prose_until_external_changes_are_indexed() {
        let (directory, core) = library();
        save(&core, "ada.md", "# Ada", 1);
        save(&core, "source.md", "# Source\nAda wrote this.", 2);

        fs::write(
            directory.path().join("source.md"),
            "# Source\nSomething else.",
        )
        .unwrap();

        assert_eq!(core.find_mentions("ada.md").unwrap().len(), 1);
        core.reindex_all().unwrap();
        assert!(core.find_mentions("ada.md").unwrap().is_empty());
    }

    #[test]
    fn should_find_neighbors_among_unrelated_links() {
        let (_directory, core) = library();
        core.conn.execute_batch("BEGIN").unwrap();
        for i in 0..1000 {
            core.conn
                .execute(
                    "INSERT INTO note (path, title, folder, pinned, created_at, updated_at) VALUES (?1, ?2, '', 0, 0, ?3)",
                    (format!("note-{i}.md"), format!("Note {i}"), i),
                )
                .unwrap();
            for offset in 1..=5 {
                core.conn
                    .execute(
                        "INSERT INTO note_link VALUES (?1, ?2, 'wikilink', ?3, 'context')",
                        (
                            format!("note-{i}.md"),
                            offset,
                            format!("Note {}", (i + offset) % 1000),
                        ),
                    )
                    .unwrap();
            }
        }
        core.conn.execute_batch("COMMIT").unwrap();
        let result = core
            .read_graph(&GraphTarget::Note {
                path: "note-0.md".into(),
            })
            .unwrap();
        let Some(Picture::Note { graph, .. }) = result.picture else {
            panic!()
        };
        assert_eq!(graph.incoming.len(), 5);
        assert_eq!(graph.outgoing.len(), 5);
    }

    #[test]
    fn should_list_saved_metadata_with_exact_filters_and_requested_order() {
        let (_directory, core) = library();
        save(
            &core,
            "work/pinned.md",
            "---\npinned: true\ntags: [z, a]\n---\n# Pinned",
            1,
        );
        save(&core, "work/new.md", "---\ntags: [a]\n---\n# New", 3);
        save(&core, "work/deep/other.md", "# Other", 4);
        let notes = core
            .list_notes(&NoteFilters {
                folder: Some("work".into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(
            notes
                .iter()
                .map(|note| note.path.as_str())
                .collect::<Vec<_>>(),
            ["work/pinned.md", "work/new.md"]
        );
        assert_eq!(notes[0].tags, ["z", "a"]);
        let recent = core
            .list_notes(&NoteFilters {
                sort: Some(NoteSort::Updated),
                limit: Some(1),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(recent[0].path, "work/deep/other.md");
        let tagged = core
            .list_notes(&NoteFilters {
                tag: Some("a".into()),
                pinned_only: Some(true),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(tagged.len(), 1);
        assert_eq!(tagged[0].path, "work/pinned.md");
        assert_eq!(
            json!(core.list_tags().unwrap()),
            json!([{"count":2,"tag":"a"},{"count":1,"tag":"z"}])
        );
        assert!(core
            .list_notes(&NoteFilters {
                limit: Some(0),
                ..Default::default()
            })
            .unwrap()
            .is_empty());
    }

    #[test]
    fn should_return_no_results_for_incomplete_search_without_reading_the_index() {
        let (_directory, core) = library();
        fs::write(core.notes_dir.join("unreadable.md"), [0xff]).unwrap();
        core.index_dirty.set(true);
        let result = core
            .search_notes(NoteSearch {
                query: "needle".into(),
                filters: vec![],
                incomplete: true,
            })
            .unwrap();
        assert!(result.is_empty());
        assert!(core.index_dirty.get());
    }

    #[test]
    fn should_normalize_fts_terms_as_unicode_letters_numbers_and_underscores() {
        for (query, expected) in [
            ("  budget! q3? ", Some("budget* AND q3*")),
            ("é 中 Ⅳ ١ x_y", Some("é* AND 中* AND Ⅳ* AND ١* AND x_y*")),
            ("a\u{85}b\u{feff}c", Some("ab* AND c*")),
            ("a\u{301} \u{345}", Some("a*")),
            ("-- ! :", None),
        ] {
            assert_eq!(fts_match(query).as_deref(), expected);
        }
    }

    #[test]
    fn should_intersect_filters_before_the_cap_and_keep_fts_context() {
        let (_directory, core) = library();
        for i in 0..80 {
            let folder = if i < 40 { "other" } else { "work/2026" };
            save(&core, &format!("{folder}/{i}.md"), "---\ntags: [work, review]\n---\n# Budget\nneedle [code](https://GitHub.com/notras)", i);
        }
        let result = core
            .search_notes(NoteSearch {
                query: "needle".into(),
                incomplete: false,
                filters: vec![
                    SearchFilter::Link("github.com".into()),
                    SearchFilter::Folder("work".into()),
                    SearchFilter::Tag("review".into()),
                    SearchFilter::Tag("work".into()),
                ],
            })
            .unwrap();
        assert_eq!(result.len(), 30);
        assert_eq!(result[0].path, "work/2026/79.md");
        assert_eq!(result[29].path, "work/2026/50.md");
        assert!(result.iter().all(|note| note
            .snippet
            .as_ref()
            .unwrap()
            .contains("[[hl]]needle[[/hl]]")));
        assert!(core
            .search_notes(NoteSearch {
                query: "needle".into(),
                filters: vec![],
                incomplete: true
            })
            .unwrap()
            .is_empty());
    }

    #[test]
    fn should_fill_the_cap_when_higher_ranked_notes_fail_each_filter() {
        let (_directory, core) = library();
        let destinations = (0..40)
            .map(|i| format!("[note](work/{i}.md)"))
            .collect::<Vec<_>>()
            .join("\n");
        save(&core, "source.md", &format!("# Source\n{destinations}"), 0);
        save(&core, "target.md", "# Atlas", 0);
        for i in 0..80 {
            if i < 40 {
                save(&core, &format!("work/{i}.md"), "---\ntags: [z, review]\n---\n# Note\nneedle Atlas [site](https://example.test)", i);
            } else {
                save(&core, &format!("other/{i}.md"), "# Note\nneedle", i);
            }
        }
        for filter in [
            SearchFilter::Folder("work".into()),
            SearchFilter::Tag("review".into()),
            SearchFilter::Mention("Atlas".into()),
            SearchFilter::Link("example.test".into()),
            SearchFilter::From("source.md".into()),
            SearchFilter::To("target.md".into()),
        ] {
            let notes = core
                .search_notes(NoteSearch {
                    query: "needle".into(),
                    filters: vec![filter],
                    incomplete: false,
                })
                .unwrap();
            assert_eq!(
                notes
                    .iter()
                    .map(|note| note.path.clone())
                    .collect::<Vec<_>>(),
                (10..40)
                    .rev()
                    .map(|i| format!("work/{i}.md"))
                    .collect::<Vec<_>>()
            );
            assert!(notes.iter().all(|note| note.tags == ["z", "review"]
                && note.snippet.as_deref()
                    == Some("# Note\n[[hl]]needle[[/hl]] Atlas [site](https://example.test)")));
        }
    }

    #[test]
    fn should_keep_search_results_current_after_edits_deletion_and_reopening() {
        let (directory, core) = library();
        save(&core, "removed.md", "# Removed\nobsolete", 1);
        save(
            &core,
            "kept.md",
            "---\ntags: [z, a]\n---\n# Kept\noriginal",
            2,
        );
        fs::write(
            directory.path().join("kept.md"),
            "---\ntags: [z, a]\n---\n# Kept\nreplacement",
        )
        .unwrap();
        index::reindex_file(&core.conn, directory.path(), "kept.md").unwrap();
        fs::remove_file(directory.path().join("removed.md")).unwrap();
        core.scan_complete().unwrap();
        core.conn.execute_batch("VACUUM").unwrap();
        drop(core);
        let core = Library::open(directory.path()).unwrap();
        assert!(core.scan().unwrap().is_empty());
        for query in ["obsolete", "original"] {
            assert!(core
                .list_notes(&NoteFilters {
                    query: Some(query.into()),
                    ..Default::default()
                })
                .unwrap()
                .is_empty());
        }
        let notes = core
            .list_notes(&NoteFilters {
                query: Some("replacement".into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].path, "kept.md");
        assert_eq!(notes[0].tags, ["z", "a"]);
        assert_eq!(
            notes[0].snippet.as_deref(),
            Some("# Kept\n[[hl]]replacement[[/hl]]")
        );
    }

    #[test]
    fn should_rank_fts_by_pin_then_relevance_recency_and_path() {
        let (_directory, core) = library();
        save(
            &core,
            "pinned.md",
            "---\npinned: true\n---\n# Other\nneedle filler filler filler",
            0,
        );
        save(&core, "b.md", "# Other\nneedle", 10);
        save(&core, "a.md", "# Other\nneedle", 10);
        save(&core, "old.md", "# Other\nneedle", 1);
        save(
            &core,
            "verbose.md",
            "# Other\nneedle lots of additional content that lowers the relevance of this match",
            100,
        );
        let notes = core
            .list_notes(&NoteFilters {
                query: Some("need".into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(
            notes
                .iter()
                .map(|note| note.path.as_str())
                .collect::<Vec<_>>(),
            ["pinned.md", "a.md", "b.md", "old.md", "verbose.md"]
        );
        assert!(core
            .list_notes(&NoteFilters {
                query: Some("needle absent".into()),
                ..Default::default()
            })
            .unwrap()
            .is_empty());
    }

    #[test]
    fn should_resolve_relationship_filters_against_notes_outside_fts_results() {
        let (_directory, core) = library();
        save(&core, "projects/atlas.md", "# Atlas\n[[Budget]]", 1);
        save(
            &core,
            "projects/budget.md",
            "# Budget\nneedle [[Atlas]] [site](https://ÉXAMPLE.test)",
            3,
        );
        save(&core, "archive/budget.md", "# Budget\n[[Atlas]]", 2);
        for (query, filters, expected) in [
            (
                "needle",
                vec![
                    SearchFilter::From("projects/atlas.md".into()),
                    SearchFilter::Link("éxample".into()),
                ],
                vec!["projects/budget.md"],
            ),
            (
                "needle",
                vec![SearchFilter::To("projects/atlas.md".into())],
                vec!["projects/budget.md"],
            ),
            (
                "",
                vec![SearchFilter::To("projects/atlas.md".into())],
                vec!["projects/budget.md", "archive/budget.md"],
            ),
            (
                "",
                vec![SearchFilter::From("projects/atlas.md".into())],
                vec!["projects/budget.md"],
            ),
            ("", vec![SearchFilter::From("missing.md".into())], vec![]),
        ] {
            let result = core
                .search_notes(NoteSearch {
                    query: query.into(),
                    filters,
                    incomplete: false,
                })
                .unwrap();
            assert_eq!(
                result
                    .iter()
                    .map(|note| note.path.as_str())
                    .collect::<Vec<_>>(),
                expected
            );
        }
    }

    #[test]
    fn should_use_saved_titles_and_original_lines_for_complete_mentions() {
        let (_directory, core) = library();
        save(&core, "atlas.md", "# Atlas", 1);
        save(
            &core,
            "source.md",
            "---\ntags: [x]\n---\n# Source\nAtlas in prose\n[[Atlas]] and [map](atlas.md)\n`Atlas`",
            2,
        );
        let mentions = core.find_mentions("atlas.md").unwrap();
        assert_eq!(mentions.len(), 1);
        assert_eq!(mentions[0].note.path, "source.md");
        assert_eq!(
            mentions[0]
                .lines
                .iter()
                .map(|line| line.line)
                .collect::<Vec<_>>(),
            [5, 6, 6]
        );
        assert_eq!(mentions[0].lines[0].r#match, "Atlas");
        save(&core, "atlas.md", "# Earth", 3);
        assert_eq!(core.find_mentions("atlas.md").unwrap()[0].lines.len(), 2);
    }

    #[test]
    fn should_choose_the_first_filter_context_unless_fts_provides_one() {
        let (_directory, core) = library();
        save(
            &core,
            "source.md",
            "# Source\nFirst phrase\n[site](https://example.test)\nFirst phrase later",
            1,
        );
        let result = core
            .search_notes(NoteSearch {
                query: "".into(),
                incomplete: false,
                filters: vec![
                    SearchFilter::Mention("First phrase".into()),
                    SearchFilter::Link("example.test".into()),
                ],
            })
            .unwrap();
        assert_eq!(result[0].snippet.as_deref(), Some("First phrase later"));
        let result = core
            .search_notes(NoteSearch {
                query: "".into(),
                incomplete: false,
                filters: vec![
                    SearchFilter::Link("example.test".into()),
                    SearchFilter::Mention("First phrase".into()),
                ],
            })
            .unwrap();
        assert_eq!(
            result[0].snippet.as_deref(),
            Some("[site](https://example.test)")
        );
    }

    #[test]
    fn should_recover_a_dirty_index_and_reject_incomplete_recovery_without_blocking_file_reads() {
        let (_directory, core) = library();
        fs::write(
            core.notes_dir.join("fresh.md"),
            "---\npinned: true\ntags: [z, a]\n---\n# Fresh",
        )
        .unwrap();
        core.index_dirty.set(true);
        assert_eq!(
            core.list_notes(&NoteFilters::default()).unwrap()[0].title,
            "Fresh"
        );
        assert!(!core.index_dirty.get());
        fs::write(core.notes_dir.join("bad.md"), [0xff]).unwrap();
        core.index_dirty.set(true);
        assert!(core.list_notes(&NoteFilters::default()).is_err());
        assert!(core.list_tags().is_err());
        assert!(core.find_mentions("fresh.md").is_err());
        assert!(core
            .read_graph(&GraphTarget::Note {
                path: "fresh.md".into()
            })
            .is_err());
        assert!(core
            .search_notes(NoteSearch {
                query: "".into(),
                filters: vec![],
                incomplete: false
            })
            .is_err());
        let file = core.read_note("fresh.md".into()).unwrap();
        assert_eq!(file.title, "Fresh");
        assert!(file.pinned);
        assert_eq!(file.tags, ["z", "a"]);
    }

    #[test]
    fn should_preserve_explicit_graph_links_when_prose_cannot_be_read() {
        let (_directory, core) = library();
        save(&core, "atlas.md", "# Atlas\n[[Source]]", 1);
        save(&core, "source.md", "# Source\nAtlas", 2);
        core.conn
            .execute(
                "UPDATE note SET body_line_offset = -1 WHERE path = 'source.md'",
                [],
            )
            .unwrap();
        assert!(core.find_mentions("atlas.md").is_err());
        assert!(core
            .search_notes(NoteSearch {
                query: "".into(),
                filters: vec![SearchFilter::To("atlas.md".into())],
                incomplete: false
            })
            .is_err());
        let result = core
            .read_graph(&GraphTarget::Note {
                path: "atlas.md".into(),
            })
            .unwrap();
        assert!(result.mentions_error.is_some());
        let Some(Picture::Note { graph, .. }) = result.picture else {
            panic!("expected note graph")
        };
        assert_eq!(graph.outgoing[0].note.path, "source.md");
        assert!(graph.incoming.is_empty());
    }

    #[test]
    fn should_preserve_the_recorded_search_filter_results() {
        let cases: Vec<Value> =
            serde_json::from_str(include_str!("../../../fixtures/search-queries.json")).unwrap();
        for case in cases {
            let (_directory, core) = library();
            let args = &case["args"];
            if case["operation"] == "searchFilterMatches" {
                let notes: Vec<NoteMeta> = serde_json::from_value(args[1].clone()).unwrap();
                let links: Vec<NoteLink> = serde_json::from_value(args[2].clone()).unwrap();
                for note in &notes {
                    save(&core, &note.path, "", 0);
                }
                for bare in args[3].as_array().unwrap() {
                    let content = format!(
                        "{}{}",
                        "\n".repeat(bare["line"].as_u64().unwrap() as usize - 1),
                        bare["context"].as_str().unwrap()
                    );
                    save(&core, bare["path"].as_str().unwrap(), &content, 1);
                    index::reindex_file(
                        &core.conn,
                        &core.notes_dir,
                        bare["path"].as_str().unwrap(),
                    )
                    .unwrap();
                }
                let filter = serde_json::from_value(args[0].clone()).unwrap();
                let expected: HashMap<String, Option<String>> =
                    serde_json::from_value::<Vec<(String, Option<String>)>>(
                        case["expected"].clone(),
                    )
                    .unwrap()
                    .into_iter()
                    .collect();
                assert_eq!(
                    filter_matches(&core.read_view().unwrap(), &filter, &notes, &links).unwrap(),
                    expected,
                    "{case}"
                );
            } else {
                let notes: Vec<NoteMeta> = serde_json::from_value(args[0].clone()).unwrap();
                for (i, note) in notes.iter().enumerate() {
                    let tags = note.tags.join(", ");
                    save(
                        &core,
                        &note.path,
                        &format!("---\ntags: [{tags}]\n---\n# {}", note.title),
                        (notes.len() - i) as i64,
                    );
                }
                let result = core
                    .search_notes(serde_json::from_value(args[1].clone()).unwrap())
                    .unwrap();
                assert_eq!(
                    result
                        .iter()
                        .map(|note| json!(note.path))
                        .collect::<Vec<_>>(),
                    case["expected"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|note| note["path"].clone())
                        .collect::<Vec<_>>(),
                    "{case}"
                );
            }
        }
    }
}
