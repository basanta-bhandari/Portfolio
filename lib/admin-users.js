import { sql } from './db.js';
import { hashPasswordAsync, normalizePermissions, sessionFingerprint, verifyRequest } from './auth.js';

let adminUsersTableReady;

export async function ensureAdminUsersTable() {
  if (!adminUsersTableReady) {
    adminUsersTableReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS admin_users (
          id SERIAL PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('super', 'admin')),
          permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          auth_version INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ
        )
      `;
      await sql`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 1`;
      await sql`CREATE TABLE IF NOT EXISTS revoked_sessions (fingerprint TEXT PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL)`;
      await sql`CREATE INDEX IF NOT EXISTS revoked_sessions_expiry ON revoked_sessions (expires_at)`;
    })();
  }
  try {
    await adminUsersTableReady;
  } catch (error) {
    adminUsersTableReady = null;
    throw error;
  }
}

function adminRecord(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
    permissions: normalizePermissions(row.permissions),
    active: row.is_active !== false,
    authVersion: Number(row.auth_version || 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function publicAdminRecord(row) {
  const admin = row?.password_hash ? adminRecord(row) : row;
  if (!admin) return null;
  return {
    id: Number(admin.id),
    username: admin.username,
    role: admin.role,
    permissions: normalizePermissions(admin.permissions),
    active: admin.active ?? admin.is_active !== false,
    createdAt: admin.createdAt ?? admin.created_at,
    updatedAt: admin.updatedAt ?? admin.updated_at
  };
}

export async function findAdminByUsername(username) {
  await ensureAdminUsersTable();
  const rows = await sql`
    SELECT id, username, password_hash, role, permissions, is_active, auth_version, created_at, updated_at
    FROM admin_users
    WHERE lower(username) = lower(${username})
    LIMIT 1
  `;
  return adminRecord(rows[0]);
}

export async function findAdminById(id) {
  await ensureAdminUsersTable();
  const rows = await sql`
    SELECT id, username, password_hash, role, permissions, is_active, auth_version, created_at, updated_at
    FROM admin_users
    WHERE id = ${id}
    LIMIT 1
  `;
  return adminRecord(rows[0]);
}

export async function bootstrapSuperAdmin(username, passwordHash) {
  await ensureAdminUsersTable();
  const existing = await findAdminByUsername(username);
  if (existing) return existing;

  const superRows = await sql`
    SELECT id FROM admin_users WHERE role = 'super' LIMIT 1
  `;
  if (superRows[0]) return null;

  const rows = await sql`
    INSERT INTO admin_users (username, password_hash, role, permissions)
    VALUES (${username}, ${passwordHash}, 'super', '[]'::jsonb)
    ON CONFLICT (username) DO NOTHING
    RETURNING id, username, password_hash, role, permissions, is_active, auth_version, created_at, updated_at
  `;
  return adminRecord(rows[0]) || findAdminByUsername(username);
}

export async function authenticateRequest(req) {
  const tokenSession = verifyRequest(req);
  const id = Number(tokenSession?.id);
  if (!Number.isInteger(id) || id < 1) return null;
  const admin = await findAdminById(id);
  if (!admin?.active || admin.username !== tokenSession.user ||
      admin.authVersion !== Number(tokenSession.authVersion)) return null;
  const revoked = await sql`SELECT fingerprint FROM revoked_sessions WHERE fingerprint = ${sessionFingerprint(req)} AND expires_at > now()`;
  if (revoked.length) return null;
  return publicAdminRecord(admin);
}

export async function revokeSession(req) {
  const session = verifyRequest(req);
  if (!session) return;
  await ensureAdminUsersTable();
  await sql`INSERT INTO revoked_sessions (fingerprint, expires_at) VALUES (${sessionFingerprint(req)}, ${new Date(session.exp).toISOString()}) ON CONFLICT (fingerprint) DO NOTHING`;
  await sql`DELETE FROM revoked_sessions WHERE fingerprint IN (SELECT fingerprint FROM revoked_sessions WHERE expires_at <= now() LIMIT 100)`;
}

export async function createAdmin({ username, password, role, permissions }) {
  await ensureAdminUsersTable();
  const safeRole = role === 'super' ? 'super' : 'admin';
  const safePermissions = safeRole === 'super' ? [] : normalizePermissions(permissions);
  const rows = await sql`
    INSERT INTO admin_users (username, password_hash, role, permissions)
    VALUES (${username}, ${await hashPasswordAsync(password)}, ${safeRole}, ${JSON.stringify(safePermissions)}::jsonb)
    RETURNING id, username, role, permissions, is_active, created_at, updated_at
  `;
  return publicAdminRecord(rows[0]);
}
