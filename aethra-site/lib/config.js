'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

module.exports = {
	ROOT,
	PORT: Number(process.env.PORT) || 3000,
	HOST: process.env.HOST || '127.0.0.1',
	DATA_DIR: path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data')),
	PUBLIC_DIR: path.join(ROOT, 'public'),
	// Cookies are Secure in production (behind HTTPS); override with COOKIE_SECURE=0/1.
	SECURE: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === '1' : process.env.NODE_ENV === 'production',
	// Set TRUST_PROXY=1 only when running behind a reverse proxy you control.
	TRUST_PROXY: process.env.TRUST_PROXY === '1',
	RETENTION_DAYS: Number(process.env.RETENTION_DAYS) || 365,
	// Public address used in canonical links, hreflang and the sitemap, e.g. https://aethra.example
	SITE_URL: (process.env.SITE_URL || '').replace(/\/+$/, ''),
	MAX_IMAGE_BYTES: 5 * 1024 * 1024,
};
