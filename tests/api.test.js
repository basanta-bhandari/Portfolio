import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./helpers/db-loader.mjs', import.meta.url);
process.env.JWT_SECRET = 'local-test-secret-with-enough-entropy';
process.env.DATABASE_URL = 'postgres://test.invalid/test';
const { signSession } = await import('../lib/auth.js');
let role = 'admin', permissions = ['blog'], revoked = false, fail = false, attempts = 0;
globalThis.__portfolioTestSql = async (parts, ...values) => {
  if (fail) throw new Error('private connection details');
  const query = parts.join('?');
  if (/INSERT INTO login_attempts/.test(query)) {
    attempts++;
    assert.ok(values[0].every(value => /^[a-f0-9]{64}$/.test(value)));
    return values[0].map(key => ({ key, attempts }));
  }
  if (/INSERT INTO revoked_sessions/.test(query)) { revoked = true; return []; }
  if (/SELECT fingerprint FROM revoked_sessions/.test(query)) return revoked ? [{ fingerprint: 'revoked' }] : [];
  if (/FROM admin_users\s+WHERE id/.test(query)) return [{ id: 1, username: 'tester', password_hash: 'unused', role, permissions, is_active: true, auth_version: 1 }];
  if (/SELECT categories FROM projects/.test(query)) return [{ categories: ['A', 'B', 'C', 'D'] }];
  if (/UPDATE projects/.test(query)) return [{ id: 1, name: values[0] }];
  return [];
};
const posts = (await import('../api/posts/index.js')).default;
const projects = (await import('../api/projects/index.js')).default;
const project = (await import('../api/projects/[id].js')).default;
const session = (await import('../api/session.js')).default;
const logout = (await import('../api/logout.js')).default;
const login = (await import('../api/login.js')).default;
const users = (await import('../api/admin-users/index.js')).default;
const { allowLogin } = await import('../lib/login-security.js');
function response() { return { headers: {}, code: 200, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } }; }
function request(method = 'POST', body) { return { method, body, query: { id: '1' }, headers: { origin: 'https://www.basanta.cc', 'content-type': 'application/json', cookie: `session=${signSession({ id: 1, user: 'tester', authVersion: 1 })}` } }; }

test('admin permission, session revocation, and endpoint validation regressions', async t => {
  await t.test('normal blog admins cannot create projects or manage users', async () => {
    for (const handler of [projects, users]) { const res = response(); await handler(request('POST', {}), res); assert.equal(res.code, 403); }
  });
  await t.test('invalid cookies cannot write posts', async () => {
    const req = request('POST', {}); req.headers.cookie = 'session=forged';
    const res = response(); await posts(req, res); assert.equal(res.code, 401);
  });
  await t.test('wrong content types and cross-site writes fail before auth', async () => {
    const req = request('POST', {}); req.headers.origin = 'https://attacker.example';
    const res = response(); await posts(req, res); assert.equal(res.code, 403);
  });
  await t.test('session reads are never cacheable', async () => {
    const res = response(); await session(request('GET'), res); assert.equal(res.body.loggedIn, true); assert.match(res.headers['Cache-Control'], /no-store/);
  });
  await t.test('malformed login inputs are rejected without password hashing', async () => {
    const res = response(); await login(request('POST', { username: {}, password: [] }), res); assert.equal(res.code, 400);
  });
  await t.test('project edits grandfather only unchanged old category sets', async () => {
    role = 'super';
    const body = { name: 'Project', subtitle: 'Description', additionalLinks: [], categories: ['A', 'B', 'C', 'D'] };
    const ok = response(); await project(request('PUT', body), ok); assert.equal(ok.code, 200);
    const bad = response(); await project(request('PUT', { ...body, categories: ['A', 'B', 'C', 'E'] }), bad); assert.equal(bad.code, 400);
  });
  await t.test('logout invalidates a replayed token on the server', async () => {
    const req = request('POST'); const out = response(); await logout(req, out); assert.equal(out.code, 200); assert.match(out.headers['Set-Cookie'], /Max-Age=0/);
    const res = response(); await session({ ...req, method: 'GET' }, res); assert.equal(res.body.loggedIn, false);
  });
  await t.test('account login attempts are bounded and only keyed hashes reach storage', async () => {
    for (let index = 0; index < 10; index++) assert.equal(await allowLogin(request(), 'tester'), true);
    assert.equal(await allowLogin(request(), 'tester'), false);
  });
  await t.test('database failures return a controlled response', async () => {
    fail = true; const res = response(); await projects(request('GET'), res); assert.equal(res.code, 500); assert.doesNotMatch(JSON.stringify(res.body), /private connection/);
  });
});
