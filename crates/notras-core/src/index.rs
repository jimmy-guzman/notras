use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use std::{fs, io};

use rusqlite::Connection;
use serde::Serialize;

use crate::{
    frontmatter,
    markdown::{
        bare_mentions, destinations, is_note_path, leading_heading, resolve_title, wikilinks,
    },
};

/// What an index operation can fail on: the note's file, or the database.
#[derive(Debug, thiserror::Error)]
pub enum IndexError {
    #[error(transparent)]
    Io(#[from] io::Error),
    #[error(transparent)]
    Db(#[from] rusqlite::Error),
}

/// Open the index under `notes_dir`, rebuilding it from nothing when what is
/// there cannot be opened or holds no usable schema. The files are the source
/// of truth, so a database the app cannot read is one it can throw away.
pub fn open(notes_dir: &Path) -> Result<Connection, IndexError> {
    let path = notes_dir.join(".notras/index.db");
    let opened = Connection::open(&path).and_then(|conn| ensure_schema(&conn).map(|()| conn));
    let error = match opened {
        Ok(conn) => return Ok(conn),
        Err(error) => error,
    };

    log::warn!("rebuilding the index, which could not be opened: {error}");
    for suffix in ["", "-wal", "-shm"] {
        let stale = notes_dir.join(format!(".notras/index.db{suffix}"));
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
const SCHEMA_VERSION: i64 = 5;

/// The derived, disposable search index. Files are the source of truth; this
/// database can be deleted at any time and rebuilt from the notes directory.
/// Rust owns both reads and writes.
///
/// `note_link` holds one row per wikilink occurrence rather than one per pair
/// of notes, and `target` is the text as written rather than a resolved path:
/// native queries resolve it on read, so a note created or retitled later is
/// found by links written before it existed.
pub fn ensure_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         CREATE TABLE IF NOT EXISTS note (
           path TEXT PRIMARY KEY,
           title TEXT NOT NULL,
           folder TEXT NOT NULL DEFAULT '',
           pinned INTEGER NOT NULL DEFAULT 0,
           created_at INTEGER NOT NULL,
           updated_at INTEGER NOT NULL
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

    let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if version < SCHEMA_VERSION {
        log::info!(
            "index schema {version} is behind {SCHEMA_VERSION}, dropping rows for the rescan"
        );
        clear(conn)?;
        conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    }

    Ok(())
}

fn timestamp_millis(time: std::io::Result<std::time::SystemTime>) -> Option<i64> {
    let duration = time.ok()?.duration_since(UNIX_EPOCH).ok()?;
    i64::try_from(duration.as_millis()).ok()
}

pub fn is_note_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"))
}

fn is_hidden(component: &std::ffi::OsStr) -> bool {
    component.to_str().is_some_and(|s| s.starts_with('.'))
}

/// Relative path (unix separators) for a note file inside the notes dir.
pub fn relative_path(notes_dir: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(notes_dir).ok()?;
    if rel.components().any(|c| is_hidden(c.as_os_str())) {
        return None;
    }
    Some(
        rel.components()
            .map(|c| c.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/"),
    )
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
             UNION SELECT path FROM note_fts WHERE length(content) != length(CAST(content AS BLOB))
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
        "SELECT path FROM note_fts WHERE note_fts MATCH ?1 AND path != ?2 ORDER BY path",
    )?;
    let candidates = stmt
        .query_map([&phrase, path], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(candidates)
}

/// Found on read rather than kept as rows: a row would depend on another
/// note's title and go stale the moment that note was created or retitled,
/// which the mtime skip never revisits. Reads candidate files under the same library operation as the index lookup.
pub fn scan_mentions(
    notes_dir: &Path,
    candidates: Vec<String>,
    title: &str,
) -> Result<Vec<BareMention>, IndexError> {
    scan_prose(notes_dir, candidates, title, false)
}

pub fn scan_prose(
    notes_dir: &Path,
    candidates: Vec<String>,
    title: &str,
    include_headings: bool,
) -> Result<Vec<BareMention>, IndexError> {
    let mut found = Vec::new();

    for candidate in candidates {
        let abs = notes_dir.join(&candidate);
        // The refusal `index_file` makes: a note swapped for a symlink since it
        // was indexed reads nothing, and the watcher drops its row.
        match fs::symlink_metadata(&abs) {
            Ok(meta) if meta.is_file() => {}
            Ok(_) => continue,
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error.into()),
        }
        let content = match fs::read_to_string(&abs) {
            Ok(content) => content,
            // The index runs behind the folder, and the watcher drops the row.
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error.into()),
        };
        let parsed = frontmatter::parse(&content);
        let body_line_offset = content[..content.len() - parsed.body.len()]
            .matches('\n')
            .count();

        let heading_names_note = !include_headings && leading_heading(parsed.body).is_some();

        found.extend(
            bare_mentions(parsed.body, title, heading_names_note)
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
    conn.execute("DELETE FROM note WHERE path = ?1", [rel_path])?;
    conn.execute("DELETE FROM note_tag WHERE path = ?1", [rel_path])?;
    conn.execute("DELETE FROM note_link WHERE path = ?1", [rel_path])?;
    conn.execute("DELETE FROM note_fts WHERE path = ?1", [rel_path])?;
    Ok(())
}

/// Empty the derived index so the next scan rebuilds every row.
///
/// `index_file` skips a file whose mtime matches its stored row, which makes a
/// plain re-scan a no-op. Dropping the rows first is what lets a deliberate
/// rebuild pick up a change in how a row is derived, such as `resolve_title`,
/// on notes nobody has edited since.
pub fn clear(conn: &Connection) -> rusqlite::Result<()> {
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM note", [])?;
    tx.execute("DELETE FROM note_tag", [])?;
    tx.execute("DELETE FROM note_link", [])?;
    tx.execute("DELETE FROM note_fts", [])?;
    tx.commit()
}

/// Index a single note file. Returns `true` when the index changed. Files
/// whose mtime matches the stored row are skipped, which also suppresses
/// watcher echo for writes that already indexed synchronously.
pub fn index_file(conn: &Connection, notes_dir: &Path, rel_path: &str) -> Result<bool, IndexError> {
    index_note(conn, notes_dir, rel_path, false)
}

/// Reconcile a known file mutation even when two writes share a timestamp.
pub fn reindex_file(
    conn: &Connection,
    notes_dir: &Path,
    rel_path: &str,
) -> Result<bool, IndexError> {
    index_note(conn, notes_dir, rel_path, true)
}

fn index_note(
    conn: &Connection,
    notes_dir: &Path,
    rel_path: &str,
    force: bool,
) -> Result<bool, IndexError> {
    let abs = notes_dir.join(rel_path);

    // `symlink_metadata` does not follow the link, so a note symlinked to
    // something outside the vault never gets its contents into the index.
    let meta = match fs::symlink_metadata(&abs) {
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

    let updated_at = timestamp_millis(meta.modified()).unwrap_or_default();
    let stored: Option<i64> = conn
        .query_row(
            "SELECT updated_at FROM note WHERE path = ?1",
            [rel_path],
            |row| row.get(0),
        )
        .ok();
    if !force && stored == Some(updated_at) {
        return Ok(false);
    }

    let content = match fs::read_to_string(&abs) {
        Ok(content) => content,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            remove(conn, rel_path)?;
            return Ok(true);
        }
        Err(error) => return Err(error.into()),
    };

    let parsed = frontmatter::parse(&content);
    // The body is a suffix of the file, so what precedes it is the frontmatter,
    // and its line count puts a link's line where `grep -n` puts it.
    let body_line_offset = content[..content.len() - parsed.body.len()]
        .matches('\n')
        .count();
    let created_at = timestamp_millis(meta.created()).unwrap_or(updated_at);
    let title = resolve_title(&parsed, rel_path);

    // One note, one transaction: the three tables must never drift apart.
    let tx = conn.unchecked_transaction()?;

    tx.execute(
        "INSERT INTO note (path, title, folder, pinned, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(path) DO UPDATE SET
           title = excluded.title,
           folder = excluded.folder,
           pinned = excluded.pinned,
           updated_at = excluded.updated_at",
        rusqlite::params![
            rel_path,
            title,
            folder_of(rel_path),
            parsed.frontmatter.pinned,
            created_at,
            updated_at,
        ],
    )?;

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

    tx.execute("DELETE FROM note_fts WHERE path = ?1", [rel_path])?;
    tx.execute(
        "INSERT INTO note_fts (path, title, content) VALUES (?1, ?2, ?3)",
        rusqlite::params![rel_path, title, parsed.body],
    )?;

    tx.commit()?;

    Ok(true)
}

fn collect_note_files(
    dir: &Path,
    out: &mut Vec<PathBuf>,
    unreadable: &mut Vec<(PathBuf, io::Error)>,
) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) => {
            log::warn!("could not list {}: {error}", dir.display());
            unreadable.push((dir.to_path_buf(), error));
            return;
        }
    };
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                log::warn!("could not list {}: {error}", dir.display());
                unreadable.push((dir.to_path_buf(), error));
                return;
            }
        };
        let path = entry.path();
        if path.file_name().is_some_and(is_hidden) {
            continue;
        }
        // `file_type` does not follow symlinks, so a symlinked directory is
        // neither recursed into nor mistaken for a note file.
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(error) => {
                log::warn!("could not read {}: {error}", path.display());
                unreadable.push((dir.to_path_buf(), error));
                return;
            }
        };
        if file_type.is_dir() {
            collect_note_files(&path, out, unreadable);
        } else if file_type.is_file() && is_note_file(&path) {
            out.push(path);
        }
    }
}

