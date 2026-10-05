# Aethra CMS: handleiding en techniek

Eigen CMS achter `/admin`: Node.js ≥ 22.13, geen npm-pakketten, SQLite via `node:sqlite`, Nederlandse interface. Dit document beschrijft wat erin zit, hoe je het gebruikt en beheert, en hoe het veilig blijft.

## 1. Snel starten
```
npm run user:create -- --email=jij@voorbeeld.nl --naam="Jouw naam"   # eenmalig: eerste beheerder
npm start                                                          # http://127.0.0.1:3000/admin
npm test                                                           # alle tests (geen browser nodig)
npm run test:e2e                                                   # browsertests met echte Chromium (Playwright)
```
Alles wat je kunt bewerken staat in `data/aethra.db` (SQLite) en `data/uploads` (foto’s). Verplaats met `DATA_DIR`.

## 2. Rollen
| Rol | Mag |
|---|---|
| Beheerder | alles: ook gebruikers, instellingen, redactionele regels, systeem, back-ups, auditlog |
| Editor | teksten, pagina’s, media, berichten, menu, redirects; publiceren, plannen, voorstellen beoordelen |
| Redacteur | schrijven en concepten bewaren; wat live zou gaan wordt een **voorstel** dat een editor of beheerder beoordeelt |
| Lezer | alleen kijken |

## 3. Functies per onderdeel
**Inhoud**
- *Pagina’s en teksten*: vaste teksten per taal (tabs, “alle talen naast elkaar” optioneel), live voorbeeld met schermbreedtes, concept elke 30 s automatisch bewaard, geschiedenis met vergelijking naast elkaar en terugzetten. Eigen pagina’s uit 7 sjablonen of als kopie van een bestaande pagina.
- *Publiceren* gaat altijd door één deur: opschonen → valideren → redactionele controle → schrijven in één transactie → audit → cache leeg. Harde fouten blokkeren (422), waarschuwingen vragen een reden (409, wordt gelogd), adviezen (toegankelijkheid, leesbaarheid) blokkeren nooit.
- *Te beoordelen / Mijn voorstellen*: reviewflow voor redacteuren, met verschillen per veld, goedkeuren (dezelfde controles) of afwijzen met opmerking; de indiener krijgt mail.
- *Planning*: publiceren of offline halen op een gekozen moment, uitgevoerd als de planner via dezelfde deur. Lukt het niet (intussen gewijzigd, geen rechten meer, controle faalt), dan staat het als mislukt in de lijst en gaat er een mail uit.
- *Vertalingen*: per onderdeel en taal de stand (standaardtekst, eerste versie, nagekeken, leeg) en wat **verouderd** is (Engels later gewijzigd dan de vertaling).
- *Prullenbak*: pagina’s en foto’s blijven 30 dagen terug te zetten (pagina’s als concept). Alleen een beheerder verwijdert definitief.
- *Voorbeeldlinks*: geheime link naar een concept voor iemand zonder account; alleen de hash wordt bewaard; verloopt (1–14 dagen), is in te trekken, nooit geïndexeerd of gecachet, zonder scripts.
- *Media*: upload met magic-byte-controle, EXIF eruit, omschrijving verplicht, WebP/AVIF (1x/2x) als `cwebp`/`avifenc` aanwezig zijn, focuspunt per foto (`object-position`), gebruik per foto, bulk naar prullenbak (alleen ongebruikte).
- *Menu*: hoofdmenu, knop en voettekst met volgorde (slepen of pijltjes), zichtbaarheid, tekst per taal en eigen links; zonder opgeslagen menu blijft de site zoals vroeger.

**Inbox**
- *Berichten*: statussen Niet gelezen / Gelezen / In behandeling / Beantwoord / Afgerond met tellers, toewijzing, filters, bulkacties, notitie, privacyverzoek (zoeken, exporteren, wissen per e-mailadres), CSV-export.
- *Antwoordsjablonen* per taal met `{naam}` en `{organisatie}`; in een bericht kies je een sjabloon en het mailprogramma opent ingevuld.
- *Mailwachtrij*: alles gaat eerst de database in, een worker verstuurt; uitstel 10/20/40/80 minuten, opgeven na 5 pogingen; twee wachtrijen (contactberichten en overige mails zoals uitnodigingen, herstel, meldingen, weekrapport).

**Site**
- *Zoekmachines*: alle gepubliceerde pagina’s in alle talen gerenderd en gecontroleerd (titel, omschrijving, h1, kopniveaus, alt-teksten, dubbele titels), robots.txt, sitemap, Google-voorbeeld in de SEO-velden van de pagina-editor.
- *Linkcontrole*: interne links tegen de site zelf, externe via HEAD/GET zonder redirects te volgen en **zonder lokale of private adressen** te benaderen; wekelijks automatisch of met de knop.
- *Redirects*: automatisch bij adreswijziging; CSV import/export, ketens inkorten, bulk verwijderen.
- *Statistieken*: anoniem, zonder cookies; vergelijking met de periode ervoor, berichten per bron/campagne, CSV-export.

