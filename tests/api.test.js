import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./helpers/db-loader.mjs', import.meta.url);
process.env.JWT_SECRET = 'local-test-secret-with-enough-entropy';
process.env.DATABASE_URL = 'postgres://test.invalid/test';
const { signSession } = await import('../lib/auth.js');
let role = 'admin', permissions = ['blog'], revoked = false, fail = false, attempts = 0, projectsTableExists = false;
let projectRows = [{ id: 1, name: 'Existing database project', subtitle: 'Already imported', categories: ['A', 'B', 'C', 'D'], additional_links: [] }];
globalThis.__portfolioTestSql = async (parts, ...values) => {
  if (fail) throw new Error('private connection details');
  const query = parts.join('?');
  if (query.includes('default_projects_v1')) throw new Error('Runtime must not import default projects');
  if (/CREATE TABLE IF NOT EXISTS projects/.test(query)) projectsTableExists = true;
  if (/FROM projects/.test(query) && !projectsTableExists) throw new Error('projects table does not exist');
  if (/INSERT INTO login_attempts/.test(query)) {
    attempts++;
    assert.ok(values[0].every(value => /^[a-f0-9]{64}$/.test(value)));
    return values[0].map(key => ({ key, attempts }));
  }
  if (/INSERT INTO revoked_sessions/.test(query)) { revoked = true; return []; }
  if (/SELECT fingerprint FROM revoked_sessions/.test(query)) return revoked ? [{ fingerprint: 'revoked' }] : [];
  if (/FROM admin_users\s+WHERE id/.test(query)) return [{ id: 1, username: 'tester', password_hash: 'unused', role, permissions, is_active: true, auth_version: 1 }];
  if (/SELECT categories FROM projects/.test(query)) return projectRows.filter(row => row.id === values[0]).map(row => ({ categories: row.categories }));
  if (/INSERT INTO projects/.test(query)) {
    const row = { id: 2, name: values[0], subtitle: values[1], github_url: values[2], additional_links: JSON.parse(values[3]), categories: JSON.parse(values[4]) };
    projectRows.push(row); return [row];
  }
  if (/UPDATE projects/.test(query)) {
    const row = projectRows.find(row => row.id === values[5]);
    if (!row) return [];
    Object.assign(row, { name: values[0], subtitle: values[1], github_url: values[2], additional_links: JSON.parse(values[3]), categories: JSON.parse(values[4]) });
    return [row];
  }
  if (/DELETE FROM projects/.test(query)) { projectRows = projectRows.filter(row => row.id !== values[0]); return []; }
  if (/SELECT \* FROM projects/.test(query)) return projectRows.filter(row => row.id === values[0]);
  if (/FROM projects ORDER BY/.test(query)) return [...projectRows];
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
  await t.test('public projects initialize their schema before querying an older database', async () => {
    const res = response(); await projects(request('GET'), res); assert.equal(res.code, 200); assert.equal(projectsTableExists, true);
  });
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
  await t.test('all database projects support create, edit, and persistent deletion', async () => {
    const body = { name: 'New project', subtitle: 'Description', additionalLinks: [{ label: 'Website', url: 'https://example.com/' }], categories: ['Web'] };
    const created = response(); await projects(request('POST', body), created); assert.equal(created.code, 201);
    const id = created.body.id;
    const edited = response(); await project({ ...request('PUT', { ...body, name: 'Edited project' }), query: { id: String(id) } }, edited);
    assert.equal(edited.code, 200); assert.equal(edited.body.name, 'Edited project');
    assert.deepEqual(edited.body.additional_links, body.additionalLinks);
    const deleted = response(); await project({ ...request('DELETE'), query: { id: String(id) } }, deleted); assert.equal(deleted.code, 200);
    const list = response(); await projects(request('GET'), list); assert.equal(list.body.some(row => row.id === id), false);
    const old = response(); await project(request('DELETE'), old); assert.equal(old.code, 200);
    for (let index = 0; index < 2; index++) {
      const empty = response(); await projects(request('GET'), empty); assert.deepEqual(empty.body, []);
    }
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
