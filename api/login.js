import {
  REMEMBER_SESSION_SECONDS,
  SESSION_SECONDS,
  signSession,
  setSessionCookie,
  verifyPassword
} from '../lib/auth.js';
import { bootstrapSuperAdmin, findAdminByUsername } from '../lib/admin-users.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password, remember = false } = req.body || {};
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
  const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

  if (!username || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }
  try {
    let admin = await findAdminByUsername(username);
    if (!admin && username === ADMIN_USERNAME && ADMIN_PASSWORD_HASH &&
        verifyPassword(password, ADMIN_PASSWORD_HASH)) {
      admin = await bootstrapSuperAdmin(ADMIN_USERNAME, ADMIN_PASSWORD_HASH);
    }
    if (!admin?.active || !verifyPassword(password, admin.passwordHash)) {
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
