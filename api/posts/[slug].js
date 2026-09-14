import { sql } from '../../lib/db.js';
import { verifyRequest } from '../../lib/auth.js';

export default async function handler(req, res) {
  const { slug } = req.query;

  if (req.method === 'GET') {
    const rows = await sql`SELECT * FROM posts WHERE slug = ${slug}`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });

    if (req.query.format === 'markdown') {
      const session = verifyRequest(req);
      if (!session) return res.status(401).json({ error: 'Unauthorized' });

      const post = rows[0];
      const filename = `${post.slug}.md`.replace(/[^a-z0-9._-]/gi, '-');
      const frontmatter = [
        '---',
        `title: ${JSON.stringify(post.title)}`,
        `slug: ${post.slug}`,
        `published_at: ${new Date(post.published_at).toISOString()}`,
        post.updated_at ? `updated_at: ${new Date(post.updated_at).toISOString()}` : null,
        post.excerpt ? `excerpt: ${JSON.stringify(post.excerpt)}` : null,
        '---',
        ''
      ].filter(Boolean).join('\n');
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(`${frontmatter}\n${post.content}\n`);
    }

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
        excerpt = COALESCE(${excerpt}, excerpt),
        updated_at = now()
      WHERE slug = ${slug}
      RETURNING id, title, slug, excerpt, published_at, updated_at
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json(rows[0]);
  }

  res.setHeader('Allow', 'GET, PUT, DELETE');
  res.status(405).json({ error: 'Method not allowed' });
}
