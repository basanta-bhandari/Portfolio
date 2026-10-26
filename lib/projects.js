import { sql } from './db.js';

let ready;

// Older deployments used hardcoded cards and may never have created this table.
export async function ensureProjectsTable() {
  if (!ready) ready = (async () => {
    await sql`CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      github_url TEXT,
      additional_links JSONB NOT NULL DEFAULT '[]'::jsonb,
      categories JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ
    )`;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`;
  })();
  try { await ready; }
  catch (error) { ready = null; throw error; }
}
