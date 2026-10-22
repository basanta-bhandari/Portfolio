import https from 'node:https';

const CACHE_TTL = 5 * 60 * 1000;
let cached = null;

function githubHeaders() {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function getJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: options.headers || {} }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Upstream request failed (${response.statusCode})`));
          return;
        }
        try { resolve(JSON.parse(body)); } catch { reject(new Error('Upstream returned invalid JSON')); }
      });
    });
    request.setTimeout(12000, () => request.destroy(new Error('Upstream request timed out')));
    request.on('error', reject);
  });
}

async function getGithub() {
  const owner = process.env.GITHUB_OWNER || 'basanta-bhandari';
  const repo = process.env.GITHUB_REPO || 'Portfolio';
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const headers = githubHeaders();
  const [repository, commits, languages] = await Promise.all([
    getJson(base, { headers }),
    getJson(`${base}/commits?per_page=1`, { headers }),
    getJson(`${base}/languages`, { headers })
  ]);
  const commit = commits[0];
  return {
    available: true, name: repository.full_name, description: repository.description, url: repository.html_url,
    stars: repository.stargazers_count, forks: repository.forks_count, openIssues: repository.open_issues_count,
    watchers: repository.subscribers_count, sizeKb: repository.size, language: repository.language,
    defaultBranch: repository.default_branch, pushedAt: repository.pushed_at, languages,
    latestCommit: commit ? { sha: commit.sha, message: commit.commit?.message?.split('\n')[0] || '', url: commit.html_url, authoredAt: commit.commit?.author?.date || null } : null
  };
}

async function getVercel() {
  const projectId = process.env.VERCEL_PROJECT_ID || 'prj_xVyAOswIwKk1OnaVhgvxb7x2QRfD';
  const token = process.env.VERCEL_TOKEN;
  const fallback = {
    environment: process.env.VERCEL_ENV || null,
    url: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    configured: Boolean(projectId && token)
  };
  if (!projectId || !token) return { available: Boolean(fallback.url || fallback.environment), ...fallback };
  const teamId = process.env.VERCEL_TEAM_ID || 'team_lAp7f69BmACZDymsb4XUvr5V';
  const team = `&teamId=${encodeURIComponent(teamId)}`;
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const [project, deployments] = await Promise.all([
      getJson(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}${team ? `?${team.slice(1)}` : ''}`, { headers }),
      getJson(`https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=8${team}`, { headers })
    ]);
    return {
      available: true, configured: true, project: project.name, framework: project.framework || 'Static / custom',
      productionDomain: project.targets?.production?.[0]?.domain || null,
      deployments: (deployments.deployments || []).map(deployment => ({
        id: deployment.uid, state: deployment.readyState || deployment.state, target: deployment.target || 'preview',
        createdAt: deployment.createdAt ? new Date(deployment.createdAt).toISOString() : null,
        url: deployment.url ? `https://${deployment.url}` : null,
        commit: deployment.meta?.githubCommitSha || null, branch: deployment.meta?.githubCommitRef || null
      }))
    };
  } catch {
    return { ...fallback, available: Boolean(fallback.url || fallback.environment), error: 'Vercel details are temporarily unavailable.' };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(cached.value);
  }
  const [github, vercel] = await Promise.allSettled([getGithub(), getVercel()]);
  const value = {
    generatedAt: new Date().toISOString(),
    github: github.status === 'fulfilled' ? github.value : { available: false, error: 'GitHub data is temporarily unavailable.' },
    vercel: vercel.status === 'fulfilled' ? vercel.value : { available: false, error: 'Vercel data is temporarily unavailable.' }
  };
  cached = { value, expiresAt: Date.now() + CACHE_TTL };
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  return res.status(200).json(value);
}
