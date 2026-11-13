import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const read = name => readFileSync(new URL(name, root));

test('published Cydia metadata describes the exact index bytes', () => {
    const release = read('cydia/Release').toString();
    assert.match(release, /^Architectures: iphoneos-arm$/m);
    assert.equal(read('cydia/Packages').length, 0, 'no installable package is ready yet');
    assert.deepEqual(gunzipSync(read('cydia/Packages.gz')), read('cydia/Packages'));
    for (const [field, algorithm] of [['MD5Sum', 'md5'], ['SHA1', 'sha1'], ['SHA256', 'sha256']]) {
        const section = release.split(`${field}:\n`)[1].split(/\n(?=\S)/)[0].trim();
        const entries = section.split('\n').map(line => line.trim().split(/\s+/));
        assert.deepEqual(entries.map(entry => entry[2]), ['Packages', 'Packages.gz', 'Packages.bz2']);
        for (const [digest, size, name] of entries) {
            const data = read(`cydia/${name}`);
            assert.equal(Number(size), data.length);
            assert.equal(digest, createHash(algorithm).update(data).digest('hex'));
        }
    }
});

test('Cydia landing page is honest and does not require browser JavaScript', () => {
    const page = read('cydia/index.html').toString();
    assert.match(page, /No installable packages are published/);
    assert.match(page, /https:\/\/www\.basanta\.cc\/cydia\//);
    assert.match(page, /cydia:\/\/url\//);
    assert.match(page, /unsigned/);
    assert.doesNotMatch(page, /<script\b/i);
    assert.doesNotMatch(read('cydia/styles.css').toString(), /var\(--/);
});

test('Cydia routes revalidate metadata without weakening global site security', () => {
    const config = JSON.parse(read('vercel.json'));
    assert.ok(config.redirects.some(row => row.source === '/cydia' && row.destination === '/cydia/'));
    const headers = config.headers.find(row => row.source === '/cydia/:path*').headers;
    assert.ok(headers.some(row => row.key === 'Cache-Control' && row.value.includes('must-revalidate')));
    assert.ok(headers.some(row => row.key === 'Content-Security-Policy' && row.value.includes("script-src 'none'")));
    assert.ok(config.headers.find(row => row.source === '/(.*)').headers.some(row => row.key === 'Strict-Transport-Security'));
});
