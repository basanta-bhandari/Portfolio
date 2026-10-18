import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_TETHER_SETTINGS, getTetherSettings } from '../lib/site-settings.js';

const MIME_TYPES = {
  'latest.json': 'application/json; charset=utf-8',
  'SHA256SUMS.txt': 'text/plain; charset=utf-8',
  '.AppImage': 'application/octet-stream',
  '.zip': 'application/zip'
};

function contentType(file) {
  if (MIME_TYPES[file]) return MIME_TYPES[file];
  return Object.entries(MIME_TYPES).find(([suffix]) => suffix.startsWith('.') && file.endsWith(suffix))?.[1]
    || 'application/octet-stream';
}

function requestedFile(req) {
  const value = req.query?.path;
  const file = Array.isArray(value) ? value[0] : value;
  if (typeof file !== 'string' || file.includes('/') || file.includes('\\') || file.startsWith('.')) return null;
  if (file !== 'latest.json' && file !== 'SHA256SUMS.txt' &&
      !/^neonet-[a-z0-9_-]+-v\d+\.\d+\.\d+\.(AppImage|zip)$/.test(file)) return null;
  return file;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let settings = DEFAULT_TETHER_SETTINGS;
  try {
    settings = await getTetherSettings();
  } catch (error) {
    console.error('Could not read Tether settings for download:', error);
  }
  if (!settings.pageEnabled || !settings.downloadsEnabled) {
    return res.status(404).json({ error: 'Tether downloads are currently unavailable' });
  }

  const file = requestedFile(req);
  if (!file) return res.status(404).json({ error: 'Download not found' });
  try {
    const data = await readFile(path.join(process.cwd(), 'tether', 'downloads', file));
    res.setHeader('Content-Type', contentType(file));
    res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
    if (file !== 'latest.json' && file !== 'SHA256SUMS.txt') {
      res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    }
    return res.status(200).send(req.method === 'HEAD' ? undefined : data);
  } catch {
    return res.status(404).json({ error: 'Download not found' });
  }
}