/// Full scan: index every note file and drop rows for files that no longer
/// exist. Cheap on re-runs thanks to the mtime skip in `index_file`.
///
/// A file that is there but cannot be read keeps whatever row it has, and so
/// does everything under a folder that cannot be listed: absence from the walk
/// is only evidence of deletion where the walk could look.
pub struct ScanReport {
    pub changed: Vec<String>,
    pub failures: Vec<IndexError>,
}

pub fn scan_complete(conn: &Connection, notes_dir: &Path) -> Result<Vec<String>, IndexError> {
    let report = scan_all(conn, notes_dir)?;
    if let Some(error) = report.failures.into_iter().next() {
        return Err(error);
    }
    Ok(report.changed)
}

pub fn scan_all(conn: &Connection, notes_dir: &Path) -> Result<ScanReport, IndexError> {
    let mut files = Vec::new();
    let mut unreadable = Vec::new();
    collect_note_files(notes_dir, &mut files, &mut unreadable);
    let shadowed: Vec<String> = unreadable
        .iter()
        .filter_map(|(dir, _)| relative_path(notes_dir, dir))
        .map(|rel| {
            if rel.is_empty() {
                rel
            } else {
                format!("{rel}/")
            }
        })
        .collect();

    let mut failures: Vec<_> = unreadable
        .into_iter()
        .map(|(_, error)| IndexError::Io(error))
        .collect();
    let mut seen = HashSet::with_capacity(files.len());
    let mut changed = Vec::new();

    for file in files {
        let Some(rel) = relative_path(notes_dir, &file) else {
            continue;
        };
        match index_file(conn, notes_dir, &rel) {
            Ok(true) => changed.push(rel.clone()),
            Ok(false) => {}
            Err(IndexError::Io(error)) => {
                log::warn!("could not read {rel}: {error}");
                failures.push(IndexError::Io(error));
            }
            Err(error) => return Err(error),
        }
        seen.insert(rel);
    }

    let mut stale = Vec::new();
    {
        let mut stmt = conn.prepare("SELECT path FROM note")?;
        let paths = stmt.query_map([], |row| row.get::<_, String>(0))?;
        for path in paths.flatten() {
            if !seen.contains(&path) && !shadowed.iter().any(|dir| path.starts_with(dir)) {
                stale.push(path);
            }
        }
    }
    for path in stale {
        remove(conn, &path)?;
        changed.push(path);
    }

    Ok(ScanReport { changed, failures })
}

