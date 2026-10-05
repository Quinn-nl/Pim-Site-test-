'use strict';
/**
 * /healthz/status for monitoring tools: 200 when everything is fine, 503 when something needs attention.
 * Without a token only the status word is shown. With HEALTH_TOKEN set and given (?token= or the X-Health-Token header) the reasons are listed too.
 */
const fs = require('fs');
const crypto = require('crypto');
const db = require('./db');
const backup = require('./backup');
const cfg = require('../config');

function check(now = Date.now()) {
	const problems = [];
	const facts = {};
	if (db.degraded()) problems.push('database');
	else { try { db.get('SELECT 1 AS ok'); facts.database = 'ok'; } catch (e) { problems.push('database'); } }
	try {
		const st = fs.statfsSync(cfg.DATA_DIR);
		const free = st.bavail * st.bsize;
		facts.schijf_vrij_procent = Math.round((free / (st.blocks * st.bsize)) * 100);
		if (free < 200 * 1024 * 1024 || free / (st.blocks * st.bsize) < 0.05) problems.push('schijf');
	} catch (e) { /* not supported on this platform: not a reason to alarm */ }
	try {
		const last = backup.list()[0];
		facts.back_up_uren = last ? Math.round((now - Date.parse(last.tijd)) / 3600000) : null;
		if (last ? now - Date.parse(last.tijd) > 48 * 3600 * 1000 : process.uptime() > 48 * 3600) problems.push('back-up');
	} catch (e) { problems.push('back-up'); }
	return { status: problems.length ? 'degraded' : 'ok', problems, facts };
}
function render(token, headerToken) {
	const r = check();
	const secret = String(process.env.HEALTH_TOKEN || '');
	const given = String(token || headerToken || '');
	const detailed = secret.length >= 16 && given.length === secret.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
	return { code: r.status === 'ok' ? 200 : 503, body: detailed ? { status: r.status, problemen: r.problems, ...r.facts } : { status: r.status } };
}
module.exports = { check, render };
