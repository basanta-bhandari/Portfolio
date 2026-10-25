import { isSuperAdmin, normalizePermissions } from '../../lib/auth.js';
import {
  authenticateRequest,
  createAdmin,
  ensureAdminUsersTable,
  publicAdminRecord
} from '../../lib/admin-users.js';
import { sql } from '../../lib/db.js';
import { passwordInput, secureApi } from '../../lib/security.js';

const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,32}$/;

async function handler(req, res) {
  const session = await authenticateRequest(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (!isSuperAdmin(session)) return res.status(403).json({ error: 'Super admin access required' });

  await ensureAdminUsersTable();

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT id, username, role, permissions, is_active, created_at, updated_at
      FROM admin_users
      ORDER BY CASE WHEN role = 'super' THEN 0 ELSE 1 END, lower(username)
    `;
    return res.status(200).json(rows.map(publicAdminRecord));
  }

  if (req.method === 'POST') {
    const { username, password, role = 'admin', permissions = [] } = req.body || {};
    const cleanUsername = String(username || '').trim();
    if (!USERNAME_PATTERN.test(cleanUsername)) {
      return res.status(400).json({ error: 'Username must be 3-32 letters, numbers, dots, dashes, or underscores' });
    }
    if (String(password || '').length < 10) {
      return res.status(400).json({ error: 'Password must be at least 10 characters' });
    }
    passwordInput(password, 'Password', 10);
    if (!['admin', 'super'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const selectedPermissions = normalizePermissions(permissions);
    if (role === 'admin' && !selectedPermissions.length) {
      return res.status(400).json({ error: 'Choose at least one feature for a normal admin' });
    }

    try {
      const admin = await createAdmin({
        username: cleanUsername,
        password,
        role,
        permissions: selectedPermissions
      });
      return res.status(201).json(admin);
    } catch (error) {
      if (String(error?.message).toLowerCase().includes('duplicate')) {
        return res.status(409).json({ error: 'That username already exists' });
      }
      console.error('Could not create admin:', error);
      return res.status(500).json({ error: 'Could not create admin' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
export default secureApi(handler, { maxBytes: 8192 });
