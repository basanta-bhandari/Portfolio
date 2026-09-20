// Uses the same model-list/chat-completion protocol as Odysseus's local providers.
// Independent browser adapter; no dependency on Odysseus sessions or credentials.
export function localBase(value) {
  const url = new URL(value.includes('://') ? value : `http://${value}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Enter a local server URL without credentials, query parameters, or fragments.');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Use localhost or 127.0.0.1 for the local model server.');
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/(chat\/completions|models)$/, '').replace(/\/api(?:\/(tags|chat|generate))?$/, '/v1');
  if (!url.pathname || url.pathname === '/') url.pathname = '/v1';
  return url.href.replace(/\/$/, '');
}

async function request(base, path, body, fetcher = fetch) {
  let response;
  try {
    response = await fetcher(`${localBase(base)}${path}`, {
      method: body ? 'POST' : 'GET', credentials: 'omit', redirect: 'error',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(body ? 180000 : 8000),
    });
  } catch {
    throw new Error('Cannot reach the local model. Start its server, allow this site’s exact origin in its CORS settings, and allow local-network access if your browser asks.');
  }
  if (!response.ok) throw new Error(`Local server returned HTTP ${response.status}. Check that the model is loaded and the server accepts requests without an API key.`);
  return response.json();
}

export async function listLocalModels(base, fetcher) {
  const result = await request(base, '/models', null, fetcher);
  const models = (result.data || []).map(item => item.id).filter(id => typeof id === 'string' && id.trim());
  if (!models.length) throw new Error('Server reached, but no models are available. Load a model in your local AI app, then connect again.');
  return [...new Set(models)];
}

export function localEngine(base, model, fetcher) {
  const endpoint = localBase(base);
  return { chat: { completions: { create: async ({ messages, temperature, top_p, max_tokens }) => {
    const result = await request(endpoint, '/chat/completions', { model, messages, temperature, top_p, max_tokens, stream: false }, fetcher);
    if (result.choices?.[0]?.finish_reason === 'length') throw new Error('The model reached its output limit. Try a shorter section.');
    if (typeof result.choices?.[0]?.message?.content !== 'string' || !result.choices[0].message.content.trim()) throw new Error('The local model returned no text.');
    return result;
  } } } };
}
