import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DB_PATH = process.env.DB_PATH || path.resolve("./data/daily.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS routine_tasks (
    id        TEXT PRIMARY KEY,
    title     TEXT NOT NULL,
    start     TEXT NOT NULL,
    duration  INTEGER NOT NULL,
    category  TEXT NOT NULL,
    repeat    TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS overrides (
    id        TEXT PRIMARY KEY,
    date_key  TEXT NOT NULL,
    title     TEXT NOT NULL,
    start     TEXT NOT NULL,
    duration  INTEGER NOT NULL,
    category  TEXT NOT NULL,
    repeat    TEXT NOT NULL DEFAULT 'none'
  );
  CREATE INDEX IF NOT EXISTS idx_overrides_date ON overrides(date_key);

  CREATE TABLE IF NOT EXISTS completions (
    date_key TEXT NOT NULL,
    task_id  TEXT NOT NULL,
    PRIMARY KEY (date_key, task_id)
  );

  CREATE TABLE IF NOT EXISTS categories (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
  );
`);

// Seed default categories once
const catCount = db.prepare("SELECT COUNT(*) AS n FROM categories").get().n;
if (catCount === 0) {
  const ins = db.prepare("INSERT INTO categories (id, name, color, sort_order) VALUES (?, ?, ?, ?)");
  const tx = db.transaction((rows) => rows.forEach((r) => ins.run(...r)));
  tx([
    ["deep", "Deep Work", "#c2410c", 0],
    ["body", "Body",      "#047857", 1],
    ["mind", "Mind",      "#6d28d9", 2],
    ["life", "Life",      "#b45309", 3],
    ["rest", "Rest",      "#475569", 4],
  ]);
}

// Seed sample routine once
const routineCount = db.prepare("SELECT COUNT(*) AS n FROM routine_tasks").get().n;
if (routineCount === 0) {
  const ins = db.prepare(`
    INSERT INTO routine_tasks (id, title, start, duration, category, repeat, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction((rows) => rows.forEach((r) => ins.run(...r)));
  tx([
    ["seed1", "Morning pages",        "06:30", 30,  "mind", "daily",    0],
    ["seed2", "Workout",              "07:15", 45,  "body", "daily",    1],
    ["seed3", "Deep work block",      "09:00", 120, "deep", "weekdays", 2],
    ["seed4", "Lunch & walk",         "12:30", 60,  "life", "daily",    3],
    ["seed5", "Shallow work / email", "14:00", 90,  "life", "weekdays", 4],
    ["seed6", "Deep work block II",   "15:30", 90,  "deep", "weekdays", 5],
    ["seed7", "Read",                 "20:00", 45,  "mind", "daily",    6],
    ["seed8", "Wind down",            "21:30", 30,  "rest", "daily",    7],
  ]);
}
