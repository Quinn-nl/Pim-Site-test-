'use strict';
/** Server-Sent Events for the admin: alarms (failed mail, health warnings, new messages) arrive without reloading the page. */
const clients = new Set();
let last = {};

function handle(req, res, headers) {
	res.writeHead(200, { ...headers, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
	res.write('retry: 5000\n\n');
	for (const [event, data] of Object.entries(last)) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
	const beat = setInterval(() => { try { res.write(': hb\n\n'); } catch (e) { /* closed */ } }, 25000);
	beat.unref();
	clients.add(res);
	const done = () => { clearInterval(beat); clients.delete(res); };
	req.on('close', done);
	res.on('error', done);
}
function broadcast(event, data, { remember = true } = {}) {
	if (remember) last[event] = data;
	const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
	for (const c of clients) { try { c.write(payload); } catch (e) { clients.delete(c); } }
}
const closeAll = () => { for (const c of clients) { try { c.end(); } catch (e) { /* closed */ } } clients.clear(); };
const count = () => clients.size;
const reset = () => { last = {}; closeAll(); };

module.exports = { handle, broadcast, closeAll, count, reset };
