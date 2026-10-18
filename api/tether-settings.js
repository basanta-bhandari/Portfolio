import { isSuperAdmin } from '../lib/auth.js';
import { authenticateRequest } from '../lib/admin-users.js';
import {
  DEFAULT_TETHER_SETTINGS,
  getTetherSettings,
  saveTetherSettings
} from '../lib/site-settings.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      return res.status(200).json(await getTetherSettings());
    } catch (error) {
      console.error('Could not load Tether settings:', error);
      return res.status(200).json(DEFAULT_TETHER_SETTINGS);
    }
  }

  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await authenticateRequest(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (!isSuperAdmin(session)) return res.status(403).json({ error: 'Super admin access required' });

  try {
    return res.status(200).json(await saveTetherSettings(req.body || {}));
  } catch (error) {
    console.error('Could not save Tether settings:', error);
    return res.status(500).json({ error: 'Could not save Tether settings' });
  }
}
