'use strict';
/** Usage: npm run set-password  (prompts; or set ADMIN_PASSWORD in the environment). */
const readline = require('readline');
const auth = require('../lib/auth');

function ask(question) {
	return new Promise((resolve) => {
		const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
		const write = rl._writeToOutput;
		rl._writeToOutput = function (s) { if (s.startsWith(question)) write.call(rl, s); };
		rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
	});
}

(async () => {
	const pw = process.env.ADMIN_PASSWORD || (await ask('New admin password (min. 12 characters): '));
	try {
		auth.setPassword(pw);
		console.log('Admin password saved.');
	} catch (err) {
		console.error(err.message);
		process.exit(1);
	}
})();
