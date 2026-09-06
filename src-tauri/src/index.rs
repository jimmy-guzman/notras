use std::collections::HashSet;
use std::ops::Range;
use std::path::{Path, PathBuf};
use std::{fmt, fs, io};
use std::time::UNIX_EPOCH;

use pulldown_cmark::{Event, Options, Parser, Tag};
use rusqlite::types::ValueRef;
use rusqlite::Connection;
use serde::Serialize;
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

/// Bump when a row's derivation changes. The mtime skip would otherwise leave
/// every unedited note on the old derivation until someone ran "reindex".
const SCHEMA_VERSION: i64 = 1;

/// The derived, disposable search index. Files are the source of truth; this
/// database can be deleted at any time and rebuilt from the notes directory.
/// Rust is the single writer -- the webview only ever issues SELECTs.
///
/// `note_link` holds one row per wikilink occurrence rather than one per pair
/// of notes, and `target` is the text as written rather than a resolved path:
/// the webview resolves it on read, so a note created or retitled later is
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

/// `line` is 1-based and `target` is the text between the brackets as written.
struct Wikilink<'a> {
    context: &'a str,
    line: usize,
    target: &'a str,
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

/// Where a `[[link]]` counts, byte by byte: true for prose, false for what the
/// editor's parser reads as code, HTML, or a link destination.
///
/// CommonMark decides the blocks, so a fence, an indented block and a backtick
/// span are opaque on both sides. Emphasis delimiters are prose, since the
/// editor's tokenizer takes `[[**a**]]` whole. Text between a matching pair of
/// inline tags is opaque too, because the editor parses that stretch as HTML
/// rather than markdown, while an unmatched tag hides only itself.
fn prose_mask(body: &str) -> Vec<bool> {
    let options =
        Options::ENABLE_TABLES | Options::ENABLE_TASKLISTS | Options::ENABLE_STRIKETHROUGH;
    let mut prose = vec![false; body.len()];
    let mut opaque: Vec<Range<usize>> = Vec::new();
    let mut open_tags: Vec<(String, usize)> = Vec::new();

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
                Tag::Link { .. } | Tag::Image { .. } | Tag::Superscript | Tag::Subscript => {}
                Tag::CodeBlock(_) | Tag::HtmlBlock => {
                    opaque.push(range);
                    open_tags.clear();
                }
                _ => open_tags.clear(),
            },
            _ => {}
        }
    }

    for range in opaque {
        prose[range].fill(false);
    }

    prose
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
fn wikilinks(body: &str) -> Vec<Wikilink<'_>> {
    prose_ranges(body)
        .into_iter()
        .flat_map(|range| wikilink_targets(body, range))
        .map(|(open, target)| {
            let line_start = body[..open].rfind('\n').map_or(0, |at| at + 1);
            let line_end = body[open..].find('\n').map_or(body.len(), |at| open + at);

            Wikilink {
                context: body[line_start..line_end].trim_end_matches('\r'),
                line: body[..open].matches('\n').count() + 1,
                target,
            }
        })
        .collect()
}

