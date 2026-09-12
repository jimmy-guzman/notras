use std::path::Path;
use std::{fs, io};

use cap_std::fs::Dir;
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;

use crate::{
    frontmatter,
    markdown::{
        bare_mentions, destinations, is_note_path, leading_heading, resolve_title, wikilinks,
    },
    note_file::{timestamp_millis, OpenedNote},
    relative_path::RelativePath,
};

/// What an index operation can fail on: the note's file, or the database.
#[derive(Debug, thiserror::Error)]
pub enum IndexError {
    #[error(transparent)]
    Io(#[from] io::Error),
    #[error(transparent)]
    Db(#[from] rusqlite::Error),
}

pub(crate) const DATABASE: &str = "index.db";

/// Open the index in its cache directory, rebuilding it from nothing when what
/// is there cannot be opened or holds no usable schema. The files are the source
/// of truth, so a database the app cannot read is one it can throw away.
pub fn open(index_dir: &Path) -> Result<Connection, IndexError> {
    fs::create_dir_all(index_dir)?;
    let path = index_dir.join(DATABASE);
    let opened = Connection::open(&path).and_then(|conn| ensure_schema(&conn).map(|()| conn));
    let error = match opened {
        Ok(conn) => return Ok(conn),
        Err(error) => error,
    };

    log::warn!("rebuilding the index, which could not be opened: {error}");
    for suffix in ["", "-wal", "-shm"] {
        let stale = index_dir.join(format!("{DATABASE}{suffix}"));
        if let Err(error) = fs::remove_file(&stale) {
            if error.kind() != io::ErrorKind::NotFound {
                log::warn!("could not remove {}: {error}", stale.display());
            }
        }
    }
    let conn = Connection::open(&path)?;
    ensure_schema(&conn)?;
    Ok(conn)
}

/// Bump when a row's derivation changes. The mtime skip would otherwise leave
/// every unedited note on the old derivation until someone ran "reindex".
const SCHEMA_VERSION: i64 = 8;

/// The derived, disposable search index. Files are the source of truth; this
/// database can be deleted at any time and rebuilt from the notes directory.
/// Rust owns both reads and writes.
///
/// `note_link` holds one row per wikilink occurrence rather than one per pair
/// of notes, and `target` is the text as written rather than a resolved path:
/// native queries resolve it on read, so a note created or retitled later is
/// found by links written before it existed.
pub fn ensure_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch("PRAGMA journal_mode = WAL;")?;
    let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    let tx = conn.unchecked_transaction()?;
    if version < SCHEMA_VERSION {
        log::info!("index schema {version} is behind {SCHEMA_VERSION}, rebuilding for the rescan");
        tx.execute_batch(
            "DROP TABLE IF EXISTS note_fts;
             DROP TABLE IF EXISTS note_link;
             DROP TABLE IF EXISTS note_tag;
             DROP TABLE IF EXISTS note_prose_fallback;
             DROP TABLE IF EXISTS note;",
        )?;
    }
    tx.execute_batch(
        "CREATE TABLE IF NOT EXISTS note (
           id INTEGER PRIMARY KEY,
           path TEXT NOT NULL UNIQUE,
           title TEXT NOT NULL,
           folder TEXT NOT NULL DEFAULT '',
           pinned INTEGER NOT NULL DEFAULT 0,
           created_at INTEGER NOT NULL,
           updated_at INTEGER NOT NULL,
           body_line_offset INTEGER NOT NULL DEFAULT 0
         );
         CREATE TABLE IF NOT EXISTS note_prose_fallback (
           path TEXT PRIMARY KEY
         );
         CREATE TABLE IF NOT EXISTS note_tag (
           path TEXT NOT NULL,
           tag TEXT NOT NULL,
           PRIMARY KEY (path, tag)
         );
         CREATE TABLE IF NOT EXISTS note_link (
           path TEXT NOT NULL,
           line INTEGER NOT NULL,
           kind TEXT NOT NULL,
           target TEXT NOT NULL,
           context TEXT NOT NULL
         );
         -- A rebuild deletes by path once per note as the table grows:
         -- measured at 4.3s for 10k notes of 5 links unindexed, 0.04s indexed.
         CREATE INDEX IF NOT EXISTS note_link_path ON note_link (path);
         CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
           path UNINDEXED,
           title,
           content,
           tokenize='unicode61'
         );",
    )?;

    if version < SCHEMA_VERSION {
        tx.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    }
    tx.commit()
}

pub fn is_note_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"))
}

/// Relative path (unix separators) for a note file inside the notes dir.
pub fn relative_path(notes_dir: &Path, path: &Path) -> Option<String> {
    if path == notes_dir {
        return Some(String::new());
    }
    RelativePath::from_host(notes_dir, path)
        .ok()
        .map(RelativePath::into_string)
}

fn folder_of(rel_path: &str) -> String {
    match rel_path.rsplit_once('/') {
        Some((folder, _)) => folder.to_string(),
        None => String::new(),
    }
}

/// A title written without brackets in another note's prose.
#[cfg_attr(feature = "bindings", derive(specta::Type))]
#[derive(Debug, Serialize)]
pub struct BareMention {
    pub context: String,
    #[cfg_attr(feature = "bindings", specta(type = f64))]
    pub line: usize,
    pub path: String,
}

