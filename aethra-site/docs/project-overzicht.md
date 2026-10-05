> **Bijgewerkt op 5 oktober 2026:** Payload CMS en `/admin2` zijn vervangen door een eigen CMS op `/admin` (zie [cms.md](cms.md)). Delen van dit document die nog over Payload gaan, zijn achterhaald; de eisen in deel B zijn grotendeels gebouwd.

# Aethra: volledig projectoverzicht

Stand: 5 oktober 2026. Branch: `ccr-fe5b0832-fpo81k`. Taal van dit document: Nederlands (de site zelf is EN/NL/DE/FR).

---

## 1. Het project in het kort

**Aethra** is een startup van Pim in de prototypefase. Het idee: CubeSats (kleine satellieten) en AI helpen voertuigen om in gebieden met veel luchtvervuiling automatisch over te schakelen op een zuinige "eco-modus". De klanten zijn bedrijven en organisaties (B2B).

Dit project is de **website van Aethra**: een professionele, meertalige site waarmee Aethra gesprekken opent met gemeenten, wagenparkbeheerders, voertuigfabrikanten, mobiliteitsplatforms en investeerders. Daarnaast bevat het project een **beheeromgeving** waarmee Pim zelf teksten, pagina's en foto's aanpast en binnengekomen berichten leest.

"Aethra" is een werktitel. Er is nog geen merkcontrole gedaan (er bestaat een bedrijf AETHRA in dezelfde sector) en er is nog geen definitief logo.

## 2. Doelen

### Zakelijke doelen van de site
1. **Gesprekken starten**: elke pagina eindigt in één duidelijke actie, het contactformulier.
2. **Geloofwaardig zijn zonder te overdrijven**: eerlijk over de status (prototype), met bronnen bij elke statistiek.
3. **Vindbaar zijn**: in zoekmachines en in AI-antwoordmachines, in vier talen.
4. **Zelf beheerbaar**: Pim moet zonder programmeur teksten, pagina's en foto's kunnen wijzigen.
5. **Privacyvriendelijk en veilig**: geen cookies voor tracking, geen externe diensten, minimale gegevens.

