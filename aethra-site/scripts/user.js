'use strict';
/**
 * User management from the command line (the first account has to be made here, before anyone can log in).
 *   npm run user:create -- --email=jij@voorbeeld.nl --naam="Jouw naam" [--rol=beheerder|editor|lezer]   (asks for a password, or ADMIN_PASSWORD)
 *   npm run user:password -- --email=jij@voorbeeld.nl                                                    (asks for a new password)
 *   npm run user:reset-2fa -- --email=jij@voorbeeld.nl                                                   (turns two-step verification off)
 *   npm run user:list
 */
const readline = require('readline');
const db = require('../lib/cms/db');
const users = require('../lib/cms/users');

const [cmd, ...rest] = process.argv.slice(2);
const args = Object.fromEntries(rest.filter((a) => a.startsWith('--')).map((a) => { const i = a.indexOf('='); return i === -1 ? [a.slice(2), '1'] : [a.slice(2, i), a.slice(i + 1)]; }));

function ask(question) {
	return new Promise((resolve) => {
		const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
		const write = rl._writeToOutput;
		rl._writeToOutput = function (s) { if (s.startsWith(question)) write.call(rl, s); }; // typed characters are not echoed
		rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
	});
}
const need = (name) => { if (!args[name]) { console.error(`Missing --${name}=...`); process.exit(1); } return args[name]; };

(async () => {
	db.open();
	try {
		if (cmd === 'create') {
			const email = need('email');
			const naam = need('naam');
			const pw = process.env.ADMIN_PASSWORD || await ask('Password (at least 12 characters): ');
			const id = users.create({ email, naam, rol: args.rol || (users.count() === 0 ? 'beheerder' : 'editor'), wachtwoord: pw });
			console.log(`Account #${id} created for ${email}. Log in at /admin. Turn on two-step verification on the account page.`);
		} else if (cmd === 'password') {
			const u = users.byEmail(need('email'));
			if (!u) throw new Error('No such user.');
			users.setPassword(u.id, process.env.ADMIN_PASSWORD || await ask('New password (at least 12 characters): '));
			users.destroyOthers(u.id, '');
			console.log('Password saved. Other sessions of this user are signed out.');
		} else if (cmd === 'reset-2fa') {
			const u = users.byEmail(need('email'));
			if (!u) throw new Error('No such user.');
			users.disableTwoFactor(u.id);
			console.log('Two-step verification is off for this user. They can turn it on again on the account page.');
		} else if (cmd === 'list') {
			for (const u of users.list()) console.log(`${u.id}\t${u.email}\t${u.naam}\t${u.rol}\t${u.actief ? 'actief' : 'uit'}\t${u.tweestaps ? '2FA' : '-'}`);
		} else {
			console.error('Usage: user.js create|password|reset-2fa|list (see the comment at the top of this file)');
			process.exit(1);
		}
	} catch (e) {
		console.error(e.message);
		process.exit(1);
	}
	db.close();
})();