/// Candidate files for a literal phrase, including the note's own heading.
pub fn phrase_candidates(conn: &Connection, phrase: &str) -> Result<Vec<String>, IndexError> {
    // unicode61 and Rust differ on Unicode case folding and word boundaries.
    // Keep Unicode bodies even for ASCII phrases to avoid losing matches.
    if phrase.is_ascii() && phrase.chars().any(|ch| ch.is_ascii_alphanumeric()) {
        let query = format!("\"{}\"", phrase.replace('"', "\"\""));
        let mut stmt = conn.prepare(
            "SELECT path FROM note_fts WHERE note_fts MATCH ?1
             UNION SELECT path FROM note_prose_fallback
             ORDER BY path",
        )?;
        let paths = stmt
            .query_map([query], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        return Ok(paths);
    }
    let mut stmt = conn.prepare("SELECT path FROM note ORDER BY path")?;
    let paths = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(paths)
}

pub fn mention_candidates(
    conn: &Connection,
    path: &str,
    title: &str,
) -> Result<Vec<String>, IndexError> {
    // A title with no letter or digit has no word for FTS to find and no
    // boundary for the scan to respect.
    if !title.chars().any(char::is_alphanumeric) {
        return Ok(Vec::new());
    }

    let phrase = format!("\"{}\"", title.replace('"', "\"\""));
    let mut stmt = conn.prepare(
        "SELECT path FROM note_fts WHERE note_fts MATCH ?1 AND path != ?2
         UNION SELECT path FROM note_prose_fallback WHERE path != ?2
         ORDER BY path",
    )?;
    let candidates = stmt
        .query_map([&phrase, path], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(candidates)
}

/// Found on read rather than kept as rows: a row would depend on another
/// note's title and go stale the moment that note was created or retitled,
/// which the mtime skip never revisits. Candidate bodies come from the same index snapshot as their metadata.
pub fn scan_mentions(
    conn: &Connection,
    candidates: Vec<String>,
    title: &str,
) -> Result<Vec<BareMention>, IndexError> {
    scan_prose(conn, candidates, title, false)
}

pub fn scan_prose(
    conn: &Connection,
    candidates: Vec<String>,
    title: &str,
    include_headings: bool,
) -> Result<Vec<BareMention>, IndexError> {
    let mut found = Vec::new();
    let mut statement = conn.prepare(
        "SELECT note_fts.content, note.body_line_offset FROM note
         LEFT JOIN note_fts ON note_fts.rowid = note.id WHERE note.path = ?1",
    )?;
    for candidate in candidates {
        let row = statement
            .query_row([&candidate], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, usize>(1)?))
            })
            .optional()?;
        let Some((body, body_line_offset)) = row else {
            continue;
        };
        let heading_names_note = !include_headings && leading_heading(&body).is_some();
        found.extend(
            bare_mentions(&body, title, heading_names_note)
                .into_iter()
                .map(|(line, context)| BareMention {
                    context: context.to_string(),
                    line: line + body_line_offset,
                    path: candidate.clone(),
                }),
        );
    }
    Ok(found)
}

pub fn remove(conn: &Connection, rel_path: &str) -> rusqlite::Result<()> {
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "DELETE FROM note_fts WHERE rowid = (SELECT id FROM note WHERE path = ?1)",
        [rel_path],
    )?;
    tx.execute("DELETE FROM note WHERE path = ?1", [rel_path])?;
    tx.execute(
        "DELETE FROM note_prose_fallback WHERE path = ?1",
        [rel_path],
    )?;
    tx.execute("DELETE FROM note_tag WHERE path = ?1", [rel_path])?;
    tx.execute("DELETE FROM note_link WHERE path = ?1", [rel_path])?;
    tx.commit()
}

/// Index a single note file. Returns `true` when the index changed. Files
/// whose mtime matches the stored row are skipped, which also suppresses
/// watcher echo for writes that already indexed synchronously.
pub fn index_file(conn: &Connection, root: &Dir, rel_path: &str) -> Result<bool, IndexError> {
    index_note(conn, root, rel_path, false)
}

/// Reconcile a known file mutation even when two writes share a timestamp.
pub fn reindex_file(conn: &Connection, root: &Dir, rel_path: &str) -> Result<bool, IndexError> {
    index_note(conn, root, rel_path, true)
}

fn index_note(
    conn: &Connection,
    root: &Dir,
    rel_path: &str,
    force: bool,
) -> Result<bool, IndexError> {
    let relative = RelativePath::parse(rel_path)?;
    let located = match relative.locate(root) {
        Ok(Some(located)) => located,
        Ok(None) => {
            remove(conn, rel_path)?;
            return Ok(true);
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            remove(conn, rel_path)?;
            return Ok(true);
        }
        Err(error) => return Err(error.into()),
    };
    let meta = match located.symlink_metadata() {
        Ok(meta) => meta,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            remove(conn, rel_path)?;
            return Ok(true);
        }
        Err(error) => return Err(error.into()),
    };
    if !meta.is_file() {
        remove(conn, rel_path)?;
        return Ok(true);
    }

    let file = match located.open_read() {
        Ok(file) => OpenedNote::new(file),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            remove(conn, rel_path)?;
            return Ok(true);
        }
        Err(error) => return Err(error.into()),
    };
    let meta = file.metadata()?;
    let updated_at = timestamp_millis(meta.modified())?;
    let stored: Option<i64> = conn
        .query_row(
            "SELECT updated_at FROM note WHERE path = ?1",
            [rel_path],
            |row| row.get(0),
        )
        .optional()?;
    if !force && stored == Some(updated_at) {
        return Ok(false);
    }

    let content = file.read()?;

    let parsed = frontmatter::parse(&content);
    // The body is a suffix of the file, so what precedes it is the frontmatter,
    // and its line count puts a link's line where `grep -n` puts it.
    let body_line_offset = content[..content.len() - parsed.body.len()]
        .matches('\n')
        .count();
    let created_at = timestamp_millis(meta.created()).unwrap_or(updated_at);
    let title = resolve_title(&parsed, rel_path);

    // Metadata and search entries must describe the same saved document.
    let tx = conn.unchecked_transaction()?;

    tx.execute(
        "INSERT INTO note (path, title, folder, pinned, created_at, updated_at, body_line_offset)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(path) DO UPDATE SET
           title = excluded.title,
           folder = excluded.folder,
           pinned = excluded.pinned,
           updated_at = excluded.updated_at,
           body_line_offset = excluded.body_line_offset",
        rusqlite::params![
            rel_path,
            title,
            folder_of(rel_path),
            parsed.frontmatter.pinned,
            created_at,
            updated_at,
            body_line_offset,
        ],
    )?;

    tx.execute(
        "DELETE FROM note_prose_fallback WHERE path = ?1",
        [rel_path],
    )?;
    // SQLite length(TEXT) stops at NUL; preserve those former candidates too.
    if !parsed.body.is_ascii() || parsed.body.contains('\0') {
        tx.execute(
            "INSERT INTO note_prose_fallback (path) VALUES (?1)",
            [rel_path],
        )?;
    }
    tx.execute("DELETE FROM note_tag WHERE path = ?1", [rel_path])?;
    for tag in &parsed.frontmatter.tags {
        tx.execute(
            "INSERT OR IGNORE INTO note_tag (path, tag) VALUES (?1, ?2)",
            rusqlite::params![rel_path, tag],
        )?;
    }

    tx.execute("DELETE FROM note_link WHERE path = ?1", [rel_path])?;
    for link in wikilinks(parsed.body) {
        tx.execute(
            "INSERT INTO note_link (path, line, kind, target, context)
             VALUES (?1, ?2, 'wikilink', ?3, ?4)",
            rusqlite::params![
                rel_path,
                link.line + body_line_offset,
                link.target,
                link.context
            ],
        )?;
    }
    for link in destinations(parsed.body) {
        let kind = if is_note_path(&link.target) {
            "link"
        } else {
            "destination"
        };
        tx.execute(
            "INSERT INTO note_link (path, line, kind, target, context)
             VALUES (?1, ?2, ?5, ?3, ?4)",
            rusqlite::params![
                rel_path,
                link.line + body_line_offset,
                link.target,
                link.context,
                kind
            ],
        )?;
    }

    tx.execute(
        "DELETE FROM note_fts WHERE rowid = (SELECT id FROM note WHERE path = ?1)",
        [rel_path],
    )?;
    tx.execute(
        "INSERT INTO note_fts (rowid, path, title, content)
         SELECT id, path, ?2, ?3 FROM note WHERE path = ?1",
        rusqlite::params![rel_path, title, parsed.body],
    )?;

    tx.commit()?;

    Ok(true)
}

