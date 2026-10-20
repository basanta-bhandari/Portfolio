import crypto from 'node:crypto';
import { authenticateRequest } from '../lib/admin-users.js';
import { ADMIN_CHAT_MESSAGE_LIMIT, touchAdminPresence } from '../lib/admin-community.js';

const CHAT_PATH = '/internal/admin-chat';

function chatConfig() {
  const baseUrl = String(process.env.R2_CHAT_API_URL || process.env.R2_UPLOAD_URL || '').replace(/\/+$/, '');
  const secret = process.env.R2_CHAT_API_SECRET;
  return baseUrl && secret ? { baseUrl, secret } : null;
}

async function cloudflareChat(method, config, payload = null) {
  const body = payload ? JSON.stringify(payload) : '';
  const timestamp = String(Date.now());
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const signature = crypto.createHmac('sha256', config.secret)
    .update(`${method}\n${CHAT_PATH}\n${timestamp}\n${bodyHash}`)
    .digest('hex');
  const response = await fetch(config.baseUrl + CHAT_PATH, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Chat-Timestamp': timestamp,
      'X-Chat-Signature': signature
    },
    body: body || undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Encrypted chat storage is unavailable');
  return data;
}

export default async function handler(req, res) {
  try {
    const session = await authenticateRequest(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const config = chatConfig();
    if (!config) return res.status(503).json({ error: 'Encrypted chat storage is not configured' });

    await touchAdminPresence(session.id);

    if (req.method === 'GET') {
      return res.status(200).json(await cloudflareChat('GET', config));
    }

    if (req.method === 'POST') {
      const message = String(req.body?.message || '').trim();
      if (!message) return res.status(400).json({ error: 'Write a message first' });
      if (message.length > ADMIN_CHAT_MESSAGE_LIMIT) {
        return res.status(400).json({ error: `Messages can be up to ${ADMIN_CHAT_MESSAGE_LIMIT} characters` });
      }
      return res.status(201).json(await cloudflareChat('POST', config, {
        adminId: session.id,
        username: session.username,
        message
      }));
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Admin chat failed:', error);
    return res.status(500).json({ error: 'Admin chat is unavailable' });
  }
}
