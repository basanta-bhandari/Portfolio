import test from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'local-test-secret-with-enough-entropy';

const {
  REMEMBER_SESSION_SECONDS,
  hasPermission,
  hashPassword,
  hashPasswordAsync,
  setSessionCookie,
  signSession,
  verifyPassword,
  verifyPasswordAsync,
  verifyRequest
} = await import('../lib/auth.js');

test('password hashes accept the original password and reject another', () => {
  const stored = hashPassword('a strong test password');
  assert.equal(verifyPassword('a strong test password', stored), true);
  assert.equal(verifyPassword('wrong password', stored), false);
});

test('async password checks preserve stored hashes and reject malformed inputs', async () => {
  const hash = await hashPasswordAsync('correct horse battery staple');
  assert.equal(await verifyPasswordAsync('correct horse battery staple', hash), true);
  assert.equal(await verifyPasswordAsync('wrong password', hash), false);
  for (const bad of [null, {}, [], 'x'.repeat(1025)]) {
    assert.equal(await verifyPasswordAsync(bad, hash), false);
    assert.equal(verifyPassword(bad, hash), false);
  }
  assert.equal(await verifyPasswordAsync('test', 'malformed:deadbeef'), false);
});

test('sessions reject extra segments and expired tokens and have unique IDs', () => {
  const first = signSession({ id: 1 }, 60), second = signSession({ id: 1 }, 60);
  assert.notEqual(first, second);
  assert.equal(verifyRequest({ headers: { cookie: `session=${first}.extra` } }), null);
  const expired = signSession({ id: 1 }, 0.001);
  const original = Date.now;
  try { Date.now = () => original() + 1000; assert.equal(verifyRequest({ headers: { cookie: `session=${expired}` } }), null); }
  finally { Date.now = original; }
});

test('signed sessions verify and reject tampering', () => {
  const token = signSession({ id: 12, user: 'root', role: 'super', permissions: [] }, 60);
  const session = verifyRequest({ headers: { cookie: `session=${encodeURIComponent(token)}` } });
  assert.equal(session.id, 12);
  assert.equal(session.role, 'super');
  assert.equal(verifyRequest({ headers: { cookie: `session=${token}x` } }), null);
});

test('permissions restrict normal admins while super admins retain full access', () => {
  const normal = { role: 'admin', permissions: ['blog'] };
  assert.equal(hasPermission(normal, 'blog'), true);
  assert.equal(hasPermission(normal, 'projects'), false);
  assert.equal(hasPermission({ role: 'super', permissions: [] }, 'projects'), true);
});

test('remembered cookies last thirty days and ordinary cookies remain session cookies', () => {
  const headers = {};
  const response = { setHeader(name, value) { headers[name] = value; } };
  setSessionCookie(response, 'token', REMEMBER_SESSION_SECONDS);
  assert.match(headers['Set-Cookie'], /Max-Age=2592000/);
  setSessionCookie(response, 'token');
  assert.doesNotMatch(headers['Set-Cookie'], /Max-Age=/);
});