/// Full scan: index every note file and drop rows for files that no longer
/// exist. Cheap on re-runs thanks to the mtime skip in `index_file`.
///
/// A file that is there but cannot be read keeps whatever row it has, and so
/// does everything under a folder that cannot be listed: absence from the walk
/// is only evidence of deletion where the walk could look.
#[derive(Debug)]
pub struct ScanReport {
    pub changed: Vec<String>,
    pub failures: Vec<IndexError>,
}

/// Scan every saved file, failing on the first file that cannot be indexed.
pub fn scan_complete(
    conn: &Connection,
    root: &Dir,
    notes_dir: &Path,
) -> Result<Vec<String>, IndexError> {
    let report = scan_all(conn, root, notes_dir)?;
    if let Some(error) = report.failures.into_iter().next() {
        return Err(error);
    }
    Ok(report.changed)
}

/// Scan every saved file, retaining per-file failures in the report.
pub fn scan_all(conn: &Connection, root: &Dir, notes_dir: &Path) -> Result<ScanReport, IndexError> {
    crate::Scan::new(notes_dir, false).run(conn, root)
}

#[cfg(test)]
mod tests {
    use crate::markdown::markdown_links;
    use rusqlite::{types::ValueRef, ToSql};
    use serde_json::{json, Value};
    use std::time::UNIX_EPOCH;

    use cap_std::ambient_authority;

    use super::*;

    fn root(directory: &Path) -> Dir {
        Dir::open_ambient_dir(directory, ambient_authority()).unwrap()
    }

    fn select(
        conn: &Connection,
        sql: &str,
        params: &[&dyn ToSql],
    ) -> rusqlite::Result<Vec<Vec<Value>>> {
        let mut statement = conn.prepare(sql)?;
        let column_count = statement.column_count();
        let rows = statement.query_map(params, |row| {
            (0..column_count)
                .map(|column| {
                    Ok(match row.get_ref(column)? {
                        ValueRef::Integer(value) => json!(value),
                        ValueRef::Text(value) => json!(std::str::from_utf8(value).unwrap()),
                        value => panic!("unexpected indexed test value: {value:?}"),
                    })
                })
                .collect()
        })?;
        rows.collect()
    }

    #[test]
    fn should_preserve_the_content_scan_candidate_set() {
        let directory = tempfile::tempdir().unwrap();
        let dir = directory.path();
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        for (path, body) in [
            ("ascii.md", "ordinary prose"),
            ("match.md", "needle"),
            ("unicode.md", "café"),
            ("nul.md", "before\0after"),
            ("metadata.md", "---\ntitle: café\n---\nbody"),
        ] {
            fs::write(dir.join(path), body).unwrap();
            index_file(&conn, &root(dir), path).unwrap();
        }
        let mut previous = conn.prepare(
            "SELECT path FROM note_fts WHERE note_fts MATCH ?1
             UNION SELECT path FROM note_fts WHERE length(content) != length(CAST(content AS BLOB)) ORDER BY path"
        ).unwrap();
        for phrase in ["needle", "missing"] {
            let expected = previous
                .query_map([phrase], |row| row.get::<_, String>(0))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap();
            assert_eq!(phrase_candidates(&conn, phrase).unwrap(), expected);
        }
    }

