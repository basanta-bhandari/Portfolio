import crypto from 'node:crypto';
import { hasPermission } from '../../lib/auth.js';
import { authenticateRequest } from '../../lib/admin-users.js';
import { secureApi } from '../../lib/security.js';

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_EXTENSIONS = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif'
});

function r2Config() {
  const uploadBaseUrl = String(process.env.R2_UPLOAD_URL || '').replace(/\/+$/, '');
  const uploadSecret = process.env.R2_UPLOAD_SECRET;
  const publicBaseUrl = String(process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  if (!uploadBaseUrl || !uploadSecret || !publicBaseUrl) return null;
  return { uploadBaseUrl, uploadSecret, publicBaseUrl };
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await authenticateRequest(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (!hasPermission(session, 'blog')) {
    return res.status(403).json({ error: 'Blog access required' });
  }

  const config = r2Config();
  if (!config) return res.status(503).json({ error: 'Image storage is not configured yet' });

  const { contentType, size } = req.body || {};
  const extension = IMAGE_EXTENSIONS[contentType];
  const byteSize = Number(size);
  if (!extension) return res.status(400).json({ error: 'Unsupported image type' });
  if (!Number.isInteger(byteSize) || byteSize < 1 || byteSize > MAX_IMAGE_BYTES) {
    return res.status(400).json({ error: 'Images must be no larger than 3 MB' });
  }

  const now = new Date();
  const key = [
    'blog',
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    `${crypto.randomUUID()}.${extension}`
  ].join('/');
  try {
    const expires = Math.floor(Date.now() / 1000) + 300;
    const signedValue = `${key}\n${expires}\n${contentType}\n${byteSize}`;
    const signature = crypto.createHmac('sha256', config.uploadSecret)
      .update(signedValue)
      .digest('base64url');
    const uploadUrl = new URL(`${config.uploadBaseUrl}/${key}`);
    uploadUrl.searchParams.set('expires', String(expires));
    uploadUrl.searchParams.set('size', String(byteSize));
    uploadUrl.searchParams.set('signature', signature);
    return res.status(200).json({
      uploadUrl: uploadUrl.toString(),
      publicUrl: `${config.publicBaseUrl}/${key}`
    });
  } catch (error) {
    console.error('Could not create R2 upload URL:', error);
    return res.status(500).json({ error: 'Could not prepare image upload' });
  }
}
export default secureApi(handler, { maxBytes: 1024 });