### Doelgroepen
Gemeenten, wagenparkbeheerders, voertuigfabrikanten (OEM's), mobiliteitsplatforms en investeerders. Elke groep heeft een eigen landingspagina.

### Vaste spelregels (inhoud en recht)
- Geen beloftes over uitstootvermindering zonder testdata.
- Nooit het technische "hoe" onthullen (bescherming van het idee).
- Geen aanbod van aandelen of rendement (AFM-risico); de investeerderspagina zegt dat de site geen aanbod is.
- Geen externe lettertypes, analytics of embeds.
- Foto's: alleen echte of toegestane beelden; AI-beelden alleen als sfeer, nooit als het prototype.
- Teksten in NL/DE/FR zijn eerste versies en moeten door moedertaalsprekers worden nagekeken.

## 3. Wat er nu is opgeleverd

### Openbare site
- Pagina's: Home, Het probleem, Hoe het werkt, Toepassingen, Contact, Privacy.
- **Vijf doelgroeppagina's** (`/for/municipalities`, `fleets`, `manufacturers`, `platforms`, `investors`) met eigen kop, drie punten, twee veelgestelde vragen en een knop naar het formulier met de juiste rol voorgeselecteerd.
- **Verborgen contextpagina** ("eco-modus vandaag": welke producten bestaan al, met bronnen). Pas zichtbaar nadat iemand de bronnen controleert en `yes` invult.
- Vier talen met eigen URL (`/en/`, `/nl/`, `/de/`, `/fr/`), taalkeuze op browsertaal, onthouden via één functionele cookie.
- Eigen extra pagina's die via de CMS kunnen worden toegevoegd (met concepten, per taal).
- Merkgids, kleuren, lettertype (Exo 2, lokaal), motion-richtlijnen en logo-brief in `docs/`. Pitchdeck- en bannerscripts in `scripts/`.

### Contactformulier en opvolging
- Minimale velden, vertelt wanneer er gereageerd wordt en wat er met de gegevens gebeurt.
- Bescherming: ondertekend formulier-token, honeypot, limiet per IP.
- Bericht gaat naar de eigen inbox, optioneel per e-mail (SMTP) en naar de CMS-inbox. Bevestigingsmail aan de bezoeker (vaste tekst, in zijn taal).
- Automatisch verwijderen na de bewaartermijn (standaard 365 dagen).

### SEO en vindbaarheid
- Per pagina: title, description, canonical, hreflang, Open Graph, gestructureerde data (Organization, WebSite, breadcrumbs, FAQ).
- Gegenereerde `sitemap.xml`, `robots.txt` (AI-trainingscrawlers geblokkeerd tenzij `AI_TRAINING=allow`, zoek- en antwoordbots toegestaan), `llms.txt`, IndexNow.
- `npm run seo` controleert elke pagina in elke taal; baseline en vergelijking om regressies te zien.
- Auditrapporten in `aethra-audit/` (technisch, GEO, SXO, programmatic, actieplan).

### Statistieken
Eigen, anonieme statistieken: paginaweergaven, bronnen en campagnes (UTM), taal, conversie contactpagina naar bericht, berichten per rol. Geen cookies, geen IP-adressen; Do Not Track en Global Privacy Control worden gerespecteerd; crawlers tellen niet mee.

### Twee beheeromgevingen
1. **`/admin` (eigen paneel, blijft bestaan):** teksten per taal, foto's, privacytekst, berichten, statistieken, accountbeheer, wachtwoord en tweestapsverificatie (QR + herstelcodes).
2. **`/admin2` (Payload CMS, open source):** de uitgebreide, headless CMS (zie hoofdstuk 5). Als de CMS de bron is, toont `/admin` een melding dat de inhoud in de CMS staat.

## 4. Technologie

### Website (`aethra-site/`)
| Onderdeel | Keuze |
|---|---|
| Runtime | Node.js 20.9+ (22 LTS aanbevolen), **geen npm-pakketten** voor de site zelf |
| Server | Eigen HTTP-server (`server.js`), HTML wordt op de server gerenderd (`lib/views.js`) |
| Opslag | JSON-bestanden in `data/` (teksten, berichten, foto's, wachtwoord-hash, sleutel) |
| Talen | `lib/i18n.js` (UI-teksten en vertalingen), `lib/fields.js` (alle bewerkbare teksten met standaardwaarden) |
| Beveiliging | Scrypt-wachtwoord, ratelimits, sessies van 8 uur (HttpOnly, SameSite=Strict), CSRF-tokens, strikte CSP zonder inline scripts, output-escaping, upload-controle op bestandssignatuur en verwijdering van EXIF, veilige statische bestanden |
| 2FA | Eigen TOTP (`lib/totp.js`), geheim AES-256-GCM versleuteld, code eenmalig bruikbaar |
| Tests | 40 tests (`npm test`), SEO-audit, stresstest met worst-case data |
| Back-up | `npm run backup` (houdt de laatste 14) |

### CMS (`aethra-site/payload/`)
| Onderdeel | Keuze |
|---|---|
| CMS | Payload 3.90 (MIT-licentie), draait als Next.js-app met `basePath /admin2` |
| Database | SQLite via `@payloadcms/db-sqlite`; tabellen via migraties die bij het starten draaien |
| Editor | Lexical, beperkt tot wat de site veilig kan tonen (koppen, vet, cursief, lijsten, citaten, links) |
| Talen | Veldniveau per taal (en/nl/de/fr), de beheeromgeving zelf is ook in vier talen |
| Inloggen | Rollen (admin, editor, site), blokkade na 5 pogingen gedurende 15 minuten, tweestapsverificatie via `payload-totp`, API-sleutel voor het contactformulier |
| Koppeling | Onze server proxied `/admin2` naar de CMS en haalt inhoud op (elke 30 s en direct na elke opslag). Valt de CMS uit, dan toont de site de laatst bekende inhoud. |
| Berichten | Eerst in de eigen inbox, daarna gekopieerd naar de CMS-inbox |
| Ingeschakeld | Concepten en versies, preview-link naar de live pagina, dashboard per pagina gegroepeerd, GraphQL uit, upload max. 8 MB |

### Architectuur in één blik
```
Bezoeker ──> site (Node, poort 3000) ──> HTML in 4 talen
                │   ▲
   /admin ──────┤   └── haalt teksten/foto's/pagina's op (poll + direct bij opslaan)
   /admin2 ─────┴──> proxy ──> Payload CMS (poort 3001, SQLite)
Contactformulier ──> eigen inbox ──> (SMTP) + kopie in CMS-inbox
```

### Starten (Windows, Mac, Linux)
Alleen de site: `npm start`. Met CMS: `npm run cms:init -- --email=…`, `npm run cms:build`, `npm run cms:start` (terminal 1), `npm run cms:setup`, `npm run start:cms` (terminal 2). Zie `README.md` en `docs/cms.md`.

## 5. Waarom een headless CMS (en niet alleen het eigen paneel)

Het eigen paneel werkt, maar Pim wilde een bewezen, veilig en open-source systeem met een rijkere editor, versies, concepten en rollen, zonder betaalde functies. Payload voldoet aan de eis "echt open source" (MIT, geen betaalde laag voor de functies die we gebruiken). Directus is geprobeerd en geschrapt omdat daar functies achter betaalde plannen zitten.

Bekende beperkingen van de huidige keuze:
- SQLite kan niet meer dan ongeveer 127 kolommen per tabel in één keer lezen. Daarom is er één "global" per tekstgroep.
- Foto's die in de CMS worden gekozen vervangen die uit `/admin` zolang de CMS de bron is.
- Wijzigingen aan velden vragen een nieuwe migratie.
- Teksten in alle talen tegelijk naast elkaar bewerken kan nog niet.

## 6. Wat zou er in een custom CMS moeten komen

Eerst een eerlijk advies: **bouw alleen een eigen CMS als Payload aantoonbaar tekortschiet.** Een eigen CMS kost onderhoud, beveiligingswerk en tijd die niet naar het product gaat. Payload dekt het grootste deel hieronder al. De lijst is bedoeld als eisenpakket: bruikbaar om Payload te beoordelen, het eigen paneel uit te breiden, of een eigen CMS te specificeren.

Legenda: ✅ al aanwezig in Payload/huidige opzet, ◐ deels, ⬜ ontbreekt.

### 6.1 Inhoud beheren
| Eis | Prio | Status |
|---|---|---|
| Alle vaste teksten van de site per taal bewerken | Must | ✅ |
| Gegroepeerd per pagina, met uitleg per groep | Must | ✅ |
| Eigen pagina's aanmaken (titel, adres, intro, tekst, SEO-velden) | Must | ✅ |
| Concept → publiceren, automatisch bewaren, versiegeschiedenis en terugzetten | Must | ✅ |
| Foto's uploaden met verplichte omschrijving, automatisch EXIF verwijderen en verkleinen | Must | ◐ (omschrijving ja; EXIF-verwijdering en verkleinen gebeuren alleen in het eigen paneel) |
| Alle talen naast elkaar bewerken, met "vertaling ontbreekt"-indicator | Should | ⬜ |
| Vertaalworkflow: status per taal (concept, nagekeken door moedertaalspreker, gepubliceerd) | Should | ⬜ |
| Geplande publicatie (datum en tijd) | Could | ⬜ |
| Live voorbeeld van concepten (nu alleen link naar gepubliceerde pagina) | Should | ⬜ |
| Blok-gebaseerde pagina's (kopblok, citaat, feitenkaart met bron, CTA) in plaats van vrije tekst | Could | ⬜ |
| Feitenkaart met verplichte bron en datum (geen cijfer zonder bron) | Should | ⬜ |

### 6.2 Inbox en opvolging
| Eis | Prio | Status |
|---|---|---|
| Berichten lezen, zoeken, als afgehandeld markeren, interne notitie | Must | ✅ |
| Automatisch verwijderen na bewaartermijn, verwijderen op verzoek | Must | ✅ |
| Melding per e-mail bij nieuw bericht | Should | ◐ (SMTP in de site; niet gekoppeld aan CMS) |
| Status per lead (nieuw, in gesprek, afgesloten) en eigenaar | Could | ⬜ |
| Export (CSV) voor intern gebruik, met logging wie exporteert | Could | ⬜ |
| Antwoord vanuit de CMS met sjablonen per rol | Could | ⬜ |

### 6.3 Gebruikers, rollen, beveiliging
| Eis | Prio | Status |
|---|---|---|
| Aparte accounts per persoon, rollen (admin, editor) | Must | ✅ |
| Tweestapsverificatie, herstelcodes | Must | ✅ (herstelcodes: eigen paneel; in Payload te controleren) |
| Blokkade na foute pogingen, sessie met vervaltijd | Must | ✅ |
| Rol "alleen lezen" (bijvoorbeeld adviseur of jurist) | Should | ⬜ |
| Auditlog: wie wijzigde wat en wanneer, inclusief inloggen en exporteren | Should | ◐ (versies per tekst; geen centraal log) |
| Wachtwoord vergeten per e-mail | Should | ⬜ (vraagt SMTP) |
| Goedkeuring door tweede persoon voor gevoelige pagina's (investeerders, privacy) | Could | ⬜ |
| IP-beperking of toegang alleen via VPN voor `/admin2` | Could | ⬜ (via reverse proxy te regelen) |

### 6.4 SEO en vindbaarheid
| Eis | Prio | Status |
|---|---|---|
| Per pagina titel en beschrijving met lengtecontrole | Must | ◐ (velden ja, lengtewaarschuwing beperkt) |
| Sitemap, hreflang en canonical automatisch | Must | ✅ |
| Voorbeeld hoe de pagina in Google en bij delen eruit ziet | Should | ⬜ |
| Waarschuwing bij ontbrekende vertaling, kapotte links, dubbele titels | Should | ⬜ (kan met `npm run seo`) |
| Redirects beheren (oud adres naar nieuw) | Should | ⬜ |
| Gestructureerde data per paginatype bewerken | Could | ⬜ |

### 6.5 Inhoudelijke bewaking (specifiek voor Aethra)
Dit is waar een eigen CMS echt iets toevoegt dat standaardsystemen niet doen:
- **Woordenlijst van verboden claims** (bijvoorbeeld "reduceert uitstoot met", "gegarandeerd", "rendement"): de CMS waarschuwt of blokkeert opslaan en verwijst naar de regel.
- **Bronplicht**: een getal zonder bron en datum kan niet gepubliceerd worden.
- **Investeerderspagina**: verplichte disclaimer die niet verwijderd kan worden.
- **Controlelijst voor publicatie**: bronnen gecheckt, juridisch gelezen, moedertaalcontrole gedaan, foto-rechten bevestigd.
- **Geen technische details**: waarschuwing bij woorden uit een zelf te beheren lijst met gevoelige termen.

### 6.6 Techniek en beheer
| Eis | Prio | Status |
|---|---|---|
| Open-source licentie voor alle onderdelen | Must | ✅ (MIT) |
| Draait op één kleine server of container, zonder verplichte clouddiensten | Must | ✅ |
| Back-up en terugzetten van database en media met één commando | Must | ◐ (eigen paneel ja; CMS-database en media nog handmatig) |
| Migraties en versiebeheer van het datamodel | Must | ✅ |
| Updatebeleid en beveiligingsmeldingen voor de gebruikte pakketten | Must | ⬜ (proces, geen code) |
| Test-/stagingomgeving en geautomatiseerde tests voor de CMS | Should | ◐ (tests voor de site; CMS getest met scripts) |
| Gebruikersvriendelijke Nederlandse interface voor niet-technici | Should | ◐ (Payload heeft NL; eigen teksten zijn Engels) |
| Webhooks of API voor koppelingen (CRM, nieuwsbrief) | Could | ◐ (API aanwezig; geen koppelingen) |

### 6.7 Datamodel (kern)
- **Tekstgroep**: sleutel, label, per taal waarde, laatst gewijzigd door, versie.
- **Pagina**: titel, adres, intro, inhoud, SEO-titel, SEO-beschrijving, per taal, status (concept, gepubliceerd), voorkeur voor footerlink.
- **Foto**: bestand, omschrijving per taal, rechten (eigen foto, gelicentieerd, AI-sfeerbeeld), bron.
- **Feit**: waarde, omschrijving, bron-naam, bron-URL, datum gecontroleerd.
- **Bericht**: naam, e-mail, organisatie, rol, tekst, taal, bron (campagne), afgehandeld, notitie, ontvangen op.
- **Gebruiker**: e-mail, rol, 2FA-status, laatste login.
- **Logboek**: wie, wat, wanneer.

### 6.8 Aanbevolen vervolg
1. **Nu:** Payload gebruiken zoals het is en de ◐-punten met de grootste winst oppakken (alle talen naast elkaar, vertaalstatus, CMS-back-up, e-mailmelding).
2. **Daarna:** de inhoudelijke bewaking uit 6.5 als plugin of hook in Payload bouwen. Dat is klein, specifiek en levert de meeste waarde.
3. **Alleen als dat niet genoeg is:** een eigen CMS bouwen, met dit document als eisenpakket. Houd het op dezelfde stack (Node, SQLite) en hergebruik de bestaande beveiligingscode (inloggen, TOTP, CSRF, uploads).

## 7. Nog open (niet met code op te lossen)
- Merkcontrole "Aethra" (BOIP/EUIPO) en definitief logo.
- Echte foto's, bedrijfsgegevens en namen (nooit verzinnen), privacyverklaring laten controleren.
- Bronnen van de gebruikte statistieken en van de contextpagina controleren.
- Moedertaalcontrole van NL/DE/FR, juridische controle van claims (ACM) en investeerderscommunicatie (AFM).
- Domein, HTTPS en `SITE_URL` instellen, productie-omgeving (reverse proxy, `NODE_ENV=production`, `TRUST_PROXY=1`).
- Search Console en Bing Webmaster koppelen.
- Eventueel patent- en octrooi-onderzoek naar bestaand werk (bijvoorbeeld Leeds, 2017).
- Open-source licentiebestand voor de repo (naam rechthebbende nodig).

## 8. Mappenoverzicht
```
Pim-Site-test-/
  aethra-site/         de site, het eigen paneel en de CMS-koppeling
    server.js, lib/    server, weergave, beveiliging, opslag, CMS-koppeling
    public/            css, js, lettertypes, afbeeldingen
    payload/           Payload CMS (aparte Next.js-app)
    scripts/           back-up, SEO, IndexNow, CMS-setup, decks en banners
    test/              40 tests
    seo/               SEO-baseline
    docs/              dit overzicht
  docs/                merkgids, logo-brief, motion, CMS-handleiding
  aethra-audit/        SEO-, GEO- en technische auditrapporten
```
