'use strict';
/** Search across the admin for the Ctrl+K palette: screens, pages, texts, messages, photos, people. Only what the person is allowed to see. */
const db = require('./db');
const pages = require('./pages');
const users = require('./users');
const { GROUPS } = require('../fields');

const SCREENS = [
	['Dashboard', '/admin', 'start overzicht taken'], ['Pagina’s en teksten', '/admin/paginas', 'pagina teksten bewerken'], ['Nieuwe pagina', '/admin/paginas/nieuw', 'maken toevoegen'],
	['Media', '/admin/media', 'foto afbeelding upload'], ['Te beoordelen', '/admin/reviews', 'review voorstel goedkeuren'], ['Planning', '/admin/planning', 'gepland publiceren'],
	['Vertalingen', '/admin/vertalingen', 'taal vertaling nakijken'], ['Prullenbak', '/admin/prullenbak', 'verwijderd terugzetten'], ['Berichten', '/admin/berichten', 'inbox contact'],
	['Mailwachtrij', '/admin/wachtrij', 'mail verzonden'], ['Menu', '/admin/menu', 'navigatie links voettekst'], ['Zoekmachines', '/admin/seo', 'seo google sitemap robots'],
	['Linkcontrole', '/admin/links', 'kapotte links'], ['Redirects', '/admin/redirects', 'doorverwijzing 301'], ['Statistieken', '/admin/stats', 'bezoek weergaven'],
	['Antwoordsjablonen', '/admin/sjablonen', 'reactie mail standaardtekst'], ['Voorbeeldlinks', '/admin/voorbeeldlinks', 'delen concept'], ['Mijn account', '/admin/account', 'wachtwoord 2fa profiel'],
	['Help', '/admin/help', 'uitleg handleiding sneltoetsen'], ['Privacy en cookies', '/admin/privacy-overzicht', 'cookies gegevens bewaartermijn'],
	['Gebruikers', '/admin/gebruikers', 'rollen uitnodigen', 'beheer'], ['Instellingen', '/admin/instellingen', 'mededeling onderhoud bewaartermijn', 'beheer'], ['Redactionele regels', '/admin/regels', 'verboden termen compliance', 'beheer'],
	['Systeem', '/admin/systeem', 'backup status schijf', 'beheer'], ['Beveiliging', '/admin/beveiligingsrapport', 'beveiligingsrapport tweestaps passkeys accounts', 'beheer'], ['Auditlog', '/admin/audit', 'wijzigingen log', 'beheer'],
];
const like = (q) => `%${String(q).replace(/[\\%_]/g, '\\$&')}%`;

function search(q, user, limit = 24) {
	q = String(q || '').trim().slice(0, 80);
	if (q.length < 1) return [];
	const lc = q.toLowerCase();
	const out = [];
	const add = (groep, titel, sub, href) => { if (out.length < limit) out.push({ groep, titel, sub, href }); };
	for (const [titel, href, kw, need] of SCREENS) if ((titel + ' ' + kw).toLowerCase().includes(lc) && (!need || users.can(user, need))) add('Schermen', titel, '', href);
	const { PLACE } = require('./views');
	for (const g of GROUPS) { const label = (PLACE[g.id] && PLACE[g.id].label) || g.title; if (label.toLowerCase().includes(lc) || g.id.includes(lc)) add('Teksten', label, '', `/admin/tekst/${g.id}`); }
	for (const p of pages.list()) { const t = Object.values(p.titels).join(' ').toLowerCase(); if (t.includes(lc)) add('Pagina’s', p.titels.nl || p.titels.en || `Pagina ${p.id}`, p.status === 'concept' ? 'concept' : 'live', `/admin/paginas/${p.id}`); }
	for (const r of db.all("SELECT m.object, m.waarde FROM vertalingen m JOIN media f ON f.id = CAST(substr(m.object, 7) AS INTEGER) WHERE m.object LIKE 'media:%' AND m.veld = 'alt' AND f.verwijderd_op IS NULL AND m.waarde LIKE ? ESCAPE '\\' LIMIT 5", like(q))) add('Foto’s', r.waarde, '', '/admin/media');
	for (const m of db.all("SELECT id, naam, email, organisatie, status FROM berichten WHERE naam LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR organisatie LIKE ? ESCAPE '\\' OR tekst LIKE ? ESCAPE '\\' ORDER BY tijd DESC LIMIT 6", like(q), like(q), like(q), like(q))) add('Berichten', m.naam, [m.organisatie, m.email].filter(Boolean).join(' · '), `/admin/berichten/${m.id}`);
	if (users.can(user, 'beheer')) for (const u of users.list()) if ((u.naam + ' ' + u.email).toLowerCase().includes(lc)) add('Gebruikers', u.naam, u.email, '/admin/gebruikers');
	return out;
}
module.exports = { search, SCREENS };
