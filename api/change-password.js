import { clearSessionCookie, hashPasswordAsync, isSuperAdmin, verifyPasswordAsync } from '../lib/auth.js';
import { passwordInput, secureApi } from '../lib/security.js';
import { authenticateRequest, findAdminById } from '../lib/admin-users.js';
import { sql } from '../lib/db.js';
import { allowLogin } from '../lib/login-security.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await authenticateRequest(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (!isSuperAdmin(session)) return res.status(403).json({ error: 'Super admin access required' });

  const currentPassword = passwordInput(req.body?.currentPassword, 'Current password');
  const newPassword = passwordInput(req.body?.newPassword, 'New password', 10);
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'Choose a different password' });
  }
  if (!await allowLogin(req, `password-change:${session.id}`)) {
    res.setHeader('Retry-After', '900');
    return res.status(429).json({ error: 'Too many password attempts. Try again in 15 minutes.' });
  }

  const admin = await findAdminById(session.id);
  if (!admin || !await verifyPasswordAsync(currentPassword, admin.passwordHash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  await sql`
    UPDATE admin_users
    SET password_hash = ${await hashPasswordAsync(newPassword)}, auth_version = auth_version + 1, updated_at = now()
    WHERE id = ${session.id}
  `;
  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
}
export default secureApi(handler, { maxBytes: 8192 });
