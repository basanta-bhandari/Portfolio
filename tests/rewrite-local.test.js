import test from 'node:test';
import assert from 'node:assert/strict';
import { localBase, listLocalModels, localEngine } from '../admin/rewrite-local.js';

test('normalizes local model server addresses and rejects remote or credential URLs', () => {
  assert.equal(localBase('localhost:11434/api/chat'), 'http://localhost:11434/v1');
  assert.equal(localBase('http://127.0.0.1:1234/v1/chat/completions'), 'http://127.0.0.1:1234/v1');
  assert.throws(() => localBase('https://example.com/v1'));
  assert.throws(() => localBase('http://name:secret@localhost/v1'));
});
test('lists models and sends a token-free completion to the selected server', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => url.endsWith('/models') ? { data: [{ id: 'local-3b' }] } : { choices: [{ message: { content: '# Revised' }, finish_reason: 'stop' }] } };
  };
  assert.deepEqual(await listLocalModels('localhost:1234', fetcher), ['local-3b']);
  await localEngine('localhost:1234', 'local-3b', fetcher).chat.completions.create({ messages: [{ role: 'user', content: '# Draft' }], max_tokens: 100 });
  assert.equal(calls[1].url, 'http://localhost:1234/v1/chat/completions');
  assert.equal(calls[1].options.credentials, 'omit');
  assert.equal(calls[1].options.headers.Authorization, undefined);
  assert.equal(JSON.parse(calls[1].options.body).model, 'local-3b');
});
test('empty model lists, connection failures and truncated output are errors', async () => {
  await assert.rejects(listLocalModels('localhost:1234', async () => ({ ok: true, json: async () => ({ data: [] }) })), /no models/);
  await assert.rejects(listLocalModels('localhost:1234', async () => { throw new Error('offline'); }), /Cannot reach/);
  const engine = localEngine('localhost:1234', 'test', async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'length' }] }) }));
  await assert.rejects(engine.chat.completions.create({ messages: [] }), /output limit/);
});
