import type { Client } from "@libsql/client";

const FTS_SETUP_STATEMENTS = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
    content,
    content='note',
    content_rowid='rowid',
    tokenize='unicode61'
  )`,
  `CREATE TRIGGER IF NOT EXISTS note_fts_insert AFTER INSERT ON note BEGIN
    INSERT INTO note_fts(rowid, content) VALUES (new.rowid, new.content);
  END`,
  `CREATE TRIGGER IF NOT EXISTS note_fts_update AFTER UPDATE ON note BEGIN
    INSERT INTO note_fts(note_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
    INSERT INTO note_fts(rowid, content) VALUES (new.rowid, new.content);
  END`,
  `CREATE TRIGGER IF NOT EXISTS note_fts_delete AFTER DELETE ON note BEGIN
    INSERT INTO note_fts(note_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
  END`,
];

export async function ensureFts(client: Client) {
  for (const statement of FTS_SETUP_STATEMENTS) {
    await client.execute(statement);
  }

  const result = await client.execute(`SELECT count(*) AS n FROM note_fts`);
  const count = Number(result.rows[0]?.n ?? 0);

  if (count === 0) {
    await client.execute(`INSERT INTO note_fts(note_fts) VALUES ('rebuild')`);
  }
}
