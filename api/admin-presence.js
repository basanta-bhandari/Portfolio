import { authenticateRequest } from '../lib/admin-users.js';
import { listAdminPresence, touchAdminPresence } from '../lib/admin-community.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await authenticateRequest(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    await touchAdminPresence(session.id);
    return res.status(200).json({ admins: await listAdminPresence() });
  } catch (error) {
    console.error('Admin presence failed:', error);
    return res.status(500).json({ error: 'Could not update admin presence' });
  }
}
