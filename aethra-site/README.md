# Aethra website

Five short pages (Home, The problem, How it works, Applications, Contact) plus a privacy page, in English, Dutch, German and French, with a built-in admin panel at `/admin`.
Node.js 20+ only: no npm packages, no database, no external requests (fonts, scripts and analytics are all local).

## Start
```bash
cd aethra-site
npm run set-password      # once: choose an admin password of at least 12 characters
npm run reset-2fa          # only if the phone and recovery codes are lost: turns two-step verification off
npm start                 # http://127.0.0.1:3000   (PORT / HOST can be set)
npm test                  # 22 tests: security, languages, SEO, form, upload, admin
```
Data (texts, photos, messages, password hash) lives in `aethra-site/data/` (git-ignored; set `DATA_DIR` to move it). **Back this folder up.**

## Languages and SEO
- Visitors are sent to `/en/`, `/nl/`, `/de/` or `/fr/` based on their browser language (a language they pick is remembered in one functional cookie; unknown languages get English). Every language has its own URL.
- Each page has a title, description, canonical link, `hreflang` alternates, Open Graph tags and structured data (Organization, WebSite, breadcrumbs). `/sitemap.xml` and `/robots.txt` are generated. Pages are gzip-compressed and static files are cached with ETags.
- **Set `SITE_URL`** (for example `https://aethra.example`) in production so canonical links and the sitemap use your real domain.
- Dutch, German and French copy is a first draft: have native speakers review it (especially technical terms and the privacy text). Add another language in `lib/i18n.js` (UI strings and translated copy) and the `LANGS` list.
- Not included, because there is no image yet: a social-sharing image (`og:image`). Add one once the brand has a logo or photo.

## Audience pages, statistics and follow-up
- **One page per audience** (`/<lang>/for/municipalities|fleets|manufacturers|platforms|investors`) with its own heading, three points, two FAQs (with FAQ markup for search engines) and a button that opens the contact form with the right role selected. Every text is editable per language. The investor page states that the site is not an offer.
- **Statistics** (admin > Statistics): anonymous page views per day, top pages, sources and campaigns, language, contact-page-to-message rate and messages by role. No cookies, no IP addresses, no visitor identifiers; Do Not Track and Global Privacy Control are respected; crawlers are not counted. Tag links with `?utm_source=linkedin&utm_campaign=launch`: the tags stay on internal links while a visitor browses (no storage needed) and are saved on the message, so the CSV shows which campaign produced which lead.
- **Confirmation e-mail** to the visitor (fixed text in their language, once per address per day) when SMTP is set. Switch off with `AUTO_REPLY=0`.
- `/llms.txt` summarises the site for AI search tools.

## Testing layout with worst-case data
Start with `DEV_TOGGLE=1` (ignored when `NODE_ENV=production`): a small switch appears at the bottom of every public page to flip between **Demo data**, **Worst case** (every text twice as long, huge numbers, long site name and source) and **Empty** (optional texts cleared). `scripts/stress-test.cjs` runs this over every page, language and width (needs Playwright) and reports overflow. Long words hyphenate or break instead of overflowing; empty optional fields hide their labels.

## Conversion
Every page ends in one call to action; segment cards link to the contact form with the right role preselected; the form asks for the minimum, says when you will reply (editable) and what happens with the details; a fixed contact button appears on phones. No analytics are installed on purpose: the admin inbox shows each message with its role and language.

## Admin panel (`/admin`)
- **Content:** every text, per language (tabs), grouped by section.
- **Photos:** upload to the hero, problem or status section (JPG/PNG/WebP, max 5 MB). Sections show fine without photos.
- **Privacy statement:** editable text for `/privacy`, per language (a draft with [brackets] is pre-filled; complete and have it reviewed).
- **Messages:** contact-form inbox with delete; messages are deleted automatically after `RETENTION_DAYS` (default 365).
- **Account:** change password.

