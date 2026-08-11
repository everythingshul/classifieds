// Minimal allowlist sanitizer for admin-authored rich text (currently just
// the editorial submission instructions) that gets rendered to every public
// visitor. The admin is trusted, but this is still rendered site-wide, so a
// defensive pass is worth it in case of a pasted-in mistake or a compromised
// admin session - not a full HTML parser, just a tag/attribute allowlist.
const ALLOWED_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 'p', 'br', 'ul', 'ol', 'li', 'a', 'div', 'span']);

function sanitizeRichText(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    // Strip whole elements that should never render as content, tags included.
    .replace(/<(script|style|iframe|object|embed|form)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|style|iframe|object|embed|form)[^>]*\/?>/gi, '')
    // Strip every tag not in the allowlist, keeping its inner text.
    .replace(/<\/?([a-zA-Z0-9]+)((?:\s+[^>]*)?)>/g, (match, tag, attrs) => {
      const lower = tag.toLowerCase();
      if (!ALLOWED_TAGS.has(lower)) return '';
      const closing = match.startsWith('</');
      if (closing) return `</${lower}>`;
      if (lower === 'a') {
        const hrefMatch = attrs.match(/href\s*=\s*"([^"]*)"/i) || attrs.match(/href\s*=\s*'([^']*)'/i);
        const href = hrefMatch ? hrefMatch[1] : '';
        if (!/^(https?:|mailto:)/i.test(href)) return '<a>';
        return `<a href="${href.replace(/"/g, '&quot;')}" target="_blank" rel="noopener">`;
      }
      return `<${lower}>`;
    });
}

module.exports = { sanitizeRichText };