**Beheer (beheerder)**
- *Gebruikers*: uitnodigen per e-mail (geen wachtwoord delen), herstellink maken, overal uitloggen, rol/actief wijzigen (nooit de laatste beheerder).
- *Instellingen*: mededelingsbalk (tekst gaat door de redactionele regels), onderhoudsmodus (503 met Retry-After; beheer blijft werken), bewaartermijn van berichten (30–1825 dagen).
- *Redactionele regels*: vaste regels zitten in de code en zijn niet te versoepelen; eigen termen (niet toegestaan of waarschuwing) kun je toevoegen.
- *Systeem*: gezondheid, schijfruimte, back-ups (dagelijks, laatste 14), download met wachtwoordbevestiging.
- *Auditlog*: filters, CSV-export; append-only (database-triggers).

**Overal**: zoeken met Ctrl/⌘+K, sneltoetsen (J/K/E/U/R/X, G+B, G+D, /, ?), “Mijn taken” op het dashboard, thema automatisch/licht/donker, uitleg per scherm, `/admin/help`, `/admin/privacy-overzicht`.

## 4. Veiligheid
- Wachtwoorden: scrypt (N=16384, r=8, p=1) met eigen salt; minstens 12 tekens. Inlog-lockout: 5 pogingen per 15 min, daarna 15 min / 1 u / 24 u; beheerders krijgen een mail bij een blokkade (max. 1 per uur per account).
- Tweestapsverificatie (TOTP, RFC 6238, getest met de officiële testvectoren) met AES-256-GCM-versleuteld geheim en gehashte herstelcodes. Een wachtwoordherstel vraagt bij 2FA ook een code.
- Sessies: 8 uur absoluut, 1 uur inactief, gebonden aan browser en /24-netwerk, id wordt na kritieke acties vernieuwd, cookie `HttpOnly; SameSite=Strict; Path=/admin` (+ `Secure` in productie). CSRF-token op elke POST. CSP met nonce, `X-Frame-Options: DENY`, `nosniff`.
- Een nieuw apparaat bij inloggen geeft een mail aan de gebruiker (niet bij de allereerste login).
- Herstel- en uitnodigingslinks: 256 bit, alleen hash opgeslagen, eenmalig; de link wordt gebouwd op `SITE_URL` (nooit op de `Host`-header).
- Bewerkingsvergrendeling per pagina via WebSocket **én** afgedwongen op de server (423).
- HTML-whitelist-sanitizer voor opgemaakte tekst; links alleen http(s)/mailto/relatief.
- Redactionele regels: geen beloftes over rendement/aandelen (blokkeert), twijfelachtige claims en technische details (waarschuwing), cijfers hebben een bron nodig, investeerdersmateriaal vermeldt “geen aanbod”.

## 5. Beheer en storing
- **Mail**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, optioneel `MAIL_TO` (teammelding bij elk bericht). Zonder `SMTP_HOST` blijft alles in de wachtrij staan en toont het beheer waarschuwingen.
- **`SITE_URL`** moet gezet zijn (links in mails, canonical, sitemap).
- **Back-up**: dagelijks automatisch in `data/backups` (alleen database). `npm run backup` kopieert de hele datamap. Kopieer ze ook buiten de server.
- **Terugzetten**: site stoppen, `node scripts/restore.js <naam of pad>`, site starten. Het script controleert het bestand (`integrity_check`) en bewaart de huidige database als `aethra.db.before-restore-…`.
- **Database onbereikbaar**: de publieke site blijft uit het geheugen draaien, het beheer antwoordt 503 en herstelt vanzelf.
- **Migraties**: `database/migrations/*.sql` draaien eenmalig bij het starten (001–004). Een migratie die een tabel opnieuw opbouwt begint met `-- migrate: foreign-keys-off`.

## 6. Tests
- `npm test`: 90+ tests (publieke site, CMS, beveiliging, wachtrijen, planning, back-up, reviewflow, enz.). Met `cwebp`/`avifenc` op het systeem draait ook de test met de échte beeldtools.
- `npm run test:e2e`: echte Chromium; test o.a. 2FA met een gescande QR-code (decodering met OpenCV), de vergrendeling met twee browsers, publiceren, Ctrl+K, thema, menu-editor. Werkt met `PLAYWRIGHT_PATH` en `CHROMIUM_PATH`.
- Nog altijd handmatig: een échte authenticator-app op een telefoon, en een échte mailserver.

## 7. Bekende grenzen
- Bulkacties bestaan voor berichten, redirects en foto’s, niet voor pagina’s.
- Afbeeldingen worden niet fysiek bijgesneden; het focuspunt bepaalt wat zichtbaar blijft bij bijsnijden door de browser.
- Het weekrapport en de linkcontrole gebruiken de servertijd.
- Vertalingen blijven eerste versies tot een moedertaalspreker ze heeft nagekeken. De naam “AETHRA” heeft een openstaand merkenvraagstuk.