    #[test]
    fn should_keep_unicode_candidates_current_after_edits_deletion_and_rebuild() {
        let directory = tempfile::tempdir().unwrap();
        let dir = directory.path();
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        fs::write(dir.join("note.md"), "café").unwrap();
        reindex_file(&conn, &root(dir), "note.md").unwrap();
        assert_eq!(phrase_candidates(&conn, "needle").unwrap(), ["note.md"]);
        fs::write(dir.join("note.md"), "ordinary prose").unwrap();
        reindex_file(&conn, &root(dir), "note.md").unwrap();
        assert!(phrase_candidates(&conn, "needle").unwrap().is_empty());
        fs::write(dir.join("note.md"), "café").unwrap();
        reindex_file(&conn, &root(dir), "note.md").unwrap();
        conn.pragma_update(None, "user_version", 5).unwrap();
        ensure_schema(&conn).unwrap();
        assert!(phrase_candidates(&conn, "needle").unwrap().is_empty());
        scan_all(&conn, &root(dir), dir).unwrap();
        assert_eq!(phrase_candidates(&conn, "needle").unwrap(), ["note.md"]);
        fs::remove_file(dir.join("note.md")).unwrap();
        scan_all(&conn, &root(dir), dir).unwrap();
        assert!(phrase_candidates(&conn, "needle").unwrap().is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn should_defer_stale_cleanup_until_file_paths_can_be_converted() {
        let directory = tempfile::tempdir().unwrap();
        let dir = directory.path();
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        fs::write(dir.join("deleted.md"), "old").unwrap();
        scan_all(&conn, &root(dir), dir).unwrap();
        fs::remove_file(dir.join("deleted.md")).unwrap();
        fs::write(dir.join("invalid:name.md"), "invalid").unwrap();
        fs::write(dir.join("valid.md"), "readable").unwrap();
        conn.execute("INSERT INTO note(path, title, created_at, updated_at) VALUES ('invalid:name.md', 'indexed', 0, 0)", []).unwrap();

        let report = scan_all(&conn, &root(dir), dir).unwrap();
        assert_eq!(report.failures.len(), 1);
        assert!(report.failures[0].to_string().contains("invalid:name.md"));
        assert_eq!(report.changed, ["valid.md"]);
        let rows = select(&conn, "SELECT path FROM note ORDER BY path", &[]).unwrap();
        assert_eq!(
            rows,
            vec![
                vec![json!("deleted.md")],
                vec![json!("invalid:name.md")],
                vec![json!("valid.md")]
            ]
        );

        fs::remove_file(dir.join("invalid:name.md")).unwrap();
        let complete = scan_all(&conn, &root(dir), dir).unwrap();
        assert!(complete.failures.is_empty());
        assert!(complete.changed.contains(&"deleted.md".to_string()));
        assert!(complete.changed.contains(&"invalid:name.md".to_string()));
        assert_eq!(
            select(&conn, "SELECT path FROM note", &[]).unwrap(),
            vec![vec![json!("valid.md")]]
        );
    }

    /// A file written from a terminal states its own title, and the index reads
    /// that rather than the filename, through the real indexing path. `D32`
    /// carries why the heading wins.
    #[test]
    fn should_index_a_heading_as_the_title() {
        let dir_directory = tempfile::tempdir().unwrap();
        let dir = dir_directory.path().to_owned();
        fs::write(dir.join("agent-note.md"), "# from claude\nbody\n").unwrap();
        fs::write(
            dir.join("with-frontmatter.md"),
            "---\ntitle: effect: a primer\n---\n# ignored\n",
        )
        .unwrap();

        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        scan_all(&conn, &root(&dir), &dir).unwrap();

        let rows = select(&conn, "SELECT path, title FROM note ORDER BY path", &[]).unwrap();

        assert_eq!(rows[0][0], json!("agent-note.md"));
        assert_eq!(rows[0][1], json!("from claude"));
        assert_eq!(rows[1][1], json!("ignored"));

        // The title is searchable even though it never appears in the filename.
        let hits = select(
            &conn,
            "SELECT path FROM note_fts WHERE note_fts MATCH ?1",
            &[&"claude"],
        )
        .unwrap();
        assert_eq!(hits.len(), 1);
    }

    #[test]
    fn should_refresh_an_untouched_note_during_a_forced_scan() {
        let dir_directory = tempfile::tempdir().unwrap();
        let dir = dir_directory.path().to_owned();
        fs::write(dir.join("agent-note.md"), "# from claude\n").unwrap();

        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        scan_all(&conn, &root(&dir), &dir).unwrap();

        // Stand in for a row written by an older derivation, without touching
        // the file, so the mtime skip is live.
        conn.execute("UPDATE note SET title = 'agent-note'", [])
            .unwrap();
        assert!(scan_all(&conn, &root(&dir), &dir)
            .unwrap()
            .changed
            .is_empty());
        let stale: String = conn
            .query_row("SELECT title FROM note", [], |row| row.get(0))
            .unwrap();
        assert_eq!(stale, "agent-note");

        assert_eq!(
            crate::Scan::new(&dir, true)
                .run(&conn, &root(&dir))
                .unwrap()
                .changed
                .len(),
            1
        );
        let fresh: String = conn
            .query_row("SELECT title FROM note", [], |row| row.get(0))
            .unwrap();
        assert_eq!(fresh, "from claude");
    }

    #[test]
    fn should_index_scans_and_removes() {
        let dir_directory = tempfile::tempdir().unwrap();
        let dir = dir_directory.path().to_owned();
        fs::create_dir_all(dir.join("work")).unwrap();
        fs::write(
            dir.join("work/meeting.md"),
            "---\npinned: true\ntags: [standup]\n---\n# meeting\nnotes here\n",
        )
        .unwrap();
        fs::write(dir.join("ideas.md"), "just an idea\n").unwrap();

        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        let changed = scan_all(&conn, &root(&dir), &dir).unwrap().changed;
        assert_eq!(changed.len(), 2);

        let rows = select(
            &conn,
            "SELECT path, title, folder, pinned FROM note ORDER BY path",
            &[],
        )
        .unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0][0], json!("ideas.md"));
        assert_eq!(rows[1][1], json!("meeting"));
        assert_eq!(rows[1][2], json!("work"));
        assert_eq!(rows[1][3], json!(1));

        // FTS finds body content, not frontmatter.
        let hits = select(
            &conn,
            "SELECT path FROM note_fts WHERE note_fts MATCH ?1",
            &[&"notes"],
        )
        .unwrap();
        assert_eq!(hits.len(), 1);
        let no_hits = select(
            &conn,
            "SELECT path FROM note_fts WHERE note_fts MATCH ?1",
            &[&"standup"],
        )
        .unwrap();
        assert!(no_hits.is_empty());

        // Re-scan is a no-op thanks to mtime skip.
        assert!(scan_all(&conn, &root(&dir), &dir)
            .unwrap()
            .changed
            .is_empty());

        // Deleting the file drops it from the index on the next scan.
        fs::remove_file(dir.join("ideas.md")).unwrap();
        let changed = scan_all(&conn, &root(&dir), &dir).unwrap().changed;
        assert_eq!(changed, vec!["ideas.md".to_string()]);
    }

    #[test]
    fn should_index_an_uppercase_extension() {
        let dir_directory = tempfile::tempdir().unwrap();
        let dir = dir_directory.path().to_owned();
        fs::write(dir.join("NOTE.MD"), "# shouted\n").unwrap();

        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        assert_eq!(scan_all(&conn, &root(&dir), &dir).unwrap().changed.len(), 1);

        let rows = select(&conn, "SELECT path, title FROM note", &[]).unwrap();
        assert_eq!(rows[0][0], json!("NOTE.MD"));
        assert_eq!(rows[0][1], json!("shouted"));
    }

