import { sql } from '../../lib/db.js';
import { verifyRequest } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const rows = await sql`
      SELECT id, title, slug, excerpt, published_at
      FROM posts
      ORDER BY published_at DESC
    `;
    return res.status(200).json(rows);
  }

  if (req.method === 'POST') {
    const session = verifyRequest(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });

    const { title, slug, content, excerpt } = req.body || {};
    if (!title || !slug || !content) {
      return res.status(400).json({ error: 'title, slug, and content are required' });
    }

    try {
      const rows = await sql`
        INSERT INTO posts (title, slug, content, excerpt)
        VALUES (${title}, ${slug}, ${content}, ${excerpt || null})
        RETURNING id, title, slug, published_at
      `;
      return res.status(201).json(rows[0]);
    } catch (err) {
      if (String(err.message).includes('duplicate key')) {
        return res.status(409).json({ error: 'A post with that slug already exists' });
      }
      return res.status(500).json({ error: 'Failed to create post' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'Method not allowed' });
}