## Getting messages by e-mail
Set these environment variables and every new message is also e-mailed to your team (it always stays in the admin inbox too):
`SMTP_HOST`, `SMTP_PORT` (587 with STARTTLS, or 465), `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_TO` (comma separated). Without `SMTP_HOST` nothing is sent. The mail provider then handles message contents, so name it in the privacy statement. A failed send is logged (without personal data) and never blocks the visitor. Reply-To is set to the visitor, so you can answer directly.

## Photos
Uploads are checked by structure, location data (EXIF) and other metadata are removed automatically, and the size is stored so the page does not jump while loading. The hero photo is loaded first for speed. Use photos about 2000 px wide; a 1200 x 630 image in the "Social sharing image" slot is used when the site is shared. The photo itself is not resized, so compress large files before uploading.

## Back-ups
`npm run backup` copies the data folder to `backups/<date-time>` and keeps the newest 14. Schedule it (cron) and also copy the folder off the server.

## Going live
Run it behind an HTTPS reverse proxy (Caddy, nginx) and set:
`INDEXNOW_KEY` (optional: serves the IndexNow key file; then `npm run indexnow` tells Bing and others about all URLs), `AI_TRAINING=allow` (optional: lets AI model-training crawlers read the site; by default they are blocked in robots.txt while search and answer bots stay allowed), `SITE_URL` (your public address), `NODE_ENV=production` (Secure cookies and HSTS), `TRUST_PROXY=1` (correct client IP for rate limits; the proxy must append the client address to `X-Forwarded-For`), optionally `SECURITY_CONTACT` (publishes `/.well-known/security.txt`), and keep a process manager (systemd/pm2) running `npm start`. Fonts (Exo 2, IBM Plex Sans and Mono, SIL Open Font License) are self-hosted in `public/fonts/`. Domain and hosting should be registered in the client's name. There is no outgoing mail: new messages appear in the admin inbox, so check it regularly (or ask for an email notification to be added with an SMTP provider).

## Security built in
Scrypt password hash, rate-limited login, 8 h sessions with HttpOnly/SameSite=Strict cookies, CSRF tokens on every admin action, strict Content-Security-Policy (no inline scripts), output escaping, upload checked by file signature and stored under random names, signed form token + honeypot + per-IP limit on the contact form, path-traversal-safe static serving.

## Before launch (not handled by code)
- Trademark check for the name (BOIP/EUIPO): a company called AETHRA exists in the same sector.
- Verify the two cited statistics at their sources; have all copy checked for claims (ACM) and investor communication (AFM). No emission-reduction figures, no technical "how", no offer of shares or returns.
- Photos: only upload images you may use; show AI imagery as atmosphere only, never as the prototype. Strip EXIF/location data first.
- Fill in company details and the privacy statement.

## Two-step verification

Admin > Account > Two-step verification > Set up. Scan the QR code with any authenticator app (or type the key it shows under "Cannot scan it?"), enter the code, and save the 8 one-time recovery codes. After that, logging in needs the password and a code. The authenticator secret is stored encrypted (AES-256-GCM, key derived from `data/secret.key`), a code can be used once, and five wrong tries end the login step. Setting it up, turning it off and creating new recovery codes all ask for your password (and, except for setting up, a code). Keep `data/` in your backups: without `secret.key` the stored secret cannot be read (run `npm run reset-2fa` and set it up again).

## SEO checks

`npm run seo` checks every page in every language (titles, descriptions, H1, canonical, hreflang mesh, Open Graph, JSON-LD, images, internal links, sitemap, robots, 404, headers) and exits with an error when something is wrong. `npm run seo:baseline` saves the current state (`seo/baseline.json`); `npm run seo:compare` after a change lists what moved (title, canonical, robots, structured data, word count). Run it before every release. The SEO skills in `.claude/skills/seo*` add deeper audits.

## Context page (hidden by default)

`/en/eco-mode-today` (and NL/DE/FR) summarises which geofenced eco-mode products exist today (each statement links its source) and what is still missing. It is **not published** until someone checks the sources and types `yes` in Admin > Content > "Page: geofenced eco mode today". Edit the English field, the other languages follow their own text. While off, the page returns 404 and is absent from the footer, sitemap and llms.txt. No claims about Aethra's results, no "first" or "only".
