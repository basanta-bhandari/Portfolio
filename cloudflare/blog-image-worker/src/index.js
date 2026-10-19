const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const CHAT_OBJECT_KEY = 'admin-chat/messages-v1.enc';
const CHAT_MESSAGE_LIMIT = 1000;
const CHAT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const CHAT_MAX_MESSAGES = 100;
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif'
]);
const ALLOWED_ORIGINS = new Set([
  'https://www.basanta.cc',
  'https://basanta.cc',
  'http://localhost:8000',
  'http://127.0.0.1:8000'
]);

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '3600',
    Vary: 'Origin'
  };
}

function response(message, status, origin) {
  return new Response(message, {
    status,
    headers: origin && ALLOWED_ORIGINS.has(origin) ? corsHeaders(origin) : undefined
  });
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hex(bytes) {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function bytesFromHex(value) {
  if (!/^[0-9a-f]{64}$/i.test(value || '')) return null;
  return new Uint8Array(value.match(/../g).map(part => Number.parseInt(part, 16)));
}

async function signature(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return base64Url(new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value)
  )));
}

function safeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return hex(new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value)
  )));
}

async function sha256Hex(value) {
  return hex(new Uint8Array(await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  )));
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

async function verifyChatRequest(request, env, url) {
  if (!env.CHAT_API_SECRET) return null;
  const timestamp = request.headers.get('X-Chat-Timestamp') || '';
  const supplied = request.headers.get('X-Chat-Signature') || '';
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() - timestampNumber) > 60_000) {
    return null;
  }
  const body = request.method === 'POST' ? await request.text() : '';
  const bodyHash = await sha256Hex(body);
  const expected = await hmacHex(
    env.CHAT_API_SECRET,
    `${request.method}\n${url.pathname}\n${timestamp}\n${bodyHash}`
  );
  return safeEqual(expected, supplied) ? body : null;
}

async function chatEncryptionKey(secret) {
  const keyBytes = bytesFromHex(secret);
  if (!keyBytes) throw new Error('CHAT_ENCRYPTION_KEY must be 64 hexadecimal characters');
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptChat(messages, secret) {
  const key = await chatEncryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify({ messages }));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  const output = new Uint8Array(1 + iv.length + encrypted.length);
  output[0] = 1;
  output.set(iv, 1);
  output.set(encrypted, 13);
  return output;
}

async function decryptChat(payload, secret) {
  const bytes = new Uint8Array(payload);
  if (bytes.length < 30 || bytes[0] !== 1) throw new Error('Unsupported encrypted chat data');
  const key = await chatEncryptionKey(secret);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.slice(1, 13) },
    key,
    bytes.slice(13)
  );
  const data = JSON.parse(new TextDecoder().decode(plaintext));
  return Array.isArray(data.messages) ? data.messages : [];
}

async function readEncryptedChat(env) {
  const object = await env.BLOG_IMAGES.get(CHAT_OBJECT_KEY);
  if (!object) return { object: null, messages: [] };
  return {
    object,
    messages: await decryptChat(await object.arrayBuffer(), env.CHAT_ENCRYPTION_KEY)
  };
}

async function appendEncryptedChat(env, message) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await readEncryptedChat(env);
    const cutoff = Date.now() - CHAT_RETENTION_MS;
    const messages = current.messages
      .filter(item => Date.parse(item.createdAt) > cutoff)
      .concat(message)
      .slice(-CHAT_MAX_MESSAGES);
    const encrypted = await encryptChat(messages, env.CHAT_ENCRYPTION_KEY);
    const onlyIf = current.object
      ? { etagMatches: current.object.etag }
      : { etagDoesNotMatch: '*' };
    const stored = await env.BLOG_IMAGES.put(CHAT_OBJECT_KEY, encrypted, {
      onlyIf,
      httpMetadata: { contentType: 'application/octet-stream', cacheControl: 'no-store' }
    });
    if (stored) return message;
  }
  throw new Error('Chat changed while saving; retry the message');
}

async function handleAdminChat(request, env, url) {
  if (!['GET', 'POST'].includes(request.method)) {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  if (!env.CHAT_API_SECRET || !env.CHAT_ENCRYPTION_KEY) {
    return jsonResponse({ error: 'Encrypted chat storage is not configured' }, 503);
  }
  const body = await verifyChatRequest(request, env, url);
  if (body === null) return jsonResponse({ error: 'Unauthorized' }, 401);

  try {
    if (request.method === 'GET') {
      const chat = await readEncryptedChat(env);
      const cutoff = Date.now() - CHAT_RETENTION_MS;
      return jsonResponse({
        messages: chat.messages.filter(item => Date.parse(item.createdAt) > cutoff).slice(-CHAT_MAX_MESSAGES)
      });
    }

    const payload = JSON.parse(body || '{}');
    const adminId = Number(payload.adminId);
    const username = String(payload.username || '').trim();
    const messageText = String(payload.message || '').trim();
    if (!Number.isInteger(adminId) || adminId < 1 || !username || username.length > 32) {
      return jsonResponse({ error: 'Invalid admin identity' }, 400);
    }
    if (!messageText || messageText.length > CHAT_MESSAGE_LIMIT) {
      return jsonResponse({ error: `Messages must contain 1 to ${CHAT_MESSAGE_LIMIT} characters` }, 400);
    }
    const message = {
      id: crypto.randomUUID(),
      adminId,
      username,
      message: messageText,
      createdAt: new Date().toISOString()
    };
    await appendEncryptedChat(env, message);
    return jsonResponse({ message }, 201);
  } catch (error) {
    console.error('Encrypted admin chat failed:', error);
    return jsonResponse({ error: 'Encrypted chat storage failed' }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/internal/admin-chat') {
      return handleAdminChat(request, env, url);
    }
    const origin = request.headers.get('Origin') || '';
    if (!ALLOWED_ORIGINS.has(origin)) return response('Origin not allowed', 403);
    if (request.method === 'OPTIONS') return response(null, 204, origin);
    if (request.method !== 'PUT') return response('Method not allowed', 405, origin);
    if (!env.UPLOAD_SECRET) return response('Upload service is not configured', 503, origin);

    const key = url.pathname.replace(/^\/+/, '');
    const expires = Number(url.searchParams.get('expires'));
    const expectedSize = Number(url.searchParams.get('size'));
    const suppliedSignature = url.searchParams.get('signature') || '';
    const contentType = request.headers.get('Content-Type') || '';

    if (!/^blog\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(png|jpg|gif|webp|avif)$/.test(key)) {
      return response('Invalid object key', 400, origin);
    }
    if (!ALLOWED_TYPES.has(contentType)) return response('Unsupported image type', 400, origin);
    if (!Number.isInteger(expectedSize) || expectedSize < 1 || expectedSize > MAX_IMAGE_BYTES) {
      return response('Invalid image size', 400, origin);
    }
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(expires) || expires < now || expires > now + 300) {
      return response('Upload link expired', 403, origin);
    }

    const expectedSignature = await signature(
      env.UPLOAD_SECRET,
      `${key}\n${expires}\n${contentType}\n${expectedSize}`
    );
    if (!safeEqual(expectedSignature, suppliedSignature)) {
      return response('Invalid upload signature', 403, origin);
    }

    const image = await request.arrayBuffer();
    if (image.byteLength !== expectedSize || image.byteLength > MAX_IMAGE_BYTES) {
      return response('Image size did not match', 400, origin);
    }
    await env.BLOG_IMAGES.put(key, image, {
      httpMetadata: {
        contentType,
        cacheControl: 'public, max-age=31536000, immutable'
      }
    });
    return response('Uploaded', 201, origin);
  }
};
