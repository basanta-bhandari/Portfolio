import { sql } from '../../lib/db.js';
import { verifyRequest } from '../../lib/auth.js';

export default async function handler(req, res) {
  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid project id' });

  if (req.method === 'GET') {
    const rows = await sql`SELECT * FROM projects WHERE id = ${id}`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json(rows[0]);
  }

  if (!verifyRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method === 'DELETE') {
    await sql`DELETE FROM projects WHERE id = ${id}`;
    return res.status(200).json({ ok: true });
  }
  if (req.method === 'PUT') {
    const { name, subtitle, githubUrl, additionalLinks, categories } = req.body || {};
    if (!name || !subtitle || !Array.isArray(additionalLinks) || !Array.isArray(categories)) {
      return res.status(400).json({ error: 'name, subtitle, links, and categories are required' });
    }
    const rows = await sql`
      UPDATE projects SET name = ${name}, subtitle = ${subtitle}, github_url = ${githubUrl || null},
        additional_links = ${JSON.stringify(additionalLinks)}::jsonb,
        categories = ${JSON.stringify(categories)}::jsonb, updated_at = now()
      WHERE id = ${id}
      RETURNING id, name, subtitle, github_url, additional_links, categories, created_at, updated_at
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json(rows[0]);
  }

  res.setHeader('Allow', 'GET, PUT, DELETE');
  res.status(405).json({ error: 'Method not allowed' });
}
