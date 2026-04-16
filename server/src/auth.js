import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "./db.js";

if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET env var is required");
  process.exit(1);
}

const COOKIE = "daily_session";
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: "/",
};

// On boot, if PASSWORD is set, (re-)hash and store it.
// Lets you rotate the password by redeploying with a new PASSWORD env var.
function initPassword() {
  const stored = db.prepare("SELECT value FROM kv WHERE key = 'password_hash'").get();
  const envPw = process.env.PASSWORD;
  if (envPw) {
    const hash = bcrypt.hashSync(envPw, 12);
    db.prepare(`
      INSERT INTO kv (key, value) VALUES ('password_hash', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(hash);
    console.log("[auth] Password updated from env var.");
  } else if (!stored) {
    console.error("FATAL: No password configured. Set the PASSWORD env var.");
    process.exit(1);
  }
}
initPassword();

export function verifyPassword(plain) {
  const row = db.prepare("SELECT value FROM kv WHERE key = 'password_hash'").get();
  if (!row) return false;
  return bcrypt.compareSync(plain, row.value);
}

export function issueToken(res) {
  const token = jwt.sign({ u: "owner" }, process.env.JWT_SECRET, { expiresIn: "30d" });
  res.cookie(COOKIE, token, COOKIE_OPTS);
}

export function clearToken(res) {
  res.clearCookie(COOKIE, { ...COOKIE_OPTS, maxAge: 0 });
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: "unauthorized" });
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "unauthorized" });
  }
}
