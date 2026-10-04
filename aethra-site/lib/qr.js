'use strict';
/**
 * Minimal QR code encoder (byte mode, error correction level M, versions 1 to 10) that returns an SVG.
 * No dependencies, used for the authenticator set-up code. Structure follows ISO/IEC 18004.
 */
const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const MAX_VERSION = 10;

const rawModules = (v) => {
	let n = (16 * v + 128) * v + 64;
	if (v >= 2) { const a = Math.floor(v / 7) + 2; n -= (25 * a - 10) * a - 55; if (v >= 7) n -= 36; }
	return n;
};
const dataCodewords = (v) => Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[v] * BLOCKS[v];

function gfMul(x, y) {
	let z = 0;
	for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
	return z;
}
function rsDivisor(degree) {
	const result = new Array(degree).fill(0);
	result[degree - 1] = 1;
	let root = 1;
	for (let i = 0; i < degree; i++) {
		for (let j = 0; j < degree; j++) { result[j] = gfMul(result[j], root); if (j + 1 < degree) result[j] ^= result[j + 1]; }
		root = gfMul(root, 2);
	}
	return result;
}
function rsRemainder(data, divisor) {
	const result = new Array(divisor.length).fill(0);
	for (const b of data) {
		const factor = b ^ result.shift();
		result.push(0);
		divisor.forEach((c, i) => { result[i] ^= gfMul(c, factor); });
	}
	return result;
}

function encodeData(bytes, v) {
	const bits = [];
	const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
	put(0b0100, 4);
	put(bytes.length, v < 10 ? 8 : 16);
	for (const b of bytes) put(b, 8);
	const capacity = dataCodewords(v) * 8;
	put(0, Math.min(4, capacity - bits.length));
	put(0, (8 - (bits.length % 8)) % 8);
	const out = [];
	for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(''), 2));
	for (let pad = 0xec; out.length < dataCodewords(v); pad ^= 0xec ^ 0x11) out.push(pad);
	return out;
}

function addEcc(data, v) {
	const blocks = BLOCKS[v];
	const eccLen = ECC_PER_BLOCK[v];
	const total = Math.floor(rawModules(v) / 8);
	const shortBlocks = blocks - (total % blocks);
	const shortLen = Math.floor(total / blocks) - eccLen;
	const divisor = rsDivisor(eccLen);
	const parts = [];
	for (let i = 0, k = 0; i < blocks; i++) {
		const len = shortLen + (i < shortBlocks ? 0 : 1);
		const d = data.slice(k, k + len);
		k += len;
		parts.push({ d, e: rsRemainder(d, divisor) });
	}
	const out = [];
	for (let i = 0; i <= shortLen; i++) parts.forEach((p) => { if (i < p.d.length) out.push(p.d[i]); });
	for (let i = 0; i < eccLen; i++) parts.forEach((p) => out.push(p.e[i]));
	return out;
}

const MASKS = [
	(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
	(x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
	(x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function build(bytes, v) {
	const size = v * 4 + 17;
	const m = Array.from({ length: size }, () => new Array(size).fill(false));
	const fn = Array.from({ length: size }, () => new Array(size).fill(false));
	const set = (x, y, dark) => { m[y][x] = dark; fn[y][x] = true; };
	const bit = (n, i) => ((n >>> i) & 1) !== 0;

	for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
	for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
		for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
			const x = cx + dx, y = cy + dy;
			if (x >= 0 && x < size && y >= 0 && y < size) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(x, y, d !== 2 && d !== 4); }
		}
	}
	let pos = [];
	if (v > 1) {
		const n = Math.floor(v / 7) + 2;
		const step = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
		pos = [6];
		for (let p = size - 7; pos.length < n; p -= step) pos.splice(1, 0, p);
	}
	pos.forEach((cx, i) => pos.forEach((cy, j) => {
		if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) return;
		for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
	}));
	const drawFormat = (mask) => {
		const data = (0 << 3) | mask; // level M = 0
		let rem = data;
		for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
		const bits = ((data << 10) | rem) ^ 0x5412;
		for (let i = 0; i <= 5; i++) set(8, i, bit(bits, i));
		set(8, 7, bit(bits, 6)); set(8, 8, bit(bits, 7)); set(7, 8, bit(bits, 8));
		for (let i = 9; i < 15; i++) set(14 - i, 8, bit(bits, i));
		for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(bits, i));
		for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(bits, i));
		set(8, size - 8, true);
	};
	drawFormat(0);
	if (v >= 7) {
		let rem = v;
		for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
		const bits = (v << 12) | rem;
		for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, bit(bits, i)); set(b, a, bit(bits, i)); }
	}

	const codewords = addEcc(encodeData(bytes, v), v);
	let i = 0;
	for (let right = size - 1; right >= 1; right -= 2) {
		if (right === 6) right = 5;
		for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
			const x = right - j;
			const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
			if (!fn[y][x] && i < codewords.length * 8) { m[y][x] = bit(codewords[i >>> 3], 7 - (i & 7)); i++; }
		}
	}

	const penalty = () => {
		let p = 0;
		const lines = [];
		for (let a = 0; a < size; a++) {
			lines.push(m[a].map((c) => (c ? 1 : 0)).join(''));
			lines.push(m.map((row) => (row[a] ? 1 : 0)).join(''));
		}
		for (const s of lines) {
			for (const run of s.match(/0+|1+/g)) if (run.length >= 5) p += run.length - 2;
			p += 40 * ((s.match(/(?=10111010000)/g) || []).length + (s.match(/(?=00001011101)/g) || []).length);
		}
		for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
		const dark = m.flat().filter(Boolean).length;
		p += 10 * Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size));
		return p;
	};
	const apply = (mask) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[mask](x, y)) m[y][x] = !m[y][x]; };
	let best = 0, bestScore = Infinity;
	for (let mask = 0; mask < 8; mask++) {
		apply(mask); drawFormat(mask);
		const s = penalty();
		if (s < bestScore) { best = mask; bestScore = s; }
		apply(mask);
	}
	apply(best); drawFormat(best);
	return m;
}

/** @returns {string} an inline SVG (dark modules on a white square, 4-module quiet zone) */
function qrSvg(text, label = 'QR code') {
	const bytes = Buffer.from(String(text), 'utf8');
	let v = 1;
	while (v <= MAX_VERSION && 4 + (v < 10 ? 8 : 16) + 8 * bytes.length > dataCodewords(v) * 8) v++;
	if (v > MAX_VERSION) throw new Error('Text too long for the QR code');
	const m = build(bytes, v);
	const q = 4, n = m.length + q * 2;
	let d = '';
	m.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x + q} ${y + q}h1v1h-1z`; }));
	return `<svg class="qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="224" height="224" shape-rendering="crispEdges" role="img" aria-label="${label.replace(/[<>&"]/g, '')}"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

module.exports = { qrSvg };
