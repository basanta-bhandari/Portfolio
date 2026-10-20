import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import worker from '../cloudflare/blog-image-worker/src/index.js';

const secret = 'worker-test-secret';
const key = 'blog/2026/10/123e4567-e89b-12d3-a456-426614174000.png';
const contentType = 'image/png';
const image = Buffer.from('small test image');
const chatApiSecret = 'chat-api-test-secret';
const chatEncryptionKey = '7f'.repeat(32);

function signedRequest(overrides = {}) {
  const expires = overrides.expires || Math.floor(Date.now() / 1000) + 60;
  const size = overrides.size || image.length;
  const value = `${key}\n${expires}\n${contentType}\n${size}`;
  const signature = overrides.signature || crypto.createHmac('sha256', secret)
    .update(value)
    .digest('base64url');
  const url = new URL(`https://upload.example/${key}`);
  url.searchParams.set('expires', String(expires));
  url.searchParams.set('size', String(size));
  url.searchParams.set('signature', signature);
  return new Request(url, {
    method: 'PUT',
    headers: {
      Origin: overrides.origin || 'https://www.basanta.cc',
      'Content-Type': contentType
    },
    body: image
  });
}

function signedChatRequest(method, payload = null, signatureOverride = null) {
  const path = '/internal/admin-chat';
  const timestamp = String(Date.now());
  const body = payload ? JSON.stringify(payload) : '';
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const signature = signatureOverride || crypto.createHmac('sha256', chatApiSecret)
    .update(`${method}\n${path}\n${timestamp}\n${bodyHash}`)
    .digest('hex');
  return new Request('https://upload.example' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Chat-Timestamp': timestamp,
      'X-Chat-Signature': signature
    },
    body: body || undefined
  });
}

class ChatBucket {
  constructor() {
    this.body = null;
    this.etag = null;
  }

  async get() {
    if (!this.body) return null;
    const body = Buffer.from(this.body);
    return {
      etag: this.etag,
      async arrayBuffer() {
        return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
      }
    };
  }

  async put(_key, body, options = {}) {
    const condition = options.onlyIf || {};
    if (condition.etagMatches && condition.etagMatches !== this.etag) return null;
    if (condition.etagDoesNotMatch === '*' && this.body) return null;
    this.body = Buffer.from(body);
    this.etag = crypto.createHash('sha256').update(this.body).digest('hex');
    return { etag: this.etag };
  }
}

test('worker accepts a correctly signed image and writes it to R2', async () => {
  let saved;
  const response = await worker.fetch(signedRequest(), {
    UPLOAD_SECRET: secret,
    BLOG_IMAGES: {
      async put(savedKey, body, options) {
        saved = { savedKey, body: Buffer.from(body), options };
      }
    }
  });

  assert.equal(response.status, 201);
  assert.equal(saved.savedKey, key);
  assert.deepEqual(saved.body, image);
  assert.equal(saved.options.httpMetadata.contentType, contentType);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://www.basanta.cc');
});

test('worker rejects invalid signatures and unapproved origins', async () => {
  const bucket = { async put() { throw new Error('must not write'); } };
  const badSignature = await worker.fetch(signedRequest({ signature: 'invalid' }), {
    UPLOAD_SECRET: secret,
    BLOG_IMAGES: bucket
  });
  assert.equal(badSignature.status, 403);

  const badOrigin = await worker.fetch(signedRequest({ origin: 'https://example.com' }), {
    UPLOAD_SECRET: secret,
    BLOG_IMAGES: bucket
  });
  assert.equal(badOrigin.status, 403);
});

test('worker stores admin chat as encrypted R2 data and decrypts it for signed reads', async () => {
  const bucket = new ChatBucket();
  const env = {
    BLOG_IMAGES: bucket,
    CHAT_API_SECRET: chatApiSecret,
    CHAT_ENCRYPTION_KEY: chatEncryptionKey
  };
  const payload = { adminId: 7, username: 'test-admin', message: 'private test message' };
  const write = await worker.fetch(signedChatRequest('POST', payload), env);
  assert.equal(write.status, 201);
  assert.ok(bucket.body);
  assert.equal(bucket.body.includes(Buffer.from(payload.message)), false);

  const read = await worker.fetch(signedChatRequest('GET'), env);
  assert.equal(read.status, 200);
  const data = await read.json();
  assert.equal(data.messages.length, 1);
  assert.equal(data.messages[0].username, payload.username);
  assert.equal(data.messages[0].message, payload.message);
});

test('worker rejects unsigned admin chat access', async () => {
  const response = await worker.fetch(signedChatRequest('GET', null, 'invalid'), {
    BLOG_IMAGES: new ChatBucket(),
    CHAT_API_SECRET: chatApiSecret,
    CHAT_ENCRYPTION_KEY: chatEncryptionKey
  });
  assert.equal(response.status, 401);
});
