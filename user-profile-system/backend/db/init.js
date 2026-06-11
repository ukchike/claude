const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'profiles.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      email       TEXT    UNIQUE NOT NULL,
      password    TEXT    NOT NULL,
      username    TEXT    UNIQUE NOT NULL,
      full_name   TEXT    NOT NULL DEFAULT '',
      bio         TEXT    NOT NULL DEFAULT '',
      phone       TEXT    NOT NULL DEFAULT '',
      location    TEXT    NOT NULL DEFAULT '',
      website     TEXT    NOT NULL DEFAULT '',
      avatar_url  TEXT    NOT NULL DEFAULT '',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_jti  TEXT    UNIQUE NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

module.exports = { getDb };
