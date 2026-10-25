import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(crypto.scrypt);

const COOKIE_NAME = 'session';
export const SESSION_SECONDS = 12 * 60 * 60;
export const REMEMBER_SESSION_SECONDS = 30 * 24 * 60 * 60;
export const ADMIN_PERMISSIONS = Object.freeze(['blog', 'projects', 'tether']);

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return s;
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function fromBase64url(input) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function parseCookie(header) {
  const out = {};
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) return;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  });
  return out;
}

// Minimal HMAC-signed session token: base64url(payload).base64url(signature)
// This replaces jsonwebtoken - same idea (a signed, tamper-proof token),
// built entirely on Node's built-in crypto module.
export function signSession(payload, lifetimeSeconds = SESSION_SECONDS) {
  const lifetime = Number.isFinite(lifetimeSeconds) && lifetimeSeconds > 0 && lifetimeSeconds <= REMEMBER_SESSION_SECONDS
    ? lifetimeSeconds
    : SESSION_SECONDS;
  const data = JSON.stringify({ ...payload, sid: crypto.randomBytes(24).toString('base64url'), exp: Date.now() + lifetime * 1000 });
  const encoded = base64url(data);
  const sig = crypto.createHmac('sha256', secret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyRequest(req) {
  const token = parseCookie(req.headers.cookie || '')[COOKIE_NAME];
  if (!token || token.length > 4096 || token.split('.').length !== 2) return null;

  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;

  const expected = crypto.createHmac('sha256', secret()).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const payload = JSON.parse(fromBase64url(encoded));
    if (!payload || typeof payload !== 'object' || !Number.isFinite(payload.exp) || Date.now() >= payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionFingerprint(req) {
  const token = parseCookie(req.headers.cookie || '')[COOKIE_NAME];
  return token ? crypto.createHash('sha256').update(token).digest('hex') : null;
}

export function setSessionCookie(res, token, maxAgeSeconds = null) {
  const persistent = Number.isFinite(maxAgeSeconds) && maxAgeSeconds > 0
    ? `; Max-Age=${Math.floor(maxAgeSeconds)}`
    : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/${persistent}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`
  );
}

// Password hashing via scrypt - built into Node, no dependency needed.
// Stored format: "<salt-hex>:<hash-hex>"
export function hashPassword(password) {
  if (typeof password !== 'string' || !password || Buffer.byteLength(password) > 1024) throw new TypeError('Invalid password');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (typeof password !== 'string' || !password || Buffer.byteLength(password) > 1024) return false;
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(String(stored))) return false;
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const attempted = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(attempted, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function hashPasswordAsync(password) {
  if (typeof password !== 'string' || !password || Buffer.byteLength(password) > 1024) throw new TypeError('Invalid password');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scryptAsync(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPasswordAsync(password, stored) {
  if (typeof password !== 'string' || !password || Buffer.byteLength(password) > 1024) return false;
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(String(stored))) return false;
  const [salt, hash] = stored.split(':');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), await scryptAsync(password, salt, 64));
}

export function normalizePermissions(value) {
  const values = Array.isArray(value) ? value : [];
  return [...new Set(values.filter(permission => ADMIN_PERMISSIONS.includes(permission)))];
}

export function isSuperAdmin(session) {
  return session?.role === 'super';
}

export function hasPermission(session, permission) {
  return isSuperAdmin(session) ||
    (ADMIN_PERMISSIONS.includes(permission) && normalizePermissions(session?.permissions).includes(permission));
}
