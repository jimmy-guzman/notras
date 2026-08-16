use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use rusqlite::types::ValueRef;
use rusqlite::Connection;
use serde_json::{json, Value};

use crate::frontmatter;

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
    matches!(
        path.extension().and_then(|ext| ext.to_str()),
        Some("md" | "markdown")
    )
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

fn title_of(rel_path: &str) -> String {
    let name = rel_path.rsplit('/').next().unwrap_or(rel_path);
    name.strip_suffix(".markdown")
        .or_else(|| name.strip_suffix(".md"))
        .unwrap_or(name)
        .to_string()
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

/// Index a single note file. Returns `true` when the index changed. Files
/// whose mtime matches the stored row are skipped, which also suppresses
/// watcher echo for writes that already indexed synchronously.
pub fn index_file(
    conn: &Connection,
    notes_dir: &Path,
    rel_path: &str,
) -> rusqlite::Result<bool> {
    let abs = notes_dir.join(rel_path);

    // `symlink_metadata` does not follow the link, so a note symlinked to
    // something outside the vault never gets its contents into the index.
    let Ok(meta) = fs::symlink_metadata(&abs) else {
        remove(conn, rel_path)?;
        return Ok(true);
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

    let Ok(content) = fs::read_to_string(&abs) else {
        remove(conn, rel_path)?;
        return Ok(true);
    };

    let parsed = frontmatter::parse(&content);
    let created_at = timestamp_millis(meta.created()).unwrap_or(updated_at);
    let title = title_of(rel_path);

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

fn collect_note_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
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
            collect_note_files(&path, out);
        } else if file_type.is_file() && is_note_file(&path) {
            out.push(path);
        }
    }
}

/// Full scan: index every note file and drop rows for files that no longer
/// exist. Cheap on re-runs thanks to the mtime skip in `index_file`.
pub fn scan_all(conn: &Connection, notes_dir: &Path) -> rusqlite::Result<Vec<String>> {
    let mut files = Vec::new();
    collect_note_files(notes_dir, &mut files);

    let mut seen = HashSet::with_capacity(files.len());
    let mut changed = Vec::new();

    for file in files {
        let Some(rel) = relative_path(notes_dir, &file) else {
            continue;
        };
        if index_file(conn, notes_dir, &rel)? {
            changed.push(rel.clone());
        }
        seen.insert(rel);
    }

    let mut stale = Vec::new();
    {
        let mut stmt = conn.prepare("SELECT path FROM note")?;
        let paths = stmt.query_map([], |row| row.get::<_, String>(0))?;
        for path in paths.flatten() {
            if !seen.contains(&path) {
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
