/**
 * Shared helpers: Upstash Redis (REST) + signed session cookies.
 *
 * Env vars:
 *  - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL /
 *    KV_REST_API_TOKEN — Vercel's marketplace integration injects either set)
 *  - SESSION_SECRET — any long random string; falls back to the LinkedIn
 *    client secret so the tool still works before it's set.
 */
const crypto = require("crypto");

const KV_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";

function kvReady() { return Boolean(KV_URL && KV_TOKEN); }

/* Run one Redis command, e.g. kv(["SET","user:1","{...}"]). Returns .result. */
async function kv(cmd) {
  if (!kvReady()) throw new Error("Database not configured (add the Upstash Redis integration in Vercel).");
  const r = await fetch(KV_URL, {
    method: "POST",
    headers: { authorization: "Bearer " + KV_TOKEN, "content-type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error("Redis: " + j.error);
  return j.result;
}

async function kvGetJSON(key) {
  const raw = await kv(["GET", key]);
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
async function kvSetJSON(key, obj) { return kv(["SET", key, JSON.stringify(obj)]); }

function secret() { return process.env.SESSION_SECRET || process.env.LINKEDIN_CLIENT_SECRET || "dev-secret"; }
function sign(s) { return crypto.createHmac("sha256", secret()).update(s).digest("base64url"); }

/* Session token: <sub>.<expiry-epoch-seconds>.<hmac> */
function makeSession(sub, days) {
  const exp = Math.floor(Date.now() / 1000) + (days || 90) * 86400;
  const base = sub + "." + exp;
  return base + "." + sign(base);
}
function readSession(req) {
  const c = req.headers.cookie || "";
  const m = c.match(/(?:^|;\s*)lib_session=([^;]+)/);
  if (!m) return null;
  const parts = decodeURIComponent(m[1]).split(".");
  if (parts.length !== 3) return null;
  const [sub, exp, sig] = parts;
  if (sign(sub + "." + exp) !== sig) return null;
  if (Math.floor(Date.now() / 1000) > Number(exp)) return null;
  return sub;
}
function sessionCookie(token, maxAge) {
  // Path=/api means the cookie is only sent on /api/* requests — JS can never
  // read it (HttpOnly), and the surface is minimal. Auth state is checked via
  // /api/linkedin?action=me from the page on load.
  return `lib_session=${encodeURIComponent(token)}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function clearSessionCookie() { return sessionCookie("", 0); }

module.exports = { kv, kvReady, kvGetJSON, kvSetJSON, makeSession, readSession, sessionCookie, clearSessionCookie };
