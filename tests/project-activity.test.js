import test from 'node:test';
import assert from 'node:assert/strict';
import { githubRepository, githubCommitDates, orderProjects } from '../projects/activity.js';

function storage() {
  let value = null;
  return { getItem: () => value, setItem: (_key, next) => { value = next; } };
}
const project = repo => ({ github_url: `https://github.com/example/${repo}` });
const commitResponse = date => ({ ok: true, status: 200, json: async () => [{ commit: { committer: { date } } }] });

test('only GitHub repository links are used, including named legacy links', () => {
  assert.equal(githubRepository({ github_url: 'https://www.github.com/Example/Repo.git/tree/main' }), 'example/repo');
  assert.equal(githubRepository({ additional_links: JSON.stringify([{ label: 'Source', url: 'https://github.com/example/repo' }]) }), 'example/repo');
  for (const url of ['https://github.com.evil.test/a/b', 'https://password@github.com/a/b', 'https://github.com:8080/a/b', 'javascript:alert(1)', 'https://github.com/example']) assert.equal(githubRepository({ github_url: url }), null);
});

test('latest actual commits win; unavailable dates keep stable database order', () => {
  const rows = [project('older'), { name: 'No repository' }, project('newer'), project('private')];
  const dates = new Map([['example/older', '2026-10-01T00:00:00Z'], ['example/newer', '2026-10-29T00:00:00Z']]);
  assert.deepEqual(orderProjects(rows, dates).map(row => row.project), [rows[2], rows[0], rows[1], rows[3]]);
  assert.deepEqual(orderProjects(rows, new Map()).map(row => row.project), rows);
});

test('duplicate repos make one request; fresh browser cache avoids further API calls', async () => {
  let requests = 0;
  const cache = storage(), rows = [project('same'), project('same')];
  const fetch = async (url, options) => {
    requests++;
    assert.equal(url, 'https://api.github.com/repos/example/same/commits?per_page=1');
    assert.equal(options.credentials, 'omit');
    return commitResponse('2026-10-29T10:00:00Z');
  };
  const first = await githubCommitDates(rows, { fetch, storage: cache });
  assert.equal(requests, 1); assert.equal(first.dates.get('example/same'), '2026-10-29T10:00:00Z');
  const second = await githubCommitDates(rows, { fetch, storage: cache });
  assert.equal(requests, 1); assert.deepEqual(second.dates, first.dates);
});

test('GitHub failure preserves older cached dates and backs off repeated requests', async () => {
  const cache = storage();
  cache.setItem('', JSON.stringify({ 'example/repo': { date: '2026-10-01T00:00:00Z', checkedAt: Date.now() - 7200000 } }));
  let requests = 0;
  const fetch = async () => { requests++; throw new Error('Offline'); };
  const first = await githubCommitDates([project('repo')], { fetch, storage: cache });
  assert.equal(first.partial, true); assert.equal(first.dates.get('example/repo'), '2026-10-01T00:00:00Z');
  await githubCommitDates([project('repo')], { fetch, storage: cache });
  assert.equal(requests, 1);
});

test('rate limiting stops the queue; inaccessible repos and storage failures do not hide projects', async () => {
  const rows = Array.from({ length: 12 }, (_, index) => project(`repo-${index}`));
  let requests = 0;
  const denied = await githubCommitDates(rows, { storage: storage(), fetch: async () => { requests++; return { ok: false, status: 429 }; } });
  assert.equal(denied.partial, true); assert.ok(requests <= 4);
  assert.equal(orderProjects(rows, denied.dates).length, rows.length);
  const result = await githubCommitDates([project('gone')], { storage: { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); } }, fetch: async () => ({ ok: false, status: 404 }) });
  assert.equal(result.dates.size, 0);
});

test('malformed API data falls back without inventing a commit date', async () => {
  const result = await githubCommitDates([project('invalid')], { storage: storage(), fetch: async () => commitResponse('not-a-date') });
  assert.equal(result.partial, true); assert.equal(result.dates.size, 0);
});
