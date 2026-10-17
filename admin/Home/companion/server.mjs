import http from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';

const host = process.env.ROOMQUEST_HOST || '127.0.0.1';
const port = Number(process.env.ROOMQUEST_PORT || 8787);
const token = process.env.ROOMQUEST_TOKEN || '';
const nodeName = String(process.env.ROOMQUEST_NODE_NAME || 'Room Quest companion').slice(0, 80);
const dataDirectory = path.resolve(process.env.ROOMQUEST_DATA_DIR || './roomquest-data');
const statePath = path.join(dataDirectory, 'sync-state.json');
const allowedOrigins = new Set((process.env.ROOMQUEST_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
const maxBodyBytes = Number(process.env.ROOMQUEST_MAX_BYTES || 25 * 1024 * 1024);

if (token.length < 24) {
  console.error('ROOMQUEST_TOKEN must contain at least 24 characters.');
  process.exit(1);
}
if (!allowedOrigins.size) {
  console.error('ROOMQUEST_ORIGINS must list the exact HTTPS site origin.');
  process.exit(1);
}

await mkdir(dataDirectory, { recursive: true, mode: 0o700 });

async function loadState() {
  try {
    const parsed = JSON.parse(await readFile(statePath, 'utf8'));
    return parsed.schema === 1 && parsed.snapshots && typeof parsed.snapshots === 'object' ? parsed : { schema: 1, snapshots: {} };
  } catch (error) {
    if (error.code === 'ENOENT') return { schema: 1, snapshots: {} };
    throw error;
  }
}

async function saveState(state) {
  const temporaryPath = `${statePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  await rename(temporaryPath, statePath);
}

let writeChain = Promise.resolve();
function updateState(action) {
  const operation = writeChain.then(async () => {
    const state = await loadState();
    const result = await action(state);
    await saveState(state);
    return result;
  });
  writeChain = operation.catch(() => {});
  return operation;
}

const companionIdentity = await updateState(state => {
  if (!state.node || !/^rq_[a-zA-Z0-9_-]{12,80}$/.test(state.node.nodeId || '')) {
    state.node = { nodeId: `rq_${randomBytes(18).toString('base64url')}`, createdAt: new Date().toISOString() };
  }
  return state.node;
});

function corsHeaders(origin) {
  if (!origin || !allowedOrigins.has(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,PUT,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-allow-private-network': 'true',
    'access-control-max-age': '600',
    'vary': 'Origin'
  };
}

function send(response, status, body, headers = {}) {
  const encoded = JSON.stringify(body);
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  response.end(encoded);
}

function tokenMatches(header = '') {
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!supplied || Buffer.byteLength(supplied) !== Buffer.byteLength(token)) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(token));
}

async function readJSON(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw Object.assign(new Error('payload too large'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('invalid JSON'), { status: 400 }); }
}

function validDeviceId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(value);
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || '';
  const cors = corsHeaders(origin);
  if (origin && !allowedOrigins.has(origin)) return send(response, 403, { error: 'origin not allowed' });
  if (request.method === 'OPTIONS') {
    response.writeHead(204, cors);
    return response.end();
  }
  if (!tokenMatches(request.headers.authorization)) return send(response, 401, { error: 'unauthorized' }, cors);

  try {
    if (request.method === 'GET' && request.url === '/health') {
      const state = await loadState();
      return send(response, 200, {
        ok: true, service: 'room-quest-sync', schema: 1,
        nodeId: companionIdentity.nodeId, nodeName,
        capabilities: ['encrypted-snapshots', 'logical-revisions', 'recognized-devices'],
        recognizedDevices: Object.keys(state.snapshots).length
      }, cors);
    }
    if (request.method === 'GET' && request.url === '/api/snapshots') {
      const state = await loadState();
      return send(response, 200, { snapshots: Object.values(state.snapshots) }, cors);
    }
    const match = request.url?.match(/^\/api\/snapshots\/([a-zA-Z0-9_-]{8,80})$/);
    if (request.method === 'PUT' && match && validDeviceId(match[1])) {
      const body = await readJSON(request);
      if (!body || !Number.isSafeInteger(body.revision) || body.revision < 1 || typeof body.name !== 'string' || body.name.length > 80 || !body.envelope || typeof body.envelope.ciphertext !== 'string') {
        return send(response, 400, { error: 'invalid snapshot' }, cors);
      }
      const saved = await updateState(state => {
        const previous = state.snapshots[match[1]];
        if (previous && body.revision <= previous.revision) throw Object.assign(new Error('revision must increase'), { status: 409, currentRevision: previous.revision });
        state.snapshots[match[1]] = {
          deviceId: match[1], name: body.name.trim() || 'Device', platform: String(body.platform || '').slice(0, 120),
          revision: body.revision, updatedAt: new Date().toISOString(), envelope: body.envelope
        };
        return state.snapshots[match[1]];
      });
      return send(response, 200, { ok: true, revision: body.revision, updatedAt: saved.updatedAt }, cors);
    }
    return send(response, 404, { error: 'not found' }, cors);
  } catch (error) {
    console.error(error);
    return send(response, error.status || 500, { error: error.status ? error.message : 'server error' }, cors);
  }
});

server.listen(port, host, () => {
  console.log(`Room Quest sync listening on http://${host}:${port}`);
});
