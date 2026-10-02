'use strict';
/** Fixed-window in-memory limiter. Resets on restart, which is fine for a small site. */
function createLimiter(max, windowMs) {
	const hits = new Map();
	return {
		allow(key) {
			const now = Date.now();
			if (hits.size > 5000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
			const entry = hits.get(key);
			if (!entry || entry.reset <= now) {
				hits.set(key, { count: 1, reset: now + windowMs });
				return true;
			}
			entry.count += 1;
			return entry.count <= max;
		},
		clear(key) {
			hits.delete(key);
		},
	};
}
module.exports = { createLimiter };
