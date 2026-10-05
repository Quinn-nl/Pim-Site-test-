'use strict';
/**
 * Strict HTML whitelist for rich text. A small tokenizer (not a regex replace) walks the input:
 * only the tags below survive, attributes are rebuilt from scratch (only href on links, only http(s), mailto, /path or #anchor),
 * script/style/iframe/object/embed/svg/math content is dropped, comments are dropped, tags are balanced, text is re-escaped.
 */
const ALLOWED = new Set(['h2', 'h3', 'p', 'ul', 'ol', 'li', 'blockquote', 'strong', 'em', 'a', 'br']);
const RENAME = { b: 'strong', i: 'em', h1: 'h2', h4: 'h3', h5: 'h3', h6: 'h3', div: 'p' };
const VOID = new Set(['br']);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'noscript', 'template', 'textarea', 'title', 'head']);
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^'">])*)(\/?)>/y;

const esc = (s) => s.replace(/&(?!(?:[a-zA-Z]{2,8}|#\d{1,6}|#x[0-9a-fA-F]{1,6});)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function safeHref(raw) {
	let v = String(raw || '').replace(/&amp;/gi, '&').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)));
	v = v.replace(/[\u0000-\u0020\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, '').trim(); // control characters are used to smuggle schemes ("java\tscript:")
	if (!v || v.length > 2000) return null;
	if (/^(https?:\/\/|mailto:)/i.test(v)) { try { const u = new URL(v); return /^(https?:|mailto:)$/.test(u.protocol) ? v : null; } catch (e) { return null; } }
	if (/^\/(?!\/)/.test(v) || /^#/.test(v)) return v;
	return null;
}

function attr(attrs, name) {
	const m = new RegExp(`(?:^|[\\s/"'])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, 'i').exec(attrs);
	return m ? (m[1] ?? m[2] ?? m[3]) : null;
}

function sanitizeHtml(input, max = 100000) {
	const src = String(input == null ? '' : input).replace(/\u0000/g, '').slice(0, max);
	const out = [];
	const stack = [];
	let i = 0;
	let skipUntil = null;
	while (i < src.length) {
		if (src[i] !== '<') {
			const next = src.indexOf('<', i);
			const end = next === -1 ? src.length : next;
			if (!skipUntil) out.push(esc(src.slice(i, end)));
			i = end;
			continue;
		}
		if (src.startsWith('<!--', i)) { const e = src.indexOf('-->', i + 4); i = e === -1 ? src.length : e + 3; continue; }
		TAG.lastIndex = i;
		const m = TAG.exec(src);
		if (!m) { if (!skipUntil) out.push('&lt;'); i += 1; continue; }
		i = TAG.lastIndex;
		const closing = m[1] === '/';
		let name = m[2].toLowerCase();
		if (skipUntil) { if (closing && name === skipUntil) skipUntil = null; continue; }
		if (!closing && DROP_WITH_CONTENT.has(name)) { if (!/\/$/.test(m[3]) && !m[4]) skipUntil = name; continue; }
		name = RENAME[name] || name;
		if (!ALLOWED.has(name)) continue; // unknown tag: drop the tag, keep its text
		if (closing) {
			const at = stack.lastIndexOf(name);
			if (at === -1) continue;
			while (stack.length > at) out.push(`</${stack.pop()}>`);
			continue;
		}
		if (VOID.has(name)) { out.push('<br>'); continue; }
		if (name === 'li' && !stack.includes('ul') && !stack.includes('ol')) continue;
		if ((name === 'li' && stack[stack.length - 1] === 'li') || (['p', 'ul', 'ol', 'blockquote', 'h2', 'h3'].includes(name) && stack[stack.length - 1] === 'p')) out.push(`</${stack.pop()}>`); // an open <li> or <p> ends where the next one starts
		if (name === 'a') {
			const href = safeHref(attr(m[3], 'href'));
			if (!href) continue; // a link without a safe address is just its text
			if (stack.includes('a')) continue;
			out.push(`<a href="${esc(href)}"${/^https?:/i.test(href) ? ' rel="noopener"' : ''}>`);
		} else {
			out.push(`<${name}>`);
		}
		stack.push(name);
	}
	while (stack.length) out.push(`</${stack.pop()}>`);
	return out.join('').trim();
}

const textOf = (html) => sanitizeHtml(html).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

module.exports = { sanitizeHtml, safeHref, textOf };
