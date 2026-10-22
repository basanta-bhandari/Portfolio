const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
