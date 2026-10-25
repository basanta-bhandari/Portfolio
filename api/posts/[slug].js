import { sql } from '../../lib/db.js';
import { hasPermission } from '../../lib/auth.js';
import { authenticateRequest } from '../../lib/admin-users.js';
import { InputError, postInput, secureApi } from '../../lib/security.js';

async function handler(req, res) {
  const { slug } = req.query;
  if (typeof slug !== 'string' || !slug || slug.length > 200) throw new InputError('Invalid post slug');

  if (req.method === 'GET') {
    const rows = await sql`SELECT * FROM posts WHERE slug = ${slug}`;
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });

    if (req.query.format === 'markdown') {
      const session = await authenticateRequest(req);
      if (!session) return res.status(401).json({ error: 'Unauthorized' });
      if (!hasPermission(session, 'blog')) return res.status(403).json({ error: 'Blog access required' });

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
  const session = await authenticateRequest(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (!hasPermission(session, 'blog')) return res.status(403).json({ error: 'Blog access required' });

  if (req.method === 'DELETE') {
    await sql`DELETE FROM posts WHERE slug = ${slug}`;
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'PUT') {
    const { title, content, excerpt } = postInput(req.body || {}, true);
    const rows = await sql`
      UPDATE posts SET
        title = COALESCE(${title ?? null}, title),
        content = COALESCE(${content ?? null}, content),
        excerpt = COALESCE(${excerpt ?? null}, excerpt),
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
export default secureApi(handler);
