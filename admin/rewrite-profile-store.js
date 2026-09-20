const PROFILE_SERVER = 'http://127.0.0.1:11435';

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    return await fetch(`${PROFILE_SERVER}${path}`, {
      credentials: 'omit',
      redirect: 'error',
      signal: controller.signal,
      ...options,
    });
  } catch {
    throw new Error('The local voice-profile service is unavailable.');
  } finally {
    clearTimeout(timer);
  }
}

export async function loadLocalVoiceProfile() {
  const response = await request('/profile');
  if (response.status === 204 || response.status === 404) return null;
  if (!response.ok) throw new Error(`The local voice-profile service returned HTTP ${response.status}.`);
  return response.text();
}

export async function saveLocalVoiceProfile(markdown) {
  const response = await request('/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    body: markdown,
  });
  if (!response.ok) throw new Error(`The local voice-profile service could not save the file (HTTP ${response.status}).`);
}

export async function deleteLocalVoiceProfile() {
  const response = await request('/profile', { method: 'DELETE' });
  if (!response.ok && response.status !== 404) throw new Error(`The local voice-profile service could not remove the file (HTTP ${response.status}).`);
}

export { PROFILE_SERVER };
