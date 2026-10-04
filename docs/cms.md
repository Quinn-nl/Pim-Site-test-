# CMS (Payload) at `/admin2`

Open-source (MIT) headless CMS, no paid tiers. Pim edits texts, pages and photos here and reads the contact messages.
`/admin` stays the site's own simple panel. When the CMS is on, `/admin` shows a banner that content lives in the CMS.

## First start (Windows, macOS, Linux; Node 22 LTS)

```
cd aethra-site
npm run cms:init -- --email=pim@jouwdomein.nl     # once: creates payload/.env, installs dependencies
npm run cms                                       # terminal 1: CMS on 127.0.0.1:3001 (use `npm run cms:build` + `npm run cms:start` for production)
npm run cms:setup                                 # terminal 2, once the CMS is up: first admin, texts per language, "website" API key
npm run start:cms                                 # terminal 2: website on http://localhost:3000, CMS on /admin2
```

Open `http://localhost:3000/admin2`. The first account created is always an admin.

## How it fits together

- The website reads texts, photos and pages from the CMS every `CMS_POLL_MS` (default 30 s). If the CMS is down it keeps showing the last saved content.
- Env vars for the website: `CONTENT_SOURCE=payload`, `CMS_URL`, `CMS_API_KEY`, `CMS_POLL_MS` (`npm run start:cms` sets them from `payload/.env`).
- Contact messages are stored in the site's own inbox first, then copied to **Inbox > Messages** in the CMS. Deleting a message in the site inbox removes the copy; messages are purged after the retention period.
- Pages (**Website > Pages**) are written per language, with drafts. Only published pages appear on the site, in the sitemap (with hreflang) and optionally in the footer.
- Rich text is converted to safe HTML (headings, lists, quotes, bold/italic, http(s)/mailto links); nothing else is passed through.

## Handy to know

- The dashboard groups texts per page (Home, The problem, How it works, Applications, Contact, Audience pages, Extra pages, Settings). The icon next to Save opens the live page.
- Edits show on the website within a second (the CMS tells the site; `SITE_REFRESH_TOKEN` in `payload/.env` is the shared secret). If the token was added later, restart the CMS once.
- Messages: search on name, e-mail, organisation and text; tick Handled when replied. The dashboard shows how many are unhandled.
- Pages: the address is filled in from the heading when left empty; drafts autosave; photos need a description.
- GraphQL is switched off, uploads are limited to 8 MB, and editors do not see the Users list.

## Security

- Roles: `admin` (everything), `editor` (content and messages), `site` (API key used by the website, only creates messages and reads content).
- Login lockout after 5 failed tries for 15 minutes; two-step verification (TOTP) via the `payload-totp` plugin, set up on the account page.
- `/admin2` responses are `noindex`; the proxy target is fixed (`CMS_URL`), so it is not an open proxy.
- Keep `payload/.env` secret (gitignored). Change the test password and `PAYLOAD_SECRET` before going live.

## Limits to know

- One Payload global per text group (SQLite fails above ~127 columns per query).
- Photos: those uploaded in the CMS replace the ones from `/admin` while the CMS is the source.
- Run behind HTTPS in production (set `SITE_URL`).
- Dev mode (`npm run cms`) can be slow on the first page load; the production build is fast.

## Database tables

Tables come from the migrations in `aethra-site/payload/src/migrations`, which run automatically on start (also with `cms:start`). After changing a collection or field, create a new migration: `npm run payload -- migrate:create naam` (inside `aethra-site/payload`) and commit it.
