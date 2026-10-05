# Het CMS van Aethra (`/admin`)

Een eigen CMS in puur Node.js (22.13 of nieuwer): geen npm-pakketten, geen framework. Opslag in SQLite (ingebouwd in Node). Alle schermen zijn Nederlands.

## Starten

```
cd aethra-site
npm run user:create -- --email=jij@voorbeeld.nl --naam="Jouw naam"     # eenmalig: eerste account (beheerder), vraagt om een wachtwoord
npm start                                                              # http://localhost:3000 en het CMS op /admin
```

Op Windows werkt dit in cmd of PowerShell. Weer een wachtwoord kwijt: `npm run user:password -- --email=…`. Telefoon en herstelcodes kwijt: `npm run user:reset-2fa -- --email=…`. Overzicht: `npm run user:list`.

Gegevens: `data/aethra.db` (database) en `data/uploads` (foto's). Oude JSON-gegevens van het vorige beheerpaneel worden bij de eerste start automatisch overgenomen. Back-up: `npm run backup`.

## Wat je kunt

| Onderdeel | Wat |
|---|---|
| **Pagina's en teksten** | Alle vaste teksten per pagina gegroepeerd. Alle vier de talen naast elkaar, met per veld de status (standaardtekst, eerste versie, nagekeken). Live voorbeeld rechts, per taal en breedte. |
| **Extra pagina's** | Kies een van zeven sjablonen (standaard, doelgroep, investeerder, landing, feiten, update, vrije secties), vul de bouwstenen in per taal. Concept → publiceren. Het adres verandert? Dan komt er automatisch een redirect. |
| **Media** | Upload (JPG/PNG/WebP), verplichte omschrijving, rechten (eigen, gelicentieerd, AI-sfeer). WebP/AVIF-varianten in 1x en 2x als `cwebp`/`avifenc` op de server staan. |
| **Berichten** | Zoeken en filteren, status (nieuw, gelezen, beantwoord, afgesloten), notitie, toewijzen, CSV-export, privacyverzoek (zoeken, exporteren, wissen). |
| **Mailwachtrij** | Meldingen per e-mail gaan via een wachtrij met herhaalpogingen. Zie hieronder. |
| **Versies** | Bij elke publicatie wordt de vorige staat bewaard. Vergelijken regel voor regel en terugzetten met één klik. |
| **Redirects, statistieken, gebruikers, auditlog** | Zie het menu. Gebruikers en auditlog zijn alleen voor beheerders. |

## Rollen

- **beheerder**: alles, ook gebruikers en het auditlog.
- **editor**: teksten, pagina's, media, berichten, redirects.
- **lezer**: alleen kijken.

## Inhoudelijke bewaking (voor elke publicatie)

- **Hard geblokkeerd** (422): woorden over aandelen, rendement of garanties (Nederlands, Engels, Duits, Frans), tenzij de zin zelf zegt dat iets *niet* wordt aangeboden. Een cijfer zonder bronnaam. Een investeerderspagina zonder “geen aanbod”-verklaring.
- **Waarschuwing** (409): twijfelachtige woorden (“bewezen”, “reduceert”), technische details, een pagina zonder zoekomschrijving. Publiceren kan dan toch, met een reden van minstens 10 tekens. Die reden komt in het auditlog (`publicatie.override`).

## Veiligheid

- Wachtwoorden: scrypt (N=16384, r=8, p=1), eigen zout per gebruiker. Inloggen: 5 pogingen per 15 minuten per IP + e-mailadres, daarna een blokkade van 15 minuten, 1 uur en 24 uur.
- Tweestapsverificatie (TOTP, RFC 6238) met QR-code, het geheim staat versleuteld (AES-256-GCM); 8 herstelcodes, gehasht en eenmalig bruikbaar.
- Sessies: willekeurig id (alleen de hash staat in de database), vastgemaakt aan browser en netwerk (/24), vervalt na 1 uur inactiviteit of 8 uur. Het id verandert na elke kritieke actie (wachtwoord, 2FA, gebruikersbeheer), waarvoor je je wachtwoord opnieuw invult.
- Cookie: `HttpOnly; SameSite=Strict; Path=/admin` (en `Secure` in productie). CSRF-token per sessie op elke POST. Controle van de herkomst.
- Elke beheerpagina: CSP met een nieuwe nonce per verzoek, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `no-store`.
- Opgemaakte tekst gaat door een strikte whitelist (alleen koppen, alinea’s, lijsten, citaat, vet, cursief en veilige links).
- Auditlog: de tabel is append-only (de database weigert UPDATE en het wissen van rijen jonger dan 180 dagen). Oudere rijen gaan maandelijks naar een gezipt archief in `data/archief`.

## Bewerken door meerdere mensen

- Wie een pagina opent, claimt een **bewerkingsslot** (WebSocket). Een tweede persoon ziet “Pim is deze pagina momenteel aan het bewerken” en kan alleen meekijken. Het slot vervalt na 5 minuten zonder hartslag of zodra het tabblad sluit. De server weigert opslaan ook (423).
- Daarnaast een versiecontrole bij opslaan: is de pagina ondertussen gewijzigd, dan volgt een 409 en een melding om te herladen.
- **Auto-save**: elke 30 seconden een concept in een aparte tabel (nooit zichtbaar op de site). Bij terugkomen kun je het concept terugzetten.

## Berichten en e-mail

Een bericht staat altijd eerst in de database; daarna pas wordt er gemaild. Stel `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` en `MAIL_TO` in om meldingen en bevestigingen te versturen. Mislukt een mail, dan probeert het systeem het opnieuw na 10, 20, 40 en 80 minuten en geeft na 5 pogingen op. Duurt een storing langer dan een uur, dan zie je een melding bovenaan het CMS. Op de pagina Mailwachtrij kun je een opgegeven mail opnieuw laten proberen.

## Betrouwbaarheid

- Schema via migraties (`database/migrations/*.sql`), die bij het starten één keer worden uitgevoerd.
- Opslaan is één transactie: lukt één veld niet, dan wordt de hele pagina teruggedraaid.
- Elke 24 uur controleert een taak of alle velden uit `lib/fields.js` in de database staan en meldt ontbrekende vertalingen op het dashboard.
- Is de database niet bereikbaar, dan blijft de site pagina’s uit het geheugen tonen en antwoordt het CMS met 503 tot de database weer werkt.
- Netjes afsluiten: bij SIGTERM of SIGINT stopt de server met nieuwe verbindingen en rondt hij lopend werk af (maximaal 10 seconden).
- Publieke pagina’s staan in een geheugencache die bij elke publicatie wordt leeggemaakt. Antwoorden worden gecomprimeerd met Brotli of gzip.

## Beperkingen en aandachtspunten

- De veldlabels van de vaste teksten staan nog in het Engels (de rest van het CMS is Nederlands).
- WebP en AVIF vragen om `cwebp` en `avifenc` op de server; zonder blijft het origineel in gebruik.
- Het CMS draait in hetzelfde proces als de site. Achter HTTPS (reverse proxy) instellen: `SITE_URL`, `NODE_ENV=production`, `TRUST_PROXY=1`.
- Tweestapsverificatie van het oude paneel is niet overgenomen: elke gebruiker zet die opnieuw aan op de accountpagina.
