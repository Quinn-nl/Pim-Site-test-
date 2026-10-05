'use strict';
/**
 * Password quality, without any outside service. Length (12+) is checked by the caller. Here: the things people do to make an easy password
 * look hard: a common word with a number behind it, keyboard rows, counting, one character repeated, their own name or address.
 * This is a safety net, not a database of breached passwords: it knows a few hundred very common words, not millions of leaked ones.
 * A passphrase of a few unrelated words passes, on purpose.
 */
const COMMON = `password wachtwoord welkom welcome qwerty azerty qwertz admin administrator letmein iloveyou monkey dragon master sunshine princess football baseball
basketball soccer hockey voetbal ajax feyenoord psv cruijff oranje nederland holland amsterdam rotterdam utrecht netherlands login secret geheim
changeme default test testing demo guest root user abc123 trustno1 superman batman spiderman starwars pokemon minecraft fortnite
shadow michael jennifer jessica charlie daniel thomas robert hunter ranger buster butter summer winter spring autumn zomer winter lente herfst
maandag dinsdag woensdag donderdag vrijdag zaterdag zondag januari februari maart april mei juni juli augustus september oktober november december
liefde schatje knuffel geluk vakantie fietsen lekker gezellig computer internet google facebook whatsapp instagram samsung apple iphone
killer ninja matrix mustang ferrari porsche mercedes corvette harley yankees cowboys liverpool arsenal chelsea barcelona madrid
aethra cubesat satelliet satellite prototype eco ecomodus voertuig vehicle lucht luchtkwaliteit airquality
asdfgh asdfghjkl zxcvbn zxcvbnm qazwsx qwertyuiop poiuytrewq lkjhgfdsa mnbvcxz 1qaz2wsx 1q2w3e4r 1q2w3e 123qwe
passw0rd p4ssword welkom01 geheim123 wachtwoord1 qwerty123 abc12345 iloveyou1 letmein1 master123 dragon123 monkey123`.split(/\s+/).filter((w) => w.length >= 3);

const LEET = { 0: 'o', 1: 'l', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };
const plainOf = (pw) => pw.toLowerCase().replace(/[01345@$!7]/g, (c) => LEET[c]).replace(/[^a-z0-9]/g, '');
const RUNS = ['abcdefghijklmnopqrstuvwxyz', 'zyxwvutsrqponmlkjihgfedcba', '0123456789', '9876543210', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'azertyuiop', 'qsdfghjklm'];

/** Share of the password that is covered by a run like "abcdef", "123456" or "qwerty" of 4+ characters. */
function runCoverage(pw) {
	const s = pw.toLowerCase();
	const covered = new Array(s.length).fill(false);
	for (let i = 0; i < s.length - 3; i += 1) {
		for (const run of RUNS) {
			const at = run.indexOf(s.slice(i, i + 4));
			if (at === -1) continue;
			let len = 4;
			while (i + len < s.length && run[at + len] === s[i + len]) len += 1;
			for (let k = i; k < i + len; k += 1) covered[k] = true;
			i += len - 1;
			break;
		}
	}
	return covered.filter(Boolean).length / s.length;
}

/** null when fine, otherwise a sentence for the person (Dutch). `who` = { email, naam }. */
function weakReason(password, who = {}) {
	const pw = String(password || '');
	const low = pw.toLowerCase();
	if (new Set(low).size < 5) return 'Dit wachtwoord bestaat uit te weinig verschillende tekens. Gebruik een zin van een paar woorden.';
	if (/^(.{1,6})\1{1,}$/.test(low) || /(.)\1{5,}/.test(low)) return 'Een herhaald stukje maakt een wachtwoord makkelijk te raden. Gebruik een zin van een paar woorden.';
	if (runCoverage(pw) >= 0.6) return 'Een rij als “123456”, “abcdef” of “qwerty” is een van de eerste dingen die worden geprobeerd. Gebruik een zin van een paar woorden.';
	const variants = [low.replace(/[^a-z0-9]/g, ''), plainOf(pw)];   // as typed, and with 0/1/3/4/5/7/@/$/! read as letters
	const words = [...COMMON].sort((a, b) => b.length - a.length);
	for (const v of variants) {
		let residue = v; let hit = '';
		for (const w of words) if (residue.includes(w)) { hit = hit || w; residue = residue.split(w).join(''); }
		if (hit && (residue.length <= 4 || (hit.length >= 5 && residue.length <= 6) || /^[0-9]*$/.test(residue))) return `“${hit}” (ook met cijfers, leestekens of herhaald) is een veelgebruikt wachtwoord. Gebruik een zin van een paar woorden die niet bij elkaar horen.`;
	}
	if (who.email && low.includes(String(who.email).toLowerCase())) return 'Gebruik je e-mailadres niet in je wachtwoord.';
	const local = String(who.email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
	const names = String(who.naam || '').toLowerCase().split(/\s+/).map((n) => n.replace(/[^a-z0-9]/g, '')).filter((n) => n.length >= 4);
	const plain = variants[0];
	for (const part of [local, ...names]) if (part.length >= 4 && plain.includes(part) && plain.length < part.length + 12) return 'Gebruik je eigen naam of e-mailadres niet in je wachtwoord.';
	return null;
}
module.exports = { weakReason };
