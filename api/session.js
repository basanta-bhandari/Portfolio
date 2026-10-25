import { authenticateRequest } from '../lib/admin-users.js';
import { listAdminPresence, touchAdminPresence } from '../lib/admin-community.js';
import { secureApi } from '../lib/security.js';

async function handler(req, res) {
  try {
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }
    const session = await authenticateRequest(req);
    if (!session) {
      return res.status(req.method === 'GET' ? 200 : 401).json(
        req.method === 'GET' ? { loggedIn: false } : { error: 'Unauthorized' }
      );
    }
    if (req.method === 'POST') {
      await touchAdminPresence(session.id);
      return res.status(200).json({ admins: await listAdminPresence() });
    }
    return res.status(200).json({
      loggedIn: true,
      id: session.id,
      username: session.username,
      role: session.role,
      permissions: session.permissions
    });
  } catch (error) {
    console.error('Session lookup failed:', error);
    return res.status(500).json({ loggedIn: false, error: 'Session lookup failed' });
  }
}
export default secureApi(handler, { maxBytes: 1024 });
