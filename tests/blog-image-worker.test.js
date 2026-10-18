import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import worker from '../cloudflare/blog-image-worker/src/index.js';

const secret = 'worker-test-secret';
const key = 'blog/2026/10/123e4567-e89b-12d3-a456-426614174000.png';
const contentType = 'image/png';
const image = Buffer.from('small test image');

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
