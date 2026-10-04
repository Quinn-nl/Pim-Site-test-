# Directus trial: open-source admin panel next to our own

`/admin` is still our own panel, untouched. `/admin2` is [Directus](https://directus.com) (open source, self-hosted). Both work at the same time so the two can be compared.

## Start it (local; same commands on Windows, macOS and Linux)
```
cd aethra-site
npm run directus:init -- --email=you@yourdomain.com   # once: secrets, install into directus/, database, first admin
npm run directus                                       # terminal 1: Directus on 127.0.0.1:8055 (leave it open)
npm run directus:setup                                 # terminal 2, once: content model + current texts + read-only token
npm run start:directus:live                            # terminal 2: the website, /admin2 opens Directus, texts come from Directus
```
Use `npm run start:directus` instead of `start:directus:live` if you only want `/admin2` available while the site keeps its own texts. Open `http://localhost:3000/admin2` and log in with the administrator printed by `directus:init` (also in `directus/.env`). On first login Directus asks about a licence key: choose "I'm using Core plan". `--site=https://your-domain` sets the public address (default `http://localhost:3000`); it must match the address you use because Directus builds its links from `PUBLIC_URL=<site>/admin2`. Use a real e-mail address: Directus rejects reserved ones such as `.example`.

With `start:directus:live` the site reads the texts from Directus every 15 seconds (`DIRECTUS_POLL_MS`). If Directus is down, the last copy keeps serving; if a text is empty in Directus, the default is used (optional texts may be empty).

## What was built
- `lib/directus-proxy.js`: `/admin2/*` is proxied to Directus (prefix removed, `X-Robots-Tag: noindex`, Directus keeps its own security headers). Only active when `DIRECTUS_URL` is set; the target is fixed (not an open proxy). `/admin2` and `/admin2/` redirect to `/admin2/admin/`.
- `scripts/directus-setup.cjs`: creates the collection `site_content` (one row per language) with one field for each editable text of `lib/fields.js` (about 160 fields in the same groups, labels and hints as our panel), seeds the four rows with the current texts, and creates a read-only "Site reader" role/user whose token is saved in `directus/.env`.
- `lib/directus-content.js` + `store.setRemote`: background sync of the texts into the site.
- Directus lives in `aethra-site/directus/` with its own `package.json`; the site itself stays dependency-free. `directus/node_modules`, `data` and `.env` are git-ignored.
- Tests: proxy behaviour (prefix, headers, our CSP unaffected on `/admin`), content overlay rules.

## Measured in this trial
- Directus 12.4.1 installs in under a minute (about 690 MB of dependencies, Node 22 required) and starts in about 10 seconds.
- Login through the proxy works; the editor shows the groups (Site, Hero, Problem, ...) as collapsible sections.
- Edit in Directus, site updates within one polling interval (verified: hero title and `sameAs`, other languages unaffected); Directus stopped: site keeps serving, `/admin2` shows a 502 message, recovery is automatic.
- The read-only token can read `site_content` only (users, collections and writes return 403).

## Not part of the trial (still in our panel)
Photo uploads, the contact inbox and CSV export, statistics, the privacy statement editor (the privacy text is a field in Directus too, but the inbox and stats are not), our two-step verification (Directus has its own per-user two-factor, enforceable per role).

## Honest comparison to decide on
| | Our panel | Directus |
|---|---|---|
| Installation | nothing | 690 MB, a database, one more process |
| Updates | none (no dependencies) | regular releases, migrations, monthly attention |
| Roles, drafts, revisions, comments | no | yes |
| Editing 4 languages x 160 fields | one language per page, tabs | one row per language, sections |
| Contact inbox, statistics, photos | built in | would need new collections and a connection |
| Licence | ours | BSL/MSCL: free below 5 million revenue and 50 employees (check the current terms before relying on it) |
| Failure impact on the public site | none | none (the site keeps its last copy) |
