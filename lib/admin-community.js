import { sql } from './db.js';

const ONLINE_SECONDS = 75;
let tablesReady;

export async function ensureAdminCommunityTables() {
  if (!tablesReady) {
    tablesReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS admin_presence (
          admin_id INTEGER PRIMARY KEY REFERENCES admin_users(id) ON DELETE CASCADE,
          last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
    })();
  }

  try {
    await tablesReady;
  } catch (error) {
    tablesReady = null;
    throw error;
  }
}

export async function touchAdminPresence(adminId) {
  await ensureAdminCommunityTables();
  await sql`
    INSERT INTO admin_presence (admin_id, last_seen)
    VALUES (${adminId}, now())
    ON CONFLICT (admin_id) DO UPDATE SET last_seen = now()
  `;
}

export async function markAdminOffline(adminId) {
  await ensureAdminCommunityTables();
  await sql`DELETE FROM admin_presence WHERE admin_id = ${adminId}`;
}

export async function listAdminPresence() {
  await ensureAdminCommunityTables();
  const rows = await sql`
    SELECT
      users.id,
      users.username,
      users.role,
      presence.last_seen,
      COALESCE(
        presence.last_seen > now() - (${ONLINE_SECONDS} * interval '1 second'),
        false
      ) AS online
    FROM admin_users users
    LEFT JOIN admin_presence presence ON presence.admin_id = users.id
    WHERE users.is_active = true
    ORDER BY online DESC, lower(users.username) ASC
  `;
  return rows.map(row => ({
    id: Number(row.id),
    username: row.username,
    role: row.role,
    online: row.online === true,
    lastSeen: row.last_seen || null
  }));
}
