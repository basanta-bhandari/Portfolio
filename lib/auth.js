import crypto from 'node:crypto';

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
  const lifetime = Number.isFinite(lifetimeSeconds) && lifetimeSeconds > 0
    ? lifetimeSeconds
    : SESSION_SECONDS;
  const data = JSON.stringify({ ...payload, exp: Date.now() + lifetime * 1000 });
  const encoded = base64url(data);
  const sig = crypto.createHmac('sha256', secret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyRequest(req) {
  const token = parseCookie(req.headers.cookie || '')[COOKIE_NAME];
  if (!token) return null;

  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;

  const expected = crypto.createHmac('sha256', secret()).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const payload = JSON.parse(fromBase64url(encoded));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
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
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const attempted = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(attempted, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
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
