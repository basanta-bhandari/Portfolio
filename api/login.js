import {
  REMEMBER_SESSION_SECONDS,
  SESSION_SECONDS,
  signSession,
  setSessionCookie,
  verifyPasswordAsync
} from '../lib/auth.js';
import { bootstrapSuperAdmin, findAdminByUsername } from '../lib/admin-users.js';
import { passwordInput, secureApi, text } from '../lib/security.js';
import { allowLogin } from '../lib/login-security.js';

const DUMMY_HASH = '0'.repeat(32) + ':' + '0'.repeat(128);

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const username = text(body.username, 'Username', { max: 64 });
  const password = passwordInput(body.password);
  const remember = body.remember === true;
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
  const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

  if (!await allowLogin(req, username)) {
    res.setHeader('Retry-After', '900');
    return res.status(429).json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' });
  }
  try {
    let admin = await findAdminByUsername(username);
    if (!admin && username === ADMIN_USERNAME && ADMIN_PASSWORD_HASH &&
        await verifyPasswordAsync(password, ADMIN_PASSWORD_HASH)) {
      admin = await bootstrapSuperAdmin(ADMIN_USERNAME, ADMIN_PASSWORD_HASH);
    }
    const validPassword = await verifyPasswordAsync(password, admin?.passwordHash || DUMMY_HASH);
    if (!admin?.active || !validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const lifetime = remember ? REMEMBER_SESSION_SECONDS : SESSION_SECONDS;
    const token = signSession({
      id: admin.id,
      user: admin.username,
      role: admin.role,
      permissions: admin.permissions,
      authVersion: admin.authVersion
    }, lifetime);
    setSessionCookie(res, token, remember ? lifetime : null);
    return res.status(200).json({
      ok: true,
      role: admin.role,
      permissions: admin.permissions,
      remembered: Boolean(remember)
    });
  } catch (error) {
    console.error('Admin login failed:', error);
    return res.status(500).json({ error: 'Login is temporarily unavailable' });
  }
}

export default secureApi(handler, { maxBytes: 8192 });
