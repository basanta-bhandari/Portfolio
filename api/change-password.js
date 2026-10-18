import { clearSessionCookie, hashPassword, isSuperAdmin, verifyPassword } from '../lib/auth.js';
import { authenticateRequest, findAdminById } from '../lib/admin-users.js';
import { sql } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await authenticateRequest(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (!isSuperAdmin(session)) return res.status(403).json({ error: 'Super admin access required' });

  const { currentPassword, newPassword } = req.body || {};
  if (String(newPassword || '').length < 10) {
    return res.status(400).json({ error: 'New password must be at least 10 characters' });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'Choose a different password' });
  }

  const admin = await findAdminById(session.id);
  if (!admin || !verifyPassword(currentPassword, admin.passwordHash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  await sql`
    UPDATE admin_users
    SET password_hash = ${hashPassword(newPassword)}, auth_version = auth_version + 1, updated_at = now()
    WHERE id = ${session.id}
  `;
  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
}
