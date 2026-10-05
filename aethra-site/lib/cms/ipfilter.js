'use strict';
/** An allow-list of addresses for the admin: single IPv4/IPv6 addresses and CIDR ranges (192.168.1.0/24, 2001:db8::/32). */
const net = require('net');

function toBig(ip) {
	const v = String(ip || '').trim().replace(/^::ffff:/i, '');
	if (net.isIPv4(v)) return { bits: 32, n: v.split('.').reduce((a, o) => (a << 8n) + BigInt(o), 0n) };
	if (net.isIPv6(v)) {
		const [head, tail = ''] = v.split('::');
		const h = head ? head.split(':') : []; const t = tail ? tail.split(':') : [];
		const mid = v.includes('::') ? new Array(8 - h.length - t.length).fill('0') : [];
		return { bits: 128, n: [...h, ...mid, ...t].reduce((a, g) => (a << 16n) + BigInt(parseInt(g || '0', 16)), 0n) };
	}
	return null;
}
/** Text -> [{ bits, n, prefix }]. Throws an Error (Dutch message) on anything that is not an address or range. */
function parseList(text) {
	const out = [];
	for (const raw of String(text || '').split(/[\s,;]+/).filter(Boolean)) {
		const [addr, len] = raw.split('/');
		const b = toBig(addr);
		if (!b) throw new Error(`“${raw.slice(0, 40)}” is geen geldig IP-adres of bereik (zoals 203.0.113.7 of 192.168.1.0/24).`);
		const prefix = len === undefined ? b.bits : Number(len);
		if (!Number.isInteger(prefix) || prefix < 0 || prefix > b.bits || (len !== undefined && !/^\d+$/.test(len))) throw new Error(`“${raw.slice(0, 40)}”: de lengte na de / klopt niet.`);
		if (out.length >= 50) throw new Error('Maximaal 50 adressen of bereiken.');
		out.push({ ...b, prefix });
	}
	return out;
}
function matches(ip, list) {
	const b = toBig(ip);
	if (!b) return false;
	return list.some((r) => { if (r.bits !== b.bits) return false; const shift = BigInt(r.bits - r.prefix); return (r.n >> shift) === (b.n >> shift); });
}
module.exports = { parseList, matches, toBig };
