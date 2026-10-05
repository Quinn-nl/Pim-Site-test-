'use strict';
/** robots.txt, shared by the public route and the admin overview. Search and answer bots stay allowed; training-only bots are blocked unless AI_TRAINING=allow (a licensing choice, it does not affect search or AI answers). */
function robotsTxt(siteUrl) {
	const allow = process.env.AI_TRAINING === 'allow';
	const training = allow ? '' : `${['GPTBot', 'ClaudeBot', 'Google-Extended', 'CCBot', 'Applebot-Extended'].map((b) => `User-agent: ${b}`).join('\n')}\nDisallow: /\n\n`;
	return `${training}User-agent: *\nAllow: /\nDisallow: /admin\nContent-Signal: search=yes, ai-input=yes, ai-train=${allow ? 'yes' : 'no'}\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
}
module.exports = { robotsTxt };
