import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

import { db } from "./db.js";
import { requireAuth, verifyPassword, issueToken, clearToken } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());

if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
}

// ── Auth ──────────────────────────────────────────────────────────────────────

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

app.post("/api/login", loginLimiter, (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== "string" || !verifyPassword(password))
    return res.status(401).json({ error: "invalid password" });
  issueToken(res);
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  clearToken(res);
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const token = req.cookies?.daily_session;
  if (!token) return res.json({ authed: false });
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    res.json({ authed: true });
  } catch {
    res.json({ authed: false });
  }
});

// ── Data (protected) ──────────────────────────────────────────────────────────

const api = express.Router();
api.use(requireAuth);

// Full state in one round-trip
api.get("/state", (_req, res) => {
  const routine    = db.prepare("SELECT * FROM routine_tasks ORDER BY sort_order, start").all();
  const overRows   = db.prepare("SELECT * FROM overrides ORDER BY date_key, start").all();
  const compRows   = db.prepare("SELECT * FROM completions").all();
  const categories = db.prepare("SELECT * FROM categories ORDER BY sort_order").all();

  const overrides = {};
  for (const r of overRows) {
    (overrides[r.date_key] ||= []).push({
      id: r.id, title: r.title, start: r.start,
      duration: r.duration, category: r.category, repeat: r.repeat,
    });
  }

  const done = {};
  for (const c of compRows) {
    (done[c.date_key] ||= {})[c.task_id] = true;
  }

  res.json({ routine, overrides, done, categories });
});

// Routine CRUD
api.post("/routine", (req, res) => {
  const t = sanitizeTask(req.body);
  if (!t) return res.status(400).json({ error: "invalid" });
  db.prepare(`
    INSERT INTO routine_tasks (id, title, start, duration, category, repeat)
    VALUES (@id, @title, @start, @duration, @category, @repeat)
  `).run(t);
  res.json(t);
});

api.put("/routine/:id", (req, res) => {
  const t = sanitizeTask({ ...req.body, id: req.params.id });
  if (!t) return res.status(400).json({ error: "invalid" });
  const info = db.prepare(`
    UPDATE routine_tasks SET title=@title, start=@start,
      duration=@duration, category=@category, repeat=@repeat
    WHERE id=@id
  `).run(t);
  if (info.changes === 0) return res.status(404).json({ error: "not found" });
  res.json(t);
});

api.delete("/routine/:id", (req, res) => {
  db.prepare("DELETE FROM routine_tasks WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// Override CRUD
api.post("/overrides/:date", (req, res) => {
  const dateKey = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return res.status(400).json({ error: "bad date" });
  const t = sanitizeTask(req.body);
  if (!t) return res.status(400).json({ error: "invalid" });
  db.prepare(`
    INSERT INTO overrides (id, date_key, title, start, duration, category, repeat)
    VALUES (@id, @date_key, @title, @start, @duration, @category, @repeat)
  `).run({ ...t, date_key: dateKey });
  res.json(t);
});

api.put("/overrides/:date/:id", (req, res) => {
  const t = sanitizeTask({ ...req.body, id: req.params.id });
  if (!t) return res.status(400).json({ error: "invalid" });
  const info = db.prepare(`
    UPDATE overrides SET title=@title, start=@start,
      duration=@duration, category=@category, repeat=@repeat
    WHERE id=@id AND date_key=@date_key
  `).run({ ...t, date_key: req.params.date });
  if (info.changes === 0) return res.status(404).json({ error: "not found" });
  res.json(t);
});

api.delete("/overrides/:date/:id", (req, res) => {
  db.prepare("DELETE FROM overrides WHERE id=? AND date_key=?")
    .run(req.params.id, req.params.date);
  res.json({ ok: true });
});

// Completions
api.post("/completions/:date/:taskId", (req, res) => {
  db.prepare("INSERT OR IGNORE INTO completions (date_key, task_id) VALUES (?, ?)")
    .run(req.params.date, req.params.taskId);
  res.json({ ok: true });
});

api.delete("/completions/:date/:taskId", (req, res) => {
  db.prepare("DELETE FROM completions WHERE date_key=? AND task_id=?")
    .run(req.params.date, req.params.taskId);
  res.json({ ok: true });
});

app.use("/api", api);

// ── Input sanitiser ────────────────────────────────────────────────────────────

function sanitizeTask(b) {
  if (!b || typeof b !== "object") return null;
  const id       = typeof b.id === "string" && b.id.length > 0 && b.id.length < 64 ? b.id : null;
  const title    = typeof b.title === "string" ? b.title.trim().slice(0, 200) : "";
  const start    = typeof b.start === "string" && /^\d{2}:\d{2}$/.test(b.start) ? b.start : null;
  const duration = Number.isFinite(+b.duration) ? Math.max(5, Math.min(24 * 60, +b.duration)) : null;
  const category = typeof b.category === "string" ? b.category.slice(0, 32) : null;
  const repeat   = ["daily","weekdays","weekends","none"].includes(b.repeat) ? b.repeat : "none";
  if (!id || !title || !start || !duration || !category) return null;
  return { id, title, start, duration, category, repeat };
}

// ── Serve frontend ─────────────────────────────────────────────────────────────

const webDist = path.resolve(__dirname, "../../web/dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist, { maxAge: "7d", immutable: true }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(webDist, "index.html"));
  });
}

app.listen(PORT, () => console.log(`[daily] :${PORT}`));
