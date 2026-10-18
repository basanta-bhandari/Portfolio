import { sql } from './db.js';

export const DEFAULT_TETHER_SETTINGS = Object.freeze({
  pageEnabled: true,
  navEnabled: true,
  downloadsEnabled: true
});

let settingsTableReady;

export async function ensureSiteSettingsTable() {
  if (!settingsTableReady) {
    settingsTableReady = sql`
      CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
  }
  try {
    await settingsTableReady;
  } catch (error) {
    settingsTableReady = null;
    throw error;
  }
}

export function normalizeTetherSettings(value) {
  return {
    pageEnabled: value?.pageEnabled !== false,
    navEnabled: value?.navEnabled !== false,
    downloadsEnabled: value?.downloadsEnabled !== false
  };
}

export async function getTetherSettings() {
  await ensureSiteSettingsTable();
  const rows = await sql`SELECT value FROM site_settings WHERE key = 'tether' LIMIT 1`;
  return normalizeTetherSettings(rows[0]?.value);
}

export async function saveTetherSettings(value) {
  const settings = normalizeTetherSettings(value);
  await ensureSiteSettingsTable();
  await sql`
    INSERT INTO site_settings (key, value, updated_at)
    VALUES ('tether', ${JSON.stringify(settings)}::jsonb, now())
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now()
  `;
  return settings;
}
