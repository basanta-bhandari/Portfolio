const CACHE_KEY = 'portfolio.github-commits.v1';
const FRESH_MS = 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;
const STALE_MS = 7 * 24 * FRESH_MS;

export function githubRepository(project) {
  let links = project.additional_links;
  try { if (typeof links === 'string') links = JSON.parse(links); } catch { links = []; }
  const urls = [project.github_url, ...(Array.isArray(links) ? links.map(link => typeof link === 'string' ? link : link?.url) : [])];
  for (const value of urls) {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || !['github.com', 'www.github.com'].includes(url.hostname) || url.username || url.password || url.port) continue;
      const [owner, rawRepo] = url.pathname.split('/').filter(Boolean), repo = rawRepo?.replace(/\.git$/i, '');
      if (/^[a-z\d][a-z\d-]{0,38}$/i.test(owner || '') && /^[a-z\d_.-]{1,100}$/i.test(repo || '') && !['.', '..'].includes(repo)) return `${owner}/${repo}`.toLowerCase();
    } catch { /* A project does not need to have a GitHub repository. */ }
  }
  return null;
}

export function orderProjects(projects, dates) {
  return projects.map((project, index) => ({ project, index, date: dates.get(githubRepository(project)) || null }))
    .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0) || a.index - b.index);
}

export async function githubCommitDates(projects, options = {}) {
  const request = options.fetch || globalThis.fetch;
  const storage = options.storage || (() => { try { return globalThis.localStorage; } catch { return null; } })();
  const now = Date.now(), dates = new Map(), repositories = [...new Set(projects.map(githubRepository).filter(Boolean))];
  let cache = {}, partial = false, rateLimited = false, next = 0;
  try { const saved = JSON.parse(storage?.getItem(CACHE_KEY) || '{}'); if (saved && typeof saved === 'object' && !Array.isArray(saved)) cache = saved; } catch { /* Caching is optional. */ }
  const pending = [];
  for (const repo of repositories) {
    const entry = cache[repo], age = now - entry?.checkedAt;
    if (entry && age >= 0 && age < STALE_MS && Number.isFinite(Date.parse(entry.date))) dates.set(repo, entry.date);
    if (entry && age >= 0 && age < (entry.failed ? RETRY_MS : FRESH_MS)) { if (entry.failed) partial = true; continue; }
    pending.push(repo);
  }
  // Share one deadline across the queue so slow GitHub requests cannot block indefinitely.
  const signal = options.signal || AbortSignal.timeout(8000);
  async function worker() {
    while (next < pending.length) {
      if (rateLimited || signal.aborted) { partial = true; return; }
      const repo = pending[next++];
      try {
        const response = await request(`https://api.github.com/repos/${repo}/commits?per_page=1`, {
          headers: { Accept: 'application/vnd.github+json' }, credentials: 'omit', signal
        });
        if (response.status === 403 || response.status === 429) rateLimited = true;
        if ([404, 409].includes(response.status)) { cache[repo] = { date: null, checkedAt: now }; continue; }
        if (!response.ok) throw new Error('GitHub unavailable');
        const commits = await response.json();
        if (!Array.isArray(commits)) throw new Error('Invalid commit response');
        const date = commits[0]?.commit?.committer?.date || commits[0]?.commit?.author?.date || null;
        if (commits.length && !Number.isFinite(Date.parse(date))) throw new Error('Invalid commit date');
        if (date) dates.set(repo, date);
        cache[repo] = { date, checkedAt: now };
      } catch {
        partial = true;
        cache[repo] = { date: dates.get(repo) || null, checkedAt: now, failed: true };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, worker));
  try {
    const retained = Object.fromEntries(Object.entries(cache).filter(([, entry]) => entry && now - entry.checkedAt >= 0 && now - entry.checkedAt < STALE_MS).slice(-250));
    storage?.setItem(CACHE_KEY, JSON.stringify(retained));
  } catch { /* Sorting still works when browser storage is unavailable. */ }
  return { dates, partial };
}
