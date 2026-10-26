import { sql } from '../../lib/db.js';
import { hasPermission } from '../../lib/auth.js';
import { authenticateRequest } from '../../lib/admin-users.js';
import { projectInput, secureApi } from '../../lib/security.js';
import { ensureProjectsTable } from '../../lib/projects.js';

async function handler(req, res) {
  if (req.method === 'GET') {
    await ensureProjectsTable();
    const rows = await sql`
      SELECT id, name, subtitle, github_url, additional_links, categories, created_at, updated_at
      FROM projects ORDER BY created_at DESC, id DESC
    `;
    return res.status(200).json(rows);
  }

  if (req.method === 'POST') {
    const session = await authenticateRequest(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    if (!hasPermission(session, 'projects')) return res.status(403).json({ error: 'Projects access required' });
    await ensureProjectsTable();
    const { name, subtitle, githubUrl, additionalLinks, categories } = projectInput({ additionalLinks: [], categories: [], ...req.body });
    const rows = await sql`
      INSERT INTO projects (name, subtitle, github_url, additional_links, categories)
      VALUES (${name}, ${subtitle}, ${githubUrl || null}, ${JSON.stringify(additionalLinks)}::jsonb, ${JSON.stringify(categories)}::jsonb)
      RETURNING id, name, subtitle, github_url, additional_links, categories, created_at, updated_at
    `;
    return res.status(201).json(rows[0]);
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'Method not allowed' });
}
export default secureApi(handler, { maxBytes: 32768 });
