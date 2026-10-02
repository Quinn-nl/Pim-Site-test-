# Aethra website

One scrolling page plus a privacy page, with a built-in admin panel at `/admin`.
Node.js 20+ only: no npm packages, no database, no external requests (fonts, scripts and analytics are all local).

## Start
```bash
cd aethra-site
npm run set-password      # once: choose an admin password of at least 12 characters
npm start                 # http://127.0.0.1:3000   (PORT / HOST can be set)
npm test                  # 7 tests: security, form, upload, admin
```
Data (texts, photos, messages, password hash) lives in `aethra-site/data/` (git-ignored; set `DATA_DIR` to move it). **Back this folder up.**

## Admin panel (`/admin`)
- **Content:** every text on the page, grouped by section.
- **Photos:** upload to the hero, problem or status section (JPG/PNG/WebP, max 5 MB). Sections show fine without photos.
- **Privacy statement:** editable text for `/privacy` (a draft with [brackets] is pre-filled; complete and have it reviewed).
- **Messages:** contact-form inbox with delete; messages are deleted automatically after `RETENTION_DAYS` (default 365).
- **Account:** change password.

## Going live
Run it behind an HTTPS reverse proxy (Caddy, nginx) and set:
`NODE_ENV=production` (Secure cookies and HSTS), `TRUST_PROXY=1` (correct client IP for rate limits), and keep a process manager (systemd/pm2) running `npm start`. Domain and hosting should be registered in the client's name. There is no outgoing mail: new messages appear in the admin inbox, so check it regularly (or ask for an email notification to be added with an SMTP provider).

## Security built in
Scrypt password hash, rate-limited login, 8 h sessions with HttpOnly/SameSite=Strict cookies, CSRF tokens on every admin action, strict Content-Security-Policy (no inline scripts), output escaping, upload checked by file signature and stored under random names, signed form token + honeypot + per-IP limit on the contact form, path-traversal-safe static serving.

## Before launch (not handled by code)
- Trademark check for the name (BOIP/EUIPO): a company called AETHRA exists in the same sector.
- Verify the two cited statistics at their sources; have all copy checked for claims (ACM) and investor communication (AFM). No emission-reduction figures, no technical "how", no offer of shares or returns.
- Photos: only upload images you may use; show AI imagery as atmosphere only, never as the prototype. Strip EXIF/location data first.
- Fill in company details and the privacy statement.
