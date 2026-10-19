import { clearSessionCookie } from '../lib/auth.js';
import { authenticateRequest } from '../lib/admin-users.js';
import { markAdminOffline } from '../lib/admin-community.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const session = await authenticateRequest(req);
    if (session) await markAdminOffline(session.id);
  } catch (error) {
    console.error('Could not clear admin presence during logout:', error);
  }
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
}
