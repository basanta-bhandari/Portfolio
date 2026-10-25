const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SITE_ORIGINS = new Set(['https://www.basanta.cc', 'https://basanta.cc']);

export class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function sameOrigin(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const allowed = new Set(SITE_ORIGINS);
  if (process.env.VERCEL_URL) allowed.add(`https://${process.env.VERCEL_URL}`);
  if (!process.env.VERCEL) {
    allowed.add('http://localhost:8000');
    allowed.add('http://127.0.0.1:8000');
  }
  const origin = req.headers.origin;
  if (origin) return typeof origin === 'string' && allowed.has(origin);
  try { return allowed.has(new URL(req.headers.referer).origin); }
  catch { return false; }
}

export function secureApi(handler, { maxBytes = 2 * 1024 * 1024 } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (WRITE_METHODS.has(req.method)) {
        if (!sameOrigin(req)) return res.status(403).json({ error: 'Request origin is not allowed' });
        const declared = Number(req.headers['content-length'] || 0);
        if (!Number.isFinite(declared) || declared < 0 || declared > maxBytes) {
          throw new InputError('Request is too large', 413);
        }
        const emptyBody = req.body == null || req.body === '' ||
          (!declared && typeof req.body === 'object' && !Array.isArray(req.body) && !Object.keys(req.body).length && !req.headers['content-type']);
        if (!emptyBody) {
          if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
            throw new InputError('Use application/json for request bodies', 415);
          }
          if (typeof req.body !== 'object' || Array.isArray(req.body)) throw new InputError('Expected a JSON object');
          if (Buffer.byteLength(JSON.stringify(req.body)) > maxBytes) throw new InputError('Request is too large', 413);
        }
      }
      return await handler(req, res);
    } catch (error) {
      if (error instanceof InputError) return res.status(error.status).json({ error: error.message });
      // Never send SQL details, connection strings, or stack traces to the browser.
      console.error('API request failed:', error?.name || 'Error', error?.code || '');
      return res.status(500).json({ error: 'Service is temporarily unavailable. Please try again.' });
    }
  };
}

export function text(value, name, { min = 1, max = 200, trim = true } = {}) {
  if (typeof value !== 'string') throw new InputError(`${name} must be text`);
  const result = trim ? value.trim() : value;
  if (result.length < min || result.length > max || result.includes('\0')) {
    throw new InputError(`${name} must be ${min}–${max} characters`);
  }
  return result;
}

export function passwordInput(value, name = 'Password', min = 1) {
  const result = text(value, name, { min, max: 1024, trim: false });
  if (Buffer.byteLength(result) > 1024) throw new InputError(`${name} must be at most 1024 bytes`);
  return result;
}

export function webUrl(value, name = 'URL', optional = false) {
  if (optional && (value == null || value === '')) return null;
  const raw = text(value, name, { max: 2048 });
  try {
    const parsed = new URL(raw);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
    return parsed.href;
  } catch { throw new InputError(`${name} must be an HTTP or HTTPS URL without credentials`); }
}

export function postInput(body, partial = false) {
  const result = {};
  for (const [key, options] of [['title', { max: 200 }], ['content', { max: 1500000, trim: false }], ['excerpt', { min: 0, max: 2000 }]]) {
    if (partial && body[key] === undefined) continue;
    result[key] = text(body[key] ?? (key === 'excerpt' ? '' : undefined), key, options);
  }
  if (!partial) {
    result.slug = text(body.slug, 'slug', { max: 160 });
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.slug)) throw new InputError('Slug must use lowercase letters, numbers, and single dashes');
  }
  return result;
}

export function projectInput(body, { legacyCategories = [] } = {}) {
  const name = text(body.name, 'Name', { max: 200 });
  const subtitle = text(body.subtitle, 'Description', { max: 4000 });
  const githubUrl = webUrl(body.githubUrl, 'GitHub URL', true);
  if (!Array.isArray(body.additionalLinks) || body.additionalLinks.length > 15) throw new InputError('Use at most 15 additional links');
  const additionalLinks = body.additionalLinks.map(link => {
    if (typeof link === 'string') return webUrl(link);
    if (!link || typeof link !== 'object' || Array.isArray(link)) throw new InputError('Invalid link');
    return { url: webUrl(link.url), label: text(link.label || 'Visit', 'Link label', { max: 80 }) };
  });
  if (!Array.isArray(body.categories) || body.categories.length > 50) throw new InputError('Invalid categories');
  const categories = [...new Set(body.categories.map(category => text(category, 'Category', { max: 60 })))];
  const unchangedLegacy = categories.length === legacyCategories.length && categories.every(category => legacyCategories.includes(category));
  if (!categories.length || (categories.length > 3 && !unchangedLegacy)) throw new InputError('Choose one to three categories');
  return { name, subtitle, githubUrl, additionalLinks, categories };
}
