import test from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'local-test-secret-with-enough-entropy';

const {
  REMEMBER_SESSION_SECONDS,
  hasPermission,
  hashPassword,
  setSessionCookie,
  signSession,
  verifyPassword,
  verifyRequest
} = await import('../lib/auth.js');

test('password hashes accept the original password and reject another', () => {
  const stored = hashPassword('a strong test password');
  assert.equal(verifyPassword('a strong test password', stored), true);
  assert.equal(verifyPassword('wrong password', stored), false);
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
