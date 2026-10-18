import { authenticateRequest } from '../lib/admin-users.js';

export default async function handler(req, res) {
  try {
    const session = await authenticateRequest(req);
    if (!session) return res.status(200).json({ loggedIn: false });
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
