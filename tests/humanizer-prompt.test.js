import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMessages,
  protectMarkdown,
  restoreMarkdown,
  splitMarkdown,
  stripResponseWrapper,
} from '../admin/humanizer-prompt.js';

test('protects and restores Markdown that must not be rewritten', () => {
  const source = 'Read [the docs](https://example.com/docs) and run `cargo test`.\n\n```rust\nfn main() {}\n```';
  const protectedMarkdown = protectMarkdown(source);

  assert.equal(protectedMarkdown.values.length, 3);
  assert.doesNotMatch(protectedMarkdown.text, /example\.com|cargo test|fn main/);
  assert.equal(restoreMarkdown(protectedMarkdown.text, protectedMarkdown.values), source);
});

test('rejects a model response that drops protected content', () => {
  const protectedMarkdown = protectMarkdown('Visit https://example.com now.');
  assert.throws(
    () => restoreMarkdown('The model dropped the token.', protectedMarkdown.values),
    /changed protected Markdown/,
  );
});

test('removes only a wrapper around the complete response', () => {
  assert.equal(stripResponseWrapper('```markdown\n# Title\n\nText\n```'), '# Title\n\nText');
  assert.equal(stripResponseWrapper('Text with `inline code`.'), 'Text with `inline code`.');
});

test('splits long posts at paragraph boundaries', () => {
  const text = `${'A'.repeat(90)}\n\n${'B'.repeat(90)}\n\n${'C'.repeat(90)}`;
  const chunks = splitMarkdown(text, 120);

  assert.equal(chunks.length, 3);
  assert.equal(chunks.join('\n\n'), text);
});

test('prompt requires Markdown-only output and exact fact preservation', () => {
  const messages = buildMessages('# Input', { level: 'strong', roughEdges: false });
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /Preserve all facts/);
  assert.match(messages[0].content, /Output only the revised Markdown/);
  assert.match(messages[0].content, /Correct spelling/);
});
