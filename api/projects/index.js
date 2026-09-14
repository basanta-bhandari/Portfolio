import { sql } from '../../lib/db.js';
import { verifyRequest } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const rows = await sql`
      SELECT id, name, subtitle, github_url, additional_links, categories, created_at, updated_at
      FROM projects ORDER BY created_at DESC
    `;
    return res.status(200).json(rows);
  }

  if (req.method === 'POST') {
    if (!verifyRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    const { name, subtitle, githubUrl, additionalLinks = [], categories = [] } = req.body || {};
    if (!name || !subtitle) return res.status(400).json({ error: 'name and subtitle are required' });
    if (!Array.isArray(additionalLinks) || !Array.isArray(categories)) {
      return res.status(400).json({ error: 'links and categories must be lists' });
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
