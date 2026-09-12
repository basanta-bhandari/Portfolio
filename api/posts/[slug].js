import { sql } from '../../lib/db.js';
import { verifyRequest } from '../../lib/auth.js';

export default async function handler(req, res) {
  const { slug } = req.query;

  if (req.method === 'GET') {
    const rows = await sql`SELECT * FROM posts WHERE slug = ${slug}`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json(rows[0]);
  }

  // Everything below this line requires a logged-in session.
  const session = verifyRequest(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'DELETE') {
    await sql`DELETE FROM posts WHERE slug = ${slug}`;
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'PUT') {
    const { title, content, excerpt } = req.body || {};
    const rows = await sql`
      UPDATE posts SET
        title = COALESCE(${title}, title),
        content = COALESCE(${content}, content),
        excerpt = COALESCE(${excerpt}, excerpt)
      WHERE slug = ${slug}
      RETURNING id, title, slug, published_at
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json(rows[0]);
  }

  res.setHeader('Allow', 'GET, PUT, DELETE');
  res.status(405).json({ error: 'Method not allowed' });
}