#[cfg(test)]
mod tests {
    use crate::markdown::markdown_links;
    use rusqlite::{types::ValueRef, ToSql};
    use serde_json::{json, Value};

    use super::*;

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
        scan_all(&conn, &dir).unwrap();

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

    /// The mtime skip means a re-scan alone cannot pick up a change in how a
    /// row is derived. `clear` is what makes `reindex_all` a real rebuild, so a
    /// note nobody has edited still gets its title re-resolved.
    #[test]
    fn should_refresh_an_untouched_note_after_clearing_the_index() {
        let dir_directory = tempfile::tempdir().unwrap();
        let dir = dir_directory.path().to_owned();
        fs::write(dir.join("agent-note.md"), "# from claude\n").unwrap();

        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        scan_all(&conn, &dir).unwrap();

        // Stand in for a row written by an older derivation, without touching
        // the file, so the mtime skip is live.
        conn.execute("UPDATE note SET title = 'agent-note'", [])
            .unwrap();
        assert!(scan_all(&conn, &dir).unwrap().changed.is_empty());
        let stale: String = conn
            .query_row("SELECT title FROM note", [], |row| row.get(0))
            .unwrap();
        assert_eq!(stale, "agent-note");

        clear(&conn).unwrap();
        assert_eq!(scan_all(&conn, &dir).unwrap().changed.len(), 1);
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

        let changed = scan_all(&conn, &dir).unwrap().changed;
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
        assert!(scan_all(&conn, &dir).unwrap().changed.is_empty());

        // Deleting the file drops it from the index on the next scan.
        fs::remove_file(dir.join("ideas.md")).unwrap();
        let changed = scan_all(&conn, &dir).unwrap().changed;
        assert_eq!(changed, vec!["ideas.md".to_string()]);
    }