/// A title written without brackets in another note's prose.
#[derive(Debug, Serialize)]
pub struct BareMention {
    pub context: String,
    pub line: usize,
    pub path: String,
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

/// Inside `[[...]]` the title is a link and counted already, and on the
/// heading that names the note it is the note's name. A note titled by its
/// frontmatter has no such heading, so its first heading is prose like the
/// rest.
fn bare_mentions<'a>(body: &'a str, title: &str, heading_names_note: bool) -> Vec<(usize, &'a str)> {
    let needle: Vec<char> = title.chars().flat_map(char::to_lowercase).collect();
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
            let linked = links.iter().any(|span| start < span.end && end > span.start);
            let line = body[..start].matches('\n').count() + 1;

            if !bounded || linked || heading_line == Some(line - 1) {
                continue;
            }

            let line_start = body[..start].rfind('\n').map_or(0, |at| at + 1);
            let line_end = body[start..].find('\n').map_or(body.len(), |at| start + at);

            found.push((line, body[line_start..line_end].trim_end_matches('\r')));
            skip_until = at + len;
        }
    }

    found
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
/// which the mtime skip never revisits. Takes no connection, so the caller
/// can let go of the index lock before the reads.
pub fn scan_mentions(
    notes_dir: &Path,
    candidates: Vec<String>,
    title: &str,
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

        let heading_names_note = parsed.frontmatter.title.is_none();

        found.extend(bare_mentions(parsed.body, title, heading_names_note).into_iter().map(
            |(line, context)| BareMention {
                context: context.to_string(),
                line: line + body_line_offset,
                path: candidate.clone(),
            },
        ));
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
pub fn index_file(
    conn: &Connection,
    notes_dir: &Path,
    rel_path: &str,
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
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                log::warn!("could not list {}: {error}", dir.display());
                unreadable.push(dir.to_path_buf());
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
                unreadable.push(dir.to_path_buf());
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

    /// The wikilink parity table. `src/components/editor/wikilink.spec.ts`
    /// asserts the same cases in the same order against the editor's parser,
    /// so what the index records and what the editor renders as a pill can be
    /// diffed by eye.
    #[test]
    fn finds_the_wikilinks_the_editor_renders() {
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

    #[test]
    fn records_each_wikilink_occurrence_with_its_line() {
        let dir = temp_notes_dir("wikilink-rows");
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

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_older_schema_drops_its_rows_on_open() {
        let dir = temp_notes_dir("schema-version");
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

        assert_eq!(scan_all(&conn, &dir).unwrap().len(), 1);
        assert_eq!(
            select(&conn, "SELECT target FROM note_link", &[]).unwrap(),
            vec![vec![json!("b")]]
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn finds_bare_mentions_of_a_title() {
        let dir = temp_notes_dir("bare-mentions");
        fs::write(dir.join("graph view.md"), "# graph view\n\nthis note is about the graph view\n").unwrap();
        fs::write(
            dir.join("a.md"),
            "---\ntags: [x]\n---\nthe Graph View is next\n\n[[graph view]] is linked\n\ngraph views are plural\n\n```\ngraph view in code\n```\n\nsee graph view twice, Graph View\n",
        )
        .unwrap();
        fs::write(dir.join("b.md"), "# graph view notes\n\nsee graph view here\n").unwrap();
        fs::write(dir.join("c.md"), "nothing here\n").unwrap();
        fs::write(dir.join("f.md"), "---\ntitle: other\n---\n# graph view\n\nplain\n").unwrap();
        fs::write(dir.join("g.md"), "snake_case is a symbol, but the snake is an animal\n").unwrap();
        fs::write(dir.join("q.md"), "# say \"hi\"\n").unwrap();
        fs::write(dir.join("r.md"), "he did say \"hi\" twice\n").unwrap();

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
                // Titled by its frontmatter, so its heading is prose.
                ("f.md", 4, "# graph view"),
            ]
        );

        // An underscore joins a word, the way a letter does.
        let rows = find("x.md", "snake");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].context, "snake_case is a symbol, but the snake is an animal");

        // A quote in the title reaches FTS escaped.
        let rows = find("q.md", "say \"hi\"");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].path, "r.md");

        // No letter or digit means nothing to find, and no error.
        assert!(find("x.md", "---").is_empty());

        let _ = fs::remove_dir_all(&dir);
    }

    /// The state a swap leaves between the index vouching for a file and the
    /// watcher noticing: the row still names it, and it is a symlink.
    #[test]
    #[cfg(unix)]
    fn skips_a_candidate_swapped_for_a_symlink() {
        let dir = temp_notes_dir("swapped-candidate");
        let outside = std::env::temp_dir().join(format!("notras-test-outside-{}", std::process::id()));
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
        assert!(scan_mentions(&dir, candidates, "graph view").unwrap().is_empty());

        let _ = fs::remove_file(&outside);
        let _ = fs::remove_dir_all(&dir);
    }
}
