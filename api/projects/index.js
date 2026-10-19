import { sql } from '../../lib/db.js';
import { hasPermission } from '../../lib/auth.js';
import { authenticateRequest } from '../../lib/admin-users.js';
import { ensureDefaultProjects } from '../../lib/default-projects.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    await ensureDefaultProjects();
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
    const { name, subtitle, githubUrl, additionalLinks = [], categories = [] } = req.body || {};
    if (!name || !subtitle) return res.status(400).json({ error: 'name and subtitle are required' });
    if (!Array.isArray(additionalLinks) || !Array.isArray(categories)) {
      return res.status(400).json({ error: 'links and categories must be lists' });
    }
    if (!categories.length || categories.length > 3) {
      return res.status(400).json({ error: 'new projects need between one and three categories' });
    }
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
