import { hashPassword, isSuperAdmin, normalizePermissions } from '../../lib/auth.js';
import { authenticateRequest, ensureAdminUsersTable, findAdminById, publicAdminRecord } from '../../lib/admin-users.js';
import { sql } from '../../lib/db.js';

async function activeSuperCount() {
  const rows = await sql`
    SELECT count(*)::int AS count
    FROM admin_users
    WHERE role = 'super' AND is_active = TRUE
  `;
  return Number(rows[0]?.count || 0);
}

export default async function handler(req, res) {
  const session = await authenticateRequest(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (!isSuperAdmin(session)) return res.status(403).json({ error: 'Super admin access required' });

  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid admin id' });
  await ensureAdminUsersTable();
  const target = await findAdminById(id);
  if (!target) return res.status(404).json({ error: 'Admin not found' });

  if (req.method === 'DELETE') {
    if (id === session.id) return res.status(400).json({ error: 'You cannot delete your own account' });
    if (target.role === 'super' && target.active && await activeSuperCount() <= 1) {
      return res.status(400).json({ error: 'At least one active super admin is required' });
    }
    await sql`DELETE FROM admin_users WHERE id = ${id}`;
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'PUT') {
    const { username, password, role, permissions, active } = req.body || {};
    const cleanUsername = String(username || '').trim();
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(cleanUsername)) {
      return res.status(400).json({ error: 'Username must be 3-32 letters, numbers, dots, dashes, or underscores' });
    }
    if (!['admin', 'super'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    if (password && String(password).length < 10) {
      return res.status(400).json({ error: 'Replacement password must be at least 10 characters' });
    }
    const selectedPermissions = normalizePermissions(permissions);
    if (role === 'admin' && !selectedPermissions.length) {
      return res.status(400).json({ error: 'Choose at least one feature for a normal admin' });
    }
    const nextActive = active !== false;
    if (id === session.id && cleanUsername !== session.username) {
      return res.status(400).json({ error: 'You cannot rename the account you are currently using' });
    }
    if (id === session.id && (role !== 'super' || !nextActive)) {
      return res.status(400).json({ error: 'You cannot remove your own super admin access' });
    }
    if (target.role === 'super' && target.active && (role !== 'super' || !nextActive) &&
        await activeSuperCount() <= 1) {
      return res.status(400).json({ error: 'At least one active super admin is required' });
    }

    const safePermissions = role === 'super' ? [] : selectedPermissions;
    try {
      const rows = password
        ? await sql`
            UPDATE admin_users
            SET username = ${cleanUsername}, password_hash = ${hashPassword(password)},
                role = ${role}, permissions = ${JSON.stringify(safePermissions)}::jsonb,
                is_active = ${nextActive}, auth_version = auth_version + 1, updated_at = now()
            WHERE id = ${id}
            RETURNING id, username, role, permissions, is_active, created_at, updated_at
          `
        : await sql`
            UPDATE admin_users
            SET username = ${cleanUsername}, role = ${role},
                permissions = ${JSON.stringify(safePermissions)}::jsonb,
                is_active = ${nextActive}, updated_at = now()
            WHERE id = ${id}
            RETURNING id, username, role, permissions, is_active, created_at, updated_at
          `;
      return res.status(200).json(publicAdminRecord(rows[0]));
    } catch (error) {
      if (String(error?.message).toLowerCase().includes('duplicate')) {
        return res.status(409).json({ error: 'That username already exists' });
      }
      console.error('Could not update admin:', error);
      return res.status(500).json({ error: 'Could not update admin' });
    }
  }

  res.setHeader('Allow', 'PUT, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
