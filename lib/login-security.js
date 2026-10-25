import crypto from 'node:crypto';
import { sql } from './db.js';

let ready;
async function ensureTable() {
  if (!ready) ready = sql`CREATE TABLE IF NOT EXISTS login_attempts (
    key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL
  )`.catch(error => { ready = null; throw error; });
  await ready;
}

export async function allowLogin(req, username) {
  await ensureTable();
  // Vercel overwrites x-forwarded-for at its ingress. Never use a client-supplied username as the only limiter.
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const keys = [`ip:${ip}`, `user:${username.toLowerCase()}`].map(value =>
    crypto.createHmac('sha256', process.env.JWT_SECRET).update(value).digest('hex'));
  const rows = await sql`
    INSERT INTO login_attempts (key, attempts, expires_at)
    SELECT key, 1, now() + interval '15 minutes' FROM unnest(${keys}::text[]) AS key
    ON CONFLICT (key) DO UPDATE SET
      attempts = CASE WHEN login_attempts.expires_at <= now() THEN 1 ELSE login_attempts.attempts + 1 END,
      expires_at = CASE WHEN login_attempts.expires_at <= now() THEN now() + interval '15 minutes' ELSE login_attempts.expires_at END
    RETURNING key, attempts, expires_at
  `;
  // Opportunistic bounded cleanup; account names and IPs are stored only as keyed hashes.
  await sql`DELETE FROM login_attempts WHERE key IN (SELECT key FROM login_attempts WHERE expires_at < now() LIMIT 100)`;
  return rows.every(row => Number(row.attempts) <= (row.key === keys[0] ? 50 : 10));
}
