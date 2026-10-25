import { clearSessionCookie } from '../lib/auth.js';
import { authenticateRequest, revokeSession } from '../lib/admin-users.js';
import { markAdminOffline } from '../lib/admin-community.js';
import { secureApi } from '../lib/security.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const session = await authenticateRequest(req);
    await revokeSession(req);
    if (session) await markAdminOffline(session.id);
  } catch (error) {
    console.error('Could not clear admin presence during logout:', error);
    clearSessionCookie(res);
    return res.status(503).json({ error: 'Signed out here, but could not revoke the server session. Please retry.' });
  }
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
}
export default secureApi(handler, { maxBytes: 1024 });