    #[test]
    fn should_index_an_uppercase_extension() {
        let dir_directory = tempfile::tempdir().unwrap();
        let dir = dir_directory.path().to_owned();
        fs::write(dir.join("NOTE.MD"), "# shouted\n").unwrap();

        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        assert_eq!(scan_all(&conn, &dir).unwrap().changed.len(), 1);

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
        scan_all(&conn, &dir).unwrap();

        let rows = select(&conn, "SELECT path FROM note ORDER BY path", &[]).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0][0], json!("real.md"));

        // Even asked for directly, a symlink never lands a row.
        index_file(&conn, &dir, "linked.md").unwrap();
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
        scan_all(&conn, &dir).unwrap();

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
        scan_all(&conn, &dir).unwrap();

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

        assert_eq!(scan_all(&conn, &dir).unwrap().changed.len(), 1);
        assert_eq!(
            select(&conn, "SELECT target FROM note_link", &[]).unwrap(),
            vec![vec![json!("b")]]
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
        scan_all(&conn, &dir).unwrap();

        let find = |path: &str, title: &str| {
            scan_mentions(&dir, mention_candidates(&conn, path, title).unwrap(), title).unwrap()
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

    /// The state a swap leaves between the index vouching for a file and the
    /// watcher noticing: the row still names it, and it is a symlink.
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
        scan_all(&conn, &dir).unwrap();

        fs::remove_file(dir.join("s.md")).unwrap();
        std::os::unix::fs::symlink(&outside, dir.join("s.md")).unwrap();

        let candidates = mention_candidates(&conn, "graph view.md", "graph view").unwrap();
        assert_eq!(candidates, vec!["s.md".to_string()]);
        assert!(scan_mentions(&dir, candidates, "graph view")
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
        scan_all(&conn, &dir).unwrap();

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
        let mentions = scan_prose(&dir, vec!["a.md".into()], "Ada Lovelace", true).unwrap();
        assert_eq!(
            mentions.iter().map(|row| row.line).collect::<Vec<_>>(),
            vec![4, 6]
        );
        assert_eq!(
            scan_prose(&dir, vec!["a.md".into()], "+++", true)
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
        scan_all(&conn, &dir).unwrap();
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
        scan_all(&conn, &dir).unwrap();
        let candidates = phrase_candidates(&conn, "Ada Lovelace").unwrap();
        assert_eq!(candidates, vec!["a.md", "b.md"]);
        let found = scan_prose(&dir, candidates, "Ada Lovelace", true).unwrap();
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
        scan_all(&conn, &dir).unwrap();
        let candidates = phrase_candidates(&conn, "!!!").unwrap();
        assert_eq!(candidates, vec!["a.md", "b.md"]);
        let found = scan_prose(&dir, candidates, "!!!", true).unwrap();
        assert_eq!(
            found
                .iter()
                .map(|row| row.path.as_str())
                .collect::<Vec<_>>(),
            vec!["a.md"]
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
        scan_all(&conn, &dir).unwrap();
        let found =
            scan_prose(&dir, phrase_candidates(&conn, "Ada").unwrap(), "Ada", true).unwrap();
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
        scan_all(&conn, &dir).unwrap();
        let found = scan_prose(
            &dir,
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
}
