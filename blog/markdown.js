const escape = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

function safeUrl(raw, image) {
  if (image && /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z0-9+/]+=*$/i.test(raw)) return raw;
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch { return null; }
}

function inline(source, depth = 0) {
  if (depth > 4) return escape(source);
  const pattern = /(!?)\[([^\]\n]*)\]\(([^\s)]+)\)|`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;
  let result = '', at = 0;
  for (const match of source.matchAll(pattern)) {
    result += escape(source.slice(at, match.index));
    const [raw, image, label, url, code, bold, italic] = match;
    if (url !== undefined) {
      const safe = safeUrl(url, Boolean(image));
      if (!safe) result += escape(raw);
      else if (image) result += `<img src="${escape(safe)}" alt="${escape(label)}" loading="lazy" decoding="async">`;
      else result += `<a href="${escape(safe)}" target="_blank" rel="noopener noreferrer">${inline(label, depth + 1)}</a>`;
    } else if (code !== undefined) result += `<code>${escape(code)}</code>`;
    else if (bold !== undefined) result += `<strong>${inline(bold, depth + 1)}</strong>`;
    else result += `<em>${escape(italic)}</em>`;
    at = match.index + raw.length;
  }
  return result + escape(source.slice(at));
}

// Interpret raw text once. Generated tags are never fed through later replacements.
export function renderMarkdown(value) {
  if (typeof value !== 'string') return '';
  const blocks = [], paragraph = [];
  let code = null, list = null;
  const flushParagraph = () => {
    if (paragraph.length) blocks.push(`<p>${paragraph.splice(0).map(line => inline(line)).join('<br>')}</p>`);
  };
  const flushList = () => {
    if (list) blocks.push(`<${list.tag}>${list.lines.map(line => `<li>${inline(line)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  for (const line of value.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^```/.test(line)) {
      flushParagraph(); flushList();
      if (code) { blocks.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`); code = null; }
      else code = [];
      continue;
    }
    if (code) { code.push(line); continue; }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const item = /^\s*(?:([-*])|\d+\.)\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph(); flushList();
      const tag = `h${heading[1].length}`;
      blocks.push(`<${tag}>${inline(heading[2])}</${tag}>`);
    } else if (item) {
      flushParagraph();
      const tag = item[1] ? 'ul' : 'ol';
      if (list?.tag !== tag) { flushList(); list = { tag, lines: [] }; }
      list.lines.push(item[2]);
    } else if (!line.trim()) { flushParagraph(); flushList(); }
    else { flushList(); paragraph.push(line); }
  }
  flushParagraph(); flushList();
  if (code) blocks.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`);
  return blocks.join('\n');
}
