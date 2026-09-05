use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::{fmt, fs, io};
use std::time::UNIX_EPOCH;

use rusqlite::types::ValueRef;
use rusqlite::Connection;
use serde_json::{json, Value};

use crate::frontmatter;

/// What an index operation can fail on: the note's file, or the database.
#[derive(Debug)]
pub enum IndexError {
    Io(io::Error),
    Db(rusqlite::Error),
}

impl From<io::Error> for IndexError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<rusqlite::Error> for IndexError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Db(error)
    }
}

impl fmt::Display for IndexError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => error.fmt(f),
            Self::Db(error) => error.fmt(f),
        }
    }
}

impl std::error::Error for IndexError {}

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

/// The derived, disposable search index. Files are the source of truth; this
/// database can be deleted at any time and rebuilt from the notes directory.
/// Rust is the single writer -- the webview only ever issues SELECTs.
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
         CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
           path UNINDEXED,
           title,
           content,
           tokenize='unicode61'
         );",
    )
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
fn title_of(rel_path: &str) -> String {
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
fn leading_heading(body: &str) -> Option<String> {
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

/// A note's display title: frontmatter `title:`, then the leading `#` heading,
/// then the filename stem. Kept in parity with `resolveTitle` in
/// `src/core/notes.ts`.
fn resolve_title(parsed: &frontmatter::Parsed<'_>, rel_path: &str) -> String {
    parsed
        .frontmatter
        .title
        .clone()
        .or_else(|| leading_heading(parsed.body))
        .unwrap_or_else(|| title_of(rel_path))
}

fn folder_of(rel_path: &str) -> String {
    match rel_path.rsplit_once('/') {
        Some((folder, _)) => folder.to_string(),
        None => String::new(),
    }
}

pub fn remove(conn: &Connection, rel_path: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM note WHERE path = ?1", [rel_path])?;
    conn.execute("DELETE FROM note_tag WHERE path = ?1", [rel_path])?;
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
    tx.execute("DELETE FROM note_fts", [])?;
    tx.commit()
}

/// Index a single note file. Returns `true` when the index changed. Files
/// whose mtime matches the stored row are skipped, which also suppresses
/// watcher echo for writes that already indexed synchronously.
pub fn index_file(
    conn: &Connection,
    notes_dir: &Path,
    rel_path: &str,
) -> Result<bool, IndexError> {
    let abs = notes_dir.join(rel_path);

    // `symlink_metadata` does not follow the link, so a note symlinked to
    // something outside the vault never gets its contents into the index.
    // Only a file that is gone loses its row: one that is there but cannot be
    // read right now keeps it, and the failure goes to the caller.
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
    if stored == Some(updated_at) {
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

    tx.execute("DELETE FROM note_fts WHERE path = ?1", [rel_path])?;
    tx.execute(
        "INSERT INTO note_fts (path, title, content) VALUES (?1, ?2, ?3)",
        rusqlite::params![rel_path, title, parsed.body],
    )?;

    tx.commit()?;

    Ok(true)
}

fn collect_note_files(dir: &Path, out: &mut Vec<PathBuf>, unreadable: &mut Vec<PathBuf>) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) => {
            log::warn!("could not list {}: {error}", dir.display());
            unreadable.push(dir.to_path_buf());
            return;
        }
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.file_name().is_some_and(is_hidden) {
            continue;
        }
        // `file_type` does not follow symlinks, so a symlinked directory is
        // neither recursed into nor mistaken for a note file.
        let Ok(file_type) = entry.file_type() else {
            continue;
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
pub fn scan_all(conn: &Connection, notes_dir: &Path) -> Result<Vec<String>, IndexError> {
    let mut files = Vec::new();
    let mut unreadable = Vec::new();
    collect_note_files(notes_dir, &mut files, &mut unreadable);
    let shadowed: Vec<String> = unreadable
        .iter()
        .filter_map(|dir| relative_path(notes_dir, dir))
        .map(|rel| if rel.is_empty() { rel } else { format!("{rel}/") })
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
            Err(IndexError::Io(error)) => log::warn!("could not read {rel}: {error}"),
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

    Ok(changed)
}

fn bind_value(value: &Value) -> rusqlite::types::Value {
    use rusqlite::types::Value as SqlValue;
    match value {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(i64::from(*b)),
        Value::Number(n) => n.as_i64().map_or_else(
            || SqlValue::Real(n.as_f64().unwrap_or_default()),
            SqlValue::Integer,
        ),
        other => SqlValue::Text(match other {
            Value::String(s) => s.clone(),
            _ => other.to_string(),
        }),
    }
}

fn column_value(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => json!(i),
        ValueRef::Real(f) => json!(f),
        ValueRef::Text(t) => json!(String::from_utf8_lossy(t)),
        ValueRef::Blob(_) => Value::Null,
    }
}

/// Read-only query surface for the webview (Drizzle's sqlite-proxy driver).
/// Returns positional row arrays. Anything that isn't a SELECT is rejected --
/// the index has exactly one writer, and it is not the webview.
///
/// The gate is SQLite's own `sqlite3_stmt_readonly` rather than a prefix test:
/// a `WITH ... DELETE`/`UPDATE`/`INSERT` CTE starts with `with` but writes.
pub fn select(conn: &Connection, sql: &str, params: &[Value]) -> Result<Vec<Vec<Value>>, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    if !stmt.readonly() {
        return Err("only SELECT statements are allowed".into());
    }

    let column_count = stmt.column_count();

    let bound: Vec<rusqlite::types::Value> = params.iter().map(bind_value).collect();
    let mut rows = stmt
        .query(rusqlite::params_from_iter(bound))
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut values = Vec::with_capacity(column_count);
        for i in 0..column_count {
            values.push(column_value(row.get_ref(i).map_err(|e| e.to_string())?));
        }
        out.push(values);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_notes_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("notras-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// The title-resolution parity table. `src/core/notes.spec.ts` asserts the
    /// same cases in the same order, so the two resolvers can be diffed by eye.
    #[test]
    fn resolves_titles_from_frontmatter_then_heading_then_filename() {
        // Held one-per-line against rustfmt so this table stays diffable by eye
        // against its twin in `src/core/notes.spec.ts`.
        #[rustfmt::skip]
        let cases: &[(&str, &str, &str)] = &[
            // Frontmatter wins over a heading that disagrees.
            ("---\ntitle: from frontmatter\n---\n# from heading\n", "note.md", "from frontmatter"),
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
    fn strips_the_markdown_extension_case_insensitively() {
        let parsed = frontmatter::parse("body\n");
        assert_eq!(resolve_title(&parsed, "NOTE.MD"), "NOTE");
        assert_eq!(resolve_title(&parsed, "note.md"), "note");
        assert_eq!(resolve_title(&parsed, "Note.Markdown"), "Note");
        assert_eq!(resolve_title(&parsed, "note.markdown"), "note");
        // Not an extension, so nothing is stripped.
        assert_eq!(resolve_title(&parsed, "notes.txt"), "notes.txt");
        assert_eq!(resolve_title(&parsed, ".md"), "");
    }

    /// A file written from a terminal states its own title, and the index reads
    /// that rather than the filename, through the real indexing path. `D32`
    /// carries why the heading wins.
    #[test]
    fn indexes_a_heading_as_the_title() {
        let dir = temp_notes_dir("heading-title");
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
        assert_eq!(rows[1][1], json!("effect: a primer"));

        // The title is searchable even though it never appears in the filename.
        let hits = select(
            &conn,
            "SELECT path FROM note_fts WHERE note_fts MATCH ?1",
            &[json!("claude")],
        )
        .unwrap();
        assert_eq!(hits.len(), 1);

        let _ = fs::remove_dir_all(&dir);
    }

    /// The mtime skip means a re-scan alone cannot pick up a change in how a
    /// row is derived. `clear` is what makes `reindex_all` a real rebuild, so a
    /// note nobody has edited still gets its title re-resolved.
    #[test]
    fn clear_lets_a_rescan_refresh_an_untouched_note() {
        let dir = temp_notes_dir("clear-rebuild");
        fs::write(dir.join("agent-note.md"), "# from claude\n").unwrap();

        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        scan_all(&conn, &dir).unwrap();

        // Stand in for a row written by an older derivation, without touching
        // the file, so the mtime skip is live.
        conn.execute("UPDATE note SET title = 'agent-note'", []).unwrap();
        assert!(scan_all(&conn, &dir).unwrap().is_empty());
        let stale: String = conn
            .query_row("SELECT title FROM note", [], |row| row.get(0))
            .unwrap();
        assert_eq!(stale, "agent-note");

        clear(&conn).unwrap();
        assert_eq!(scan_all(&conn, &dir).unwrap().len(), 1);
        let fresh: String = conn
            .query_row("SELECT title FROM note", [], |row| row.get(0))
            .unwrap();
        assert_eq!(fresh, "from claude");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn indexes_scans_and_removes() {
        let dir = temp_notes_dir("scan");
        fs::create_dir_all(dir.join("work")).unwrap();
        fs::write(
            dir.join("work/meeting.md"),
            "---\npinned: true\ntags: [standup]\n---\n# meeting\nnotes here\n",
        )
        .unwrap();
        fs::write(dir.join("ideas.md"), "just an idea\n").unwrap();

        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        let changed = scan_all(&conn, &dir).unwrap();
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
            &[json!("notes")],
        )
        .unwrap();
        assert_eq!(hits.len(), 1);
        let no_hits = select(
            &conn,
            "SELECT path FROM note_fts WHERE note_fts MATCH ?1",
            &[json!("standup")],
        )
        .unwrap();
        assert!(no_hits.is_empty());

        // Re-scan is a no-op thanks to mtime skip.
        assert!(scan_all(&conn, &dir).unwrap().is_empty());

        // Deleting the file drops it from the index on the next scan.
        fs::remove_file(dir.join("ideas.md")).unwrap();
        let changed = scan_all(&conn, &dir).unwrap();
        assert_eq!(changed, vec!["ideas.md".to_string()]);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn indexes_an_uppercase_extension() {
        let dir = temp_notes_dir("uppercase");
        fs::write(dir.join("NOTE.MD"), "# shouted\n").unwrap();

        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();

        assert_eq!(scan_all(&conn, &dir).unwrap().len(), 1);

        let rows = select(&conn, "SELECT path, title FROM note", &[]).unwrap();
        assert_eq!(rows[0][0], json!("NOTE.MD"));
        assert_eq!(rows[0][1], json!("shouted"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    #[cfg(unix)]
    fn does_not_index_symlinked_notes() {
        let dir = temp_notes_dir("symlink");
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
        let rows = select(&conn, "SELECT path FROM note WHERE path = ?1", &[json!("linked.md")])
            .unwrap();
        assert!(rows.is_empty());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn select_rejects_writes() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        assert!(select(&conn, "DELETE FROM note", &[]).is_err());
        // A writable CTE starts with "with" but is not read-only.
        assert!(select(
            &conn,
            "WITH doomed AS (SELECT path FROM note) DELETE FROM note",
            &[],
        )
        .is_err());
        assert!(select(&conn, "  select 1", &[]).is_ok());
        assert!(select(&conn, "WITH one AS (SELECT 1) SELECT * FROM one", &[]).is_ok());
    }
}