    #[test]
    #[cfg(unix)]
    fn should_skip_symlinked_notes() {
        let dir_directory = tempfile::tempdir().unwrap();
        let dir = dir_directory.path().to_owned();
        fs::write(dir.join("real.md"), "real note\n").unwrap();
        std::os::unix::fs::symlink("/etc/hosts", dir.join("linked.md")).unwrap();

        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        scan_all(&conn, &root(&dir), &dir).unwrap();

        let rows = select(&conn, "SELECT path FROM note ORDER BY path", &[]).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0][0], json!("real.md"));

        // Even asked for directly, a symlink never lands a row.
        index_file(&conn, &root(&dir), "linked.md").unwrap();
        let rows = select(
            &conn,
            "SELECT path FROM note WHERE path = ?1",
            &[&"linked.md"],
        )
        .unwrap();
        assert!(rows.is_empty());
    }

    #[test]
    fn should_record_each_wikilink_occurrence_with_its_line() {
        let dir_directory = tempfile::tempdir().unwrap();
        let dir = dir_directory.path().to_owned();
        fs::write(
            dir.join("a.md"),
            "---\ntags: [x]\n---\nintro [[b]] here\n\nsee [[b]] and [[c]]\r\n",
        )
        .unwrap();

        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        scan_all(&conn, &root(&dir), &dir).unwrap();

        let rows = select(
            &conn,
            "SELECT path, line, kind, target, context FROM note_link ORDER BY line, target",
            &[],
        )
        .unwrap();
        assert_eq!(
            rows,
            vec![
                vec![
                    json!("a.md"),
                    json!(4),
                    json!("wikilink"),
                    json!("b"),
                    json!("intro [[b]] here")
                ],
                vec![
                    json!("a.md"),
                    json!(6),
                    json!("wikilink"),
                    json!("b"),
                    json!("see [[b]] and [[c]]")
                ],
                vec![
                    json!("a.md"),
                    json!(6),
                    json!("wikilink"),
                    json!("c"),
                    json!("see [[b]] and [[c]]")
                ],
            ]
        );

        remove(&conn, "a.md").unwrap();
        assert!(select(&conn, "SELECT path FROM note_link", &[])
            .unwrap()
            .is_empty());
    }

    #[test]
    fn should_drop_rows_from_an_older_schema_on_open() {
        let dir_directory = tempfile::tempdir().unwrap();
        let dir = dir_directory.path().to_owned();
        fs::write(dir.join("a.md"), "see [[b]]\n").unwrap();

        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION);
        scan_all(&conn, &root(&dir), &dir).unwrap();

        // Stand in for a database an older build wrote, without touching the
        // file, so the mtime skip is live.
        conn.pragma_update(None, "user_version", 0).unwrap();
        ensure_schema(&conn).unwrap();
        assert!(select(&conn, "SELECT path FROM note", &[])
            .unwrap()
            .is_empty());
        assert!(select(&conn, "SELECT path FROM note_link", &[])
            .unwrap()
            .is_empty());

        assert_eq!(scan_all(&conn, &root(&dir), &dir).unwrap().changed.len(), 1);
        assert_eq!(
            select(&conn, "SELECT target FROM note_link", &[]).unwrap(),
            vec![vec![json!("b")]]
        );
    }

    #[test]
    fn should_rebuild_version_seven_with_original_prose_line_numbers() {
        let directory = tempfile::tempdir().unwrap();
        let content = "---\ntags: [work]\n---\n# Source\nAda wrote this.";
        fs::write(directory.path().join("source.md"), content).unwrap();
        {
            let library =
                crate::Library::open(directory.path(), &directory.path().join(".index")).unwrap();
            library.scan_complete().unwrap();
            library
                .conn
                .execute_batch(
                    "ALTER TABLE note DROP COLUMN body_line_offset; PRAGMA user_version = 7;",
                )
                .unwrap();
        }

        let library =
            crate::Library::open(directory.path(), &directory.path().join(".index")).unwrap();
        library.scan_complete().unwrap();

        let found = scan_prose(&library.conn, vec!["source.md".into()], "Ada", true).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].line, 5);
        assert_eq!(
            fs::read_to_string(directory.path().join("source.md")).unwrap(),
            content
        );
    }

    #[test]
    fn should_rebuild_version_six_search_rows_from_unchanged_files() {
        let directory = tempfile::tempdir().unwrap();
        let cache = directory.path().join(".index");
        let index_dir = cache.join(crate::index_key(&directory.path().canonicalize().unwrap()));
        fs::create_dir_all(&index_dir).unwrap();
        let content = "---\ntags: [z, a]\n---\n# Current\nfresh [[Other]]";
        fs::write(directory.path().join("note.md"), content).unwrap();
        let modified = timestamp_millis(
            fs::metadata(directory.path().join("note.md"))
                .unwrap()
                .modified(),
        )
        .unwrap();
        let conn = Connection::open(index_dir.join(DATABASE)).unwrap();
        conn.execute_batch(
            "CREATE TABLE note (path TEXT PRIMARY KEY, title TEXT NOT NULL, folder TEXT NOT NULL DEFAULT '', pinned INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
             CREATE VIRTUAL TABLE note_fts USING fts5(path UNINDEXED, title, content, tokenize='unicode61');
             INSERT INTO note_fts (rowid, path, title, content) VALUES (99, 'note.md', 'Old', 'stale');
             PRAGMA user_version = 6;"
        ).unwrap();
        conn.execute(
            "INSERT INTO note VALUES ('note.md', 'Old', '', 0, 0, ?1)",
            [modified],
        )
        .unwrap();
        drop(conn);

        let core = crate::Library::open(directory.path(), &cache).unwrap();
        assert_eq!(core.scan().unwrap(), ["note.md"]);
        let notes = core
            .list_notes(&crate::NoteFilters {
                query: Some("fresh".into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].title, "Current");
        assert_eq!(notes[0].tags, ["z", "a"]);
        assert_eq!(
            notes[0].snippet.as_deref(),
            Some("# Current\n[[hl]]fresh[[/hl]] [[Other]]")
        );
        assert!(core
            .list_notes(&crate::NoteFilters {
                query: Some("stale".into()),
                ..Default::default()
            })
            .unwrap()
            .is_empty());
        assert_eq!(
            select(&core.conn, "SELECT target FROM note_link", &[]).unwrap(),
            vec![vec![json!("Other")]]
        );
        assert_eq!(
            fs::read_to_string(directory.path().join("note.md")).unwrap(),
            content
        );
    }

    #[test]
    fn should_find_bare_mentions_of_a_title() {
        let dir_directory = tempfile::tempdir().unwrap();
        let dir = dir_directory.path().to_owned();
        fs::write(
            dir.join("graph view.md"),
            "# graph view\n\nthis note is about the graph view\n",
        )
        .unwrap();
        fs::write(
            dir.join("a.md"),
            "---\ntags: [x]\n---\nthe Graph View is next\n\n[[graph view]] is linked\n\ngraph views are plural\n\n```\ngraph view in code\n```\n\nsee graph view twice, Graph View\n",
        )
        .unwrap();
        fs::write(
            dir.join("b.md"),
            "# graph view notes\n\nsee graph view here\n",
        )
        .unwrap();
        fs::write(dir.join("c.md"), "nothing here\n").unwrap();
        fs::write(
            dir.join("f.md"),
            "---\ntitle: other\n---\n# graph view\n\nplain\n",
        )
        .unwrap();
        fs::write(
            dir.join("g.md"),
            "snake_case is a symbol, but the snake is an animal\n",
        )
        .unwrap();
        fs::write(dir.join("q.md"), "# say \"hi\"\n").unwrap();
        fs::write(dir.join("r.md"), "he did say \"hi\" twice\n").unwrap();
        let linked = "see [the graph view](graph%20view.md) and [graph view](http://x)\n";
        fs::write(dir.join("h.md"), linked).unwrap();

        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        scan_all(&conn, &root(&dir), &dir).unwrap();

        let find = |path: &str, title: &str| {
            scan_mentions(
                &conn,
                mention_candidates(&conn, path, title).unwrap(),
                title,
            )
            .unwrap()
        };

        let rows = find("graph view.md", "graph view");
        let rows: Vec<(&str, usize, &str)> = rows
            .iter()
            .map(|row| (row.path.as_str(), row.line, row.context.as_str()))
            .collect();
        assert_eq!(
            rows,
            vec![
                ("a.md", 4, "the Graph View is next"),
                ("a.md", 14, "see graph view twice, Graph View"),
                ("a.md", 14, "see graph view twice, Graph View"),
                ("b.md", 3, "see graph view here"),
            ]
        );

        // An underscore joins a word, the way a letter does.
        let rows = find("x.md", "snake");
        assert_eq!(rows.len(), 1);
        assert_eq!(
            rows[0].context,
            "snake_case is a symbol, but the snake is an animal"
        );

        // A quote in the title reaches FTS escaped.
        let rows = find("q.md", "say \"hi\"");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].path, "r.md");

        // No letter or digit means nothing to find, and no error.
        assert!(find("x.md", "---").is_empty());

        assert_eq!(
            markdown_links(linked)
                .iter()
                .map(|link| link.target.as_str())
                .collect::<Vec<_>>(),
            ["graph%20view.md"]
        );
    }

    #[test]
    #[cfg(unix)]
    fn should_skip_a_candidate_swapped_for_a_symlink() {
        let dir_directory = tempfile::tempdir().unwrap();
        let dir = dir_directory.path().to_owned();
        let outside_directory = tempfile::tempdir().unwrap();
        let outside = outside_directory.path().join("note.md");
        fs::write(dir.join("graph view.md"), "# graph view\n").unwrap();
        fs::write(dir.join("s.md"), "the graph view, indexed as a file\n").unwrap();
        fs::write(&outside, "the graph view, from outside the vault\n").unwrap();

        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        scan_all(&conn, &root(&dir), &dir).unwrap();

        fs::remove_file(dir.join("s.md")).unwrap();
        std::os::unix::fs::symlink(&outside, dir.join("s.md")).unwrap();

        let candidates = mention_candidates(&conn, "graph view.md", "graph view").unwrap();
        assert_eq!(candidates, vec!["s.md".to_string()]);
        scan_all(&conn, &root(&dir), &dir).unwrap();
        assert!(scan_mentions(&conn, candidates, "graph view")
            .unwrap()
            .is_empty());
    }

    #[test]
    fn should_record_markdown_note_links_as_rows() {
        let dir_directory = tempfile::tempdir().unwrap();
        let dir = dir_directory.path().to_owned();
        fs::write(dir.join("a.md"), "see [there](sub/b.md) and [[c]]\n").unwrap();

        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        scan_all(&conn, &root(&dir), &dir).unwrap();

        let rows = select(
            &conn,
            "SELECT kind, target, line FROM note_link ORDER BY kind",
            &[],
        )
        .unwrap();
        assert_eq!(
            rows,
            vec![
                vec![json!("link"), json!("sub/b.md"), json!(1)],
                vec![json!("wikilink"), json!("c"), json!(1)],
            ]
        );
    }
    #[test]
    fn should_index_rendered_destinations() {
        let cases: &[(&str, &[&str])] = &[
            ("[a](attachments/report.pdf)", &["attachments/report.pdf"]),
            ("<https://github.com/a>", &["https://github.com/a"]),
            ("https://github.com/a.", &["https://github.com/a"]),
            ("www.github.com/a", &["http://www.github.com/a"]),
            ("ada@example.com", &["mailto:ada@example.com"]),
            ("(https://github.com/a(b)).", &["https://github.com/a(b)"]),
            ("HTTPS://GitHub.com/a", &["HTTPS://GitHub.com/a"]),
            ("https://github.com/a'b", &["https://github.com/a'b"]),
            ("https://github.com/a[1]", &["https://github.com/a[1]"]),
            ("+ada@example.com", &["mailto:+ada@example.com"]),
            ("prefixhttps://github.com", &["https://github.com"]),
            ("https://github.com/a&amp;", &["https://github.com/a"]),
            ("https://github.com/a(foo", &["https://github.com/a"]),
            (
                "https://github.com/a(b(c)d)",
                &["https://github.com/a(b(c)d"],
            ),
            ("https://? ", &[]),
            ("www.", &[]),
            ("`https://github.com/a`", &[]),
            ("![a](https://github.com/a.png)", &[]),
            ("[https://github.com/a](b.md)", &["b.md"]),
            ("<span>https://github.com/a</span>", &[]),
            (
                "[[https://github.com\n[[a much longer valid wikilink target]]",
                &["https://github.com"],
            ),
            (
                "\\[[https://github.com\n[[a much longer valid wikilink target]]",
                &["https://github.com"],
            ),
            (
                "[[https://github.com]] https://example.com",
                &["https://example.com"],
            ),
        ];
        for (markdown, expected) in cases {
            let links = destinations(markdown);
            let found: Vec<&str> = links.iter().map(|link| link.target.as_str()).collect();
            assert_eq!(&found, expected, "scanning {markdown:?}");
        }
    }

    #[test]
    fn should_search_literal_prose_including_headings_without_fts() {
        let dir_directory = tempfile::tempdir().unwrap();
        let dir = dir_directory.path().to_owned();
        fs::write(dir.join("a.md"), "---\ntitle: Ada Lovelace\n---\n# Ada Lovelace\n\nada lovelace wrote this.\n\n`Ada Lovelace` [Ada Lovelace](a.md) <span>Ada Lovelace</span>\n\nLovelaces and xAda Lovelace are different.\n\nA +++ phrase.\n").unwrap();
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        scan_all(&conn, &root(&dir), &dir).unwrap();
        let mentions = scan_prose(&conn, vec!["a.md".into()], "Ada Lovelace", true).unwrap();
        assert_eq!(
            mentions.iter().map(|row| row.line).collect::<Vec<_>>(),
            vec![4, 6]
        );
        assert_eq!(
            scan_prose(&conn, vec!["a.md".into()], "+++", true)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn should_classify_non_note_destinations_separately() {
        let dir_directory = tempfile::tempdir().unwrap();
        let dir = dir_directory.path().to_owned();
        fs::write(
            dir.join("a.md"),
            "[b](b.md) https://github.com/a ![image](x.png)",
        )
        .unwrap();
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        scan_all(&conn, &root(&dir), &dir).unwrap();
        let rows = select(
            &conn,
            "SELECT kind, target FROM note_link ORDER BY kind",
            &[],
        )
        .unwrap();
        assert_eq!(
            rows,
            vec![
                vec![json!("destination"), json!("https://github.com/a")],
                vec![json!("link"), json!("b.md")]
            ]
        );
    }

    #[test]
    fn should_narrow_ascii_phrase_candidates_before_matching_literal_prose() {
        let dir_directory = tempfile::tempdir().unwrap();
        let dir = dir_directory.path().to_owned();
        fs::write(
            dir.join("a.md"),
            "# Ada Lovelace\n\nAda-Lovelace is not the same phrase.\n",
        )
        .unwrap();
        fs::write(dir.join("b.md"), "`Ada Lovelace`\n").unwrap();
        fs::write(dir.join("c.md"), "unrelated prose\n").unwrap();
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        scan_all(&conn, &root(&dir), &dir).unwrap();
        let candidates = phrase_candidates(&conn, "Ada Lovelace").unwrap();
        assert_eq!(candidates, vec!["a.md", "b.md"]);
        let found = scan_prose(&conn, candidates, "Ada Lovelace", true).unwrap();
        assert_eq!(
            found
                .iter()
                .map(|row| (row.path.as_str(), row.line))
                .collect::<Vec<_>>(),
            vec![("a.md", 1)]
        );
    }

    #[test]
    fn should_keep_punctuation_only_phrase_candidates() {
        let dir_directory = tempfile::tempdir().unwrap();
        let dir = dir_directory.path().to_owned();
        fs::write(dir.join("a.md"), "prose !!! here\n").unwrap();
        fs::write(dir.join("b.md"), "ordinary prose\n").unwrap();
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        scan_all(&conn, &root(&dir), &dir).unwrap();
        let candidates = phrase_candidates(&conn, "!!!").unwrap();
        assert_eq!(candidates, vec!["a.md", "b.md"]);
        let found = scan_prose(&conn, candidates, "!!!", true).unwrap();
        assert_eq!(
            found
                .iter()
                .map(|row| row.path.as_str())
                .collect::<Vec<_>>(),
            vec!["a.md"]
        );
    }

    #[test]
    fn should_keep_unicode_mention_candidates_and_exclude_the_current_note() {
        let directory = tempfile::tempdir().unwrap();
        let dir = directory.path();
        fs::write(dir.join("ada.md"), "# Ada\n\nAda\u{e000}").unwrap();
        fs::write(dir.join("fallback.md"), "Ada\u{e000}\n").unwrap();
        fs::write(dir.join("fts.md"), "Ada\n").unwrap();
        fs::write(dir.join("unrelated.md"), "ordinary prose").unwrap();
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        scan_all(&conn, &root(dir), dir).unwrap();

        let candidates = mention_candidates(&conn, "ada.md", "Ada").unwrap();
        assert_eq!(candidates, ["fallback.md", "fts.md"]);
        let found = scan_mentions(&conn, candidates, "Ada").unwrap();
        assert_eq!(
            found
                .iter()
                .map(|mention| mention.path.as_str())
                .collect::<Vec<_>>(),
            ["fallback.md", "fts.md"]
        );
    }

    #[test]
    fn should_keep_ascii_phrases_beside_unicode_token_boundaries() {
        let dir_directory = tempfile::tempdir().unwrap();
        let dir = dir_directory.path().to_owned();
        fs::write(dir.join("a.md"), "Ada\u{e000}\n").unwrap();
        fs::write(dir.join("b.md"), "\u{e000}Ada\n").unwrap();
        fs::write(dir.join("c.md"), "unrelated prose\n").unwrap();
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        scan_all(&conn, &root(&dir), &dir).unwrap();
        let found =
            scan_prose(&conn, phrase_candidates(&conn, "Ada").unwrap(), "Ada", true).unwrap();
        assert_eq!(
            found
                .iter()
                .map(|row| row.path.as_str())
                .collect::<Vec<_>>(),
            vec!["a.md", "b.md"]
        );
    }

    #[test]
    fn should_keep_unicode_case_variants_that_fts_does_not_fold() {
        let dir_directory = tempfile::tempdir().unwrap();
        let dir = dir_directory.path().to_owned();
        fs::write(dir.join("a.md"), "foo ა bar\n").unwrap();
        fs::write(dir.join("b.md"), "foo Ა bar\n").unwrap();
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        scan_all(&conn, &root(&dir), &dir).unwrap();
        let found = scan_prose(
            &conn,
            phrase_candidates(&conn, "foo Ა bar").unwrap(),
            "foo Ა bar",
            true,
        )
        .unwrap();
        assert_eq!(
            found
                .iter()
                .map(|row| row.path.as_str())
                .collect::<Vec<_>>(),
            vec!["a.md", "b.md"]
        );
    }

    #[test]
    fn should_keep_all_index_rows_when_deleting_one_table_fails() {
        let directory = tempfile::tempdir().unwrap();
        let note = directory.path().join("note.md");
        fs::write(&note, "---\ntags: [work]\n---\n# note\n[[other]]").unwrap();
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        index_file(&conn, &root(directory.path()), "note.md").unwrap();
        conn.execute_batch(
            "CREATE TRIGGER refuse_delete BEFORE DELETE ON note_link
             BEGIN SELECT RAISE(FAIL, 'index unavailable'); END;",
        )
        .unwrap();
        fs::remove_file(&note).unwrap();

        assert!(index_file(&conn, &root(directory.path()), "note.md").is_err());
        assert_eq!(
            select(
                &conn,
                "SELECT (SELECT count(*) FROM note),
                        (SELECT count(*) FROM note_tag),
                        (SELECT count(*) FROM note_link),
                        (SELECT count(*) FROM note_fts)",
                &[]
            )
            .unwrap(),
            vec![vec![json!(1), json!(1), json!(1), json!(1)]]
        );

        conn.execute_batch("DROP TRIGGER refuse_delete").unwrap();
        index_file(&conn, &root(directory.path()), "note.md").unwrap();
        assert_eq!(
            select(
                &conn,
                "SELECT (SELECT count(*) FROM note),
                        (SELECT count(*) FROM note_tag),
                        (SELECT count(*) FROM note_link),
                        (SELECT count(*) FROM note_fts)",
                &[]
            )
            .unwrap(),
            vec![vec![json!(0), json!(0), json!(0), json!(0)]]
        );
    }

    #[test]
    fn should_reject_an_unreadable_stored_timestamp_without_replacing_the_row() {
        let directory = tempfile::tempdir().unwrap();
        let note = directory.path().join("note.md");
        fs::write(&note, "# original").unwrap();
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        index_file(&conn, &root(directory.path()), "note.md").unwrap();
        conn.execute(
            "UPDATE note SET updated_at = 'invalid' WHERE path = 'note.md'",
            [],
        )
        .unwrap();
        fs::write(&note, "# changed").unwrap();

        assert!(matches!(
            index_file(&conn, &root(directory.path()), "note.md"),
            Err(IndexError::Db(rusqlite::Error::InvalidColumnType(..)))
        ));
        assert_eq!(
            select(
                &conn,
                "SELECT title, updated_at FROM note WHERE path = 'note.md'",
                &[]
            )
            .unwrap(),
            vec![vec![json!("original"), json!("invalid")]]
        );
    }

    #[test]
    fn should_reject_an_unreadable_index_path_before_deleting_stale_rows() {
        let directory = tempfile::tempdir().unwrap();
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        conn.execute_batch(
            "INSERT INTO note (path, title, created_at, updated_at)
             VALUES ('stale.md', 'stale', 1, 1), (x'ff', 'invalid', 1, 1);",
        )
        .unwrap();

        assert!(matches!(
            scan_all(&conn, &root(directory.path()), directory.path()),
            Err(IndexError::Db(rusqlite::Error::InvalidColumnType(..)))
        ));
        assert_eq!(
            select(&conn, "SELECT count(*) FROM note", &[]).unwrap(),
            vec![vec![json!(2)]]
        );
    }

    #[cfg(unix)]
    #[test]
    fn should_remove_index_rows_for_a_note_beneath_a_symlinked_parent() {
        let directory = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let folder = directory.path().join("folder");
        fs::create_dir(&folder).unwrap();
        fs::write(folder.join("note.md"), "# note").unwrap();
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        index_file(&conn, &root(directory.path()), "folder/note.md").unwrap();
        fs::rename(&folder, outside.path().join("folder")).unwrap();
        std::os::unix::fs::symlink(outside.path().join("folder"), &folder).unwrap();

        index_file(&conn, &root(directory.path()), "folder/note.md").unwrap();

        assert_eq!(
            select(&conn, "SELECT count(*) FROM note", &[]).unwrap(),
            vec![vec![json!(0)]]
        );
    }

    #[cfg(unix)]
    #[test]
    fn should_skip_prose_candidates_beneath_a_symlinked_parent() {
        let directory = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("note.md"), "a phrase in prose").unwrap();
        std::os::unix::fs::symlink(outside.path(), directory.path().join("folder")).unwrap();

        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        scan_all(&conn, &root(directory.path()), directory.path()).unwrap();
        assert!(
            scan_prose(&conn, vec!["folder/note.md".into()], "phrase", true)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn should_reject_an_invalid_modification_time_without_indexing_zero() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("note.md");
        fs::write(&path, "# note").unwrap();
        fs::File::options()
            .write(true)
            .open(&path)
            .unwrap()
            .set_times(
                fs::FileTimes::new().set_modified(UNIX_EPOCH - std::time::Duration::from_secs(1)),
            )
            .unwrap();
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        assert!(index_file(&conn, &root(directory.path()), "note.md").is_err());
        assert_eq!(
            select(&conn, "SELECT count(*) FROM note", &[]).unwrap(),
            vec![vec![json!(0)]]
        );
    }
}
