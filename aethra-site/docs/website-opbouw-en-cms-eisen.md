# Aethra website: hoe alles in elkaar zit, en de eisen voor een eigen CMS

Stand: 5 oktober 2026. Dit document bestaat uit twee delen:

- **Deel A** beschrijft hoe de website nu is opgebouwd (pagina's, sjablonen, inhoud, talen, berichten, techniek).
- **Deel B** is het eisenpakket voor een eigen CMS: pagina's bewerken, voorbeeld van de site, nieuwe pagina's maken met sjablonen, berichten, gebruikers en alles eromheen.

Alles in deel A is gecontroleerd tegen de code in `aethra-site/`.

---

# Deel A: de website

## A1. Uitgangspunten

- Eén kleine Node.js-server zonder npm-pakketten voor de site zelf. De server maakt de HTML en stuurt die compleet naar de bezoeker. Zonder JavaScript werkt alles.
- Vier talen (EN, NL, DE, FR), elk met eigen adressen.
- Alle teksten staan in één lijst met velden. Elk veld heeft een sleutel, label, type en standaardtekst. De beheeromgeving en de pagina's worden uit diezelfde lijst opgebouwd.
- Geen externe diensten: lettertypes, scripts en statistieken staan lokaal.
- Strenge beveiliging: geen inline scripts, strikte CSP, alles wordt geëscaped.

## A2. Mappen en bestanden

```
aethra-site/
  server.js               routing, formulier, beheerroutes, CMS-koppeling
  lib/
    config.js             poort, datamap, bewaartermijn, SITE_URL
    i18n.js               vaste interfaceteksten per taal + vertaalde standaardteksten + privacytekst
    fields.js             ALLE bewerkbare teksten (groepen, velden, standaardwaarden, fotovakken)
    audiences.js          de vijf doelgroeppagina's (teksten per taal, vragen en antwoorden)
    views.js              alle pagina-sjablonen (HTML) en layout, sitemap, rich-tekst naar HTML
    store.js              opslag: teksten, foto's, berichten, extra pagina's, CMS-overlay
    http.js, multipart.js verzoeken lezen, bestanden uploaden
    auth.js, totp.js      inloggen, sessies, CSRF, tweestapsverificatie
    ratelimit.js          limieten
    image.js              uploads controleren en opschonen
    mail.js               e-mail (SMTP)
    stats.js              anonieme statistieken
    admin-views.js        pagina's van het eigen beheerpaneel
    cms-proxy.js, payload-content.js, cms-messages.js   koppeling met Payload CMS (/admin2)
    worst-case.js         testmodus met extreme data
  public/
    css/design-tokens.css kleuren, afstanden, lettergroottes
    css/site.css          opmaak van de site
    css/admin.css         opmaak van /admin
    js/init.js, site.js   klein beetje gedrag (menu, onthullen bij scrollen, formulier)
    fonts/, img/, deck/   lettertypes (Exo 2, IBM Plex Sans), logo's, banners, pitchdeck
  data/                   alleen op de server: content.json, messages.json, stats.json, uploads/, secret.key
  payload/                het Payload CMS (aparte app)
  scripts/                back-up, SEO-controle, IndexNow, wachtwoord, 2FA-reset, CMS-setup, decks
  test/                   40 geautomatiseerde tests
```

## A3. Hoe een verzoek wordt afgehandeld

1. **Vaste bestanden en technische adressen:** `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/.well-known/security.txt`, `/healthz`, IndexNow-sleutelbestand, `/favicon.ico`.
2. **Taalkeuze:** `/` stuurt door naar `/en/`, `/nl/`, `/de/` of `/fr/` op basis van de taal van de browser (of de keuze die de bezoeker eerder maakte, in één functionele cookie).
3. **Pagina's per taal:** `/<taal>/<pagina>`. Een adres met slash aan het eind gaat met een 301 naar de versie zonder, zodat elke pagina één adres heeft.
4. **Volgorde waarin de server een pagina zoekt:**
   1. Een extra pagina uit de CMS met dat adres en die taal.
   2. `/contact`.
   3. Een doelgroeppagina `/for/<doelgroep>`.
   4. Een vaste pagina (Home, Problem, How it works, Applications, Privacy, eco-mode-today).
   5. Anders de 404-pagina (in de taal van de bezoeker, met noindex).
5. **Formulier:** `POST /<taal>/contact` voor het contactformulier.
6. **Beheer:** `/admin` (eigen paneel) en `/admin2` (Payload CMS, doorgestuurd via een proxy).
7. **Uploads en assets:** `/uploads/...` (foto's), `/css`, `/js`, `/img`, `/fonts`, `/deck`. Bestanden met versie in het adres worden een jaar gecached.
8. **Antwoord:** HTML wordt gecomprimeerd verstuurd, met strikte beveiligingsheaders en ETags.

## A4. Het sjabloon dat elke pagina omringt (layout)

Elke pagina gebruikt dezelfde schil (`layout()` in `lib/views.js`):

- **Head:** titel, beschrijving, robots, canonical, hreflang-alternatieven, Open Graph en Twitter-kaart (met deelafbeelding), favicon, voorgeladen lettertypes, JSON-LD, css en js met versie in de bestandsnaam.
- **Toegankelijkheid:** "sla navigatie over"-link, `aria-current` in menu's, semantische landmarks.
- **Header:** logo en naam, hoofdmenu (Het probleem, Hoe het werkt, Toepassingen), taalschakelaar, knop Contact, menuknop voor telefoons.
- **Inhoud:** de body van de pagina.
- **Vaste contactknop** op telefoons (niet op de contactpagina).
- **Footer:** merknaam en bedrijfsregel, footermenu (vaste pagina's, eventueel "eco-modus vandaag", extra pagina's met "toon in footer", contact, privacy), de vijf doelgroepen, auteursrecht en disclaimer.

## A5. De pagina's en hun secties

Een pagina is een rij **secties** (blokken). Dit zijn de bouwstenen die al bestaan:

| Sectie | Wat het toont |
|---|---|
| **Paginakop** (`pageHead`) | label, titel, intro, met achtergrond |
| **Hero** | label, titel, intro, twee knoppen, achtergrond, optioneel foto |
| **Feitenkaart** | groot cijfer, omschrijving, bronnaam met link |
| **Fotovak** | foto met omschrijving, afmetingen vooraf bekend (geen verspringen) |
| **Stappen** | genummerde stappen met pictogram, titel en tekst |
| **Kaarten** | kaarten met pictogram, titel, tekst en link |
| **Punten** | lijst met vinkjes |
| **Veelgestelde vragen** | uitklapbare vragen (met FAQ-markup voor zoekmachines) |
| **Statusband** | huidige fase met een tijdlijn (roadmap) |
| **Chips** | rij links naar andere doelgroepen |
| **Over ons-blok** | namen, rollen en korte bio (verschijnt alleen als het is ingevuld) |
| **CTA-band** | afsluitende oproep met knop naar contact |
| **Rich-tekst** | vrije tekst: koppen (h2, h3), alinea's, lijsten, citaten, vet, cursief, links |

### Welke pagina bestaat uit welke secties

| Pagina | Adres | Secties |
|---|---|---|
| Home | `/<taal>/` | Hero, probleem-teaser, drie stappen (samenvatting), toepassingen, statusband, over ons (optioneel), CTA-band |
| Het probleem | `/problem` | Paginakop, twee feitenkaarten, fotovak, link volgende pagina, CTA-band |
| Hoe het werkt | `/how-it-works` | Paginakop, drie stappen, donkere statussectie met tijdlijn en foto, CTA-band |
| Toepassingen | `/applications` | Paginakop, vier kaarten (elk met link naar een doelgroeppagina), link investeerders, CTA-band |
| Doelgroeppagina (5x) | `/for/municipalities`, `fleets`, `manufacturers`, `platforms`, `investors` | Paginakop, drie punten met knop naar het formulier (rol voorgeselecteerd), veelgestelde vragen, chips met andere doelgroepen, over ons (optioneel), CTA-band |
| Contact | `/contact` | Paginakop, formulier of bevestiging, geen vaste contactknop |
| Privacy | `/privacy` | Paginakop, tekst (alinea's en koppen) |
| Eco-modus vandaag | `/eco-mode-today` | Wat bestaat al (met bronnen), wat ontbreekt. Verborgen (404) tot iemand de bronnen controleert en dit aanzet. |
| Extra pagina | `/<adres>` | Paginakop, rich-tekst, CTA-band |
| 404 | n.v.t. | Melding in de taal van de bezoeker, noindex |

## A6. Inhoudsmodel

### Tekstvelden
`lib/fields.js` bevat 16 groepen met samen 130 velden, elk per taal. Een veld heeft: sleutel, label, type (kort, lang, link) en standaardtekst. Groepen:

| Groep | Gebruikt op |
|---|---|
| Site (naam, zoekbeschrijving, bedrijfsregel footer) | overal |
| Home-extra's (teaserregel, status-teaser, CTA-titel en -tekst) | Home, CTA-band |
| SEO-titels (per pagina) | tabbladtitel en zoekresultaten |
| Hero | Home |
| Probleem (titel, tekst, twee feiten met bron en link) | Het probleem |
| Stappen (drie keer titel en tekst) | Hoe het werkt, Home |
| Toepassingen (vier kaarten) | Toepassingen, Home |
| Status (titel, tekst, noot) | Hoe het werkt, Home |
| Contact (titel, tekst, antwoordbelofte) | Contact |
| Doelgroepen (5 groepen) | doelgroeppagina's |
| Over ons (optioneel) | Home en doelgroeppagina's |
| Eco-modus vandaag (met aan/uit-schakelaar) | contextpagina |
| Privacyverklaring | `/privacy` |

Een leeg verplicht veld valt terug op de standaardtekst. Optionele velden (bijvoorbeeld over ons, bedrijfsgegevens, LinkedIn) verbergen hun blok als ze leeg zijn.

### Foto's
Vier vakken: hero, probleem, status en deelafbeelding (1200 x 630). De bestandstype wordt gecontroleerd op de inhoud (niet alleen de naam), locatiegegevens (EXIF) worden verwijderd, afmetingen worden bewaard. Maximaal 5 MB. Zonder foto's blijven de secties netjes.

### Extra pagina's
Titel, adres, intro, tekst, SEO-titel, SEO-beschrijving, per taal, status (concept of gepubliceerd), "toon in footer". Een pagina bestaat alleen in de talen waarin hij is ingevuld. De sitemap en hreflang volgen die talen.

### Berichten
Elk bericht bevat: tijdstip, taal, naam, e-mail, organisatie, rol (Investor, Municipality, Fleet operator, Vehicle manufacturer, Mobility platform, Other), tekst, bron en campagne (UTM), gelezen-markering. Opslag in `data/messages.json`, daarna een kopie in de CMS-inbox. Er is een CSV-export in het eigen paneel. Berichten worden na de bewaartermijn (standaard 365 dagen) automatisch verwijderd.

## A7. Meertaligheid

- Interfaceteksten (menu's, knoppen, formulierlabels, foutmeldingen) staan in `lib/i18n.js`.
- Inhoudsteksten worden per taal bewaard; de standaardteksten in NL, DE en FR zijn eerste versies die een moedertaalspreker moet nakijken.
- Elke taal heeft eigen adressen, titels en beschrijvingen, en `hreflang` verbindt ze.
- Een nieuwe taal toevoegen betekent: interfaceteksten en vertalingen toevoegen en de taal in de lijst `LANGS` zetten.

## A8. Contactformulier

Velden: rol, naam*, e-mail*, organisatie, bericht*, toestemming*. Beveiliging: ondertekend formulier-token (verloopt), honeypot-veld, limiet per IP, controle van lengte en e-mailadres, bots krijgen stil een succesmelding. Na verzenden: opslaan, melding per e-mail (als SMTP is ingesteld), kopie naar de CMS-inbox, bevestiging naar de bezoeker (eenmaal per adres per dag, vaste tekst in zijn taal) en een anonieme telling voor de statistiek.

## A9. SEO en vindbaarheid (ingebouwd)

Per pagina: unieke titel en beschrijving, canonical, hreflang, Open Graph, JSON-LD (Organization, WebSite, breadcrumbs, FAQ, WebPage). Verder: `sitemap.xml` (met alternatieve talen), `robots.txt` (AI-trainingscrawlers geblokkeerd, zoek- en antwoordbots toegestaan), `llms.txt`, IndexNow, snelle laadtijd (lokale fonts, voorgeladen lettertype, afmetingen van foto's bekend, versies in bestandsnamen). `npm run seo` controleert alles per pagina en taal.

## A10. Statistieken

Anoniem, zonder cookies en zonder IP-adressen: weergaven per dag, populaire pagina's, bron en campagne, taal, aandeel van contactpagina naar bericht, berichten per rol. Do Not Track en Global Privacy Control worden gerespecteerd, crawlers tellen niet mee.

## A11. Ontwerpsysteem

Kleuren (blauw #1F5FD1, marine #0B1B33), lettertypes (Exo 2 voor koppen, IBM Plex Sans voor tekst), afstanden en componenten staan als variabelen in `design-tokens.css`. De opmaak (`site.css`) gebruikt alleen die variabelen. Merkgids en motion-richtlijnen staan in `docs/`.

## A12. Beveiliging

Scrypt-wachtwoord, limiet op inlogpogingen, sessies van 8 uur (HttpOnly, SameSite=Strict), CSRF-tokens, controle van de herkomst bij beheeracties, eigen TOTP-tweestapsverificatie met versleuteld geheim en herstelcodes, strikte CSP zonder inline scripts, escapen van alle uitvoer, uploads op bestandssignatuur gecontroleerd en onder willekeurige namen bewaard, veilige statische bestanden, HSTS en Secure-cookies in productie.

## A13. Beheer nu

- **`/admin`** (eigen paneel): teksten per taal, foto's, privacytekst, berichten (lezen, verwijderen, CSV), statistieken, account (wachtwoord, 2FA).
- **`/admin2`** (Payload CMS): teksten per pagina gegroepeerd, extra pagina's met concepten en versies, foto's, berichtenbox, rollen. De site haalt inhoud op uit de CMS en toont bij een storing de laatst bekende versie.

## A14. Hoe je het draait

Alleen de site: `npm start` (poort 3000). Productie: achter een HTTPS-reverse-proxy met `SITE_URL`, `NODE_ENV=production`, `TRUST_PROXY=1`. Back-up: `npm run backup`. Tests: `npm test`. SEO-controle: `npm run seo`.

---

# Deel B: eisen voor een eigen CMS

Doel: Pim (en later collega's) kunnen de volledige website zelf beheren, veilig, zonder programmeur, zonder betaalde functies, en zonder dat de site afhankelijk wordt van de CMS (de bezoeker moet altijd een pagina zien).

Prioriteit: **M** = moet, **S** = zou moeten, **C** = zou kunnen.

## B1. Uitgangspunten voor het ontwerp

1. **De site blijft draaien als de CMS stilvalt.** De site toont altijd de laatste goede inhoud.
2. **Eén bron van waarheid** voor inhoud; geen dubbel beheer in twee panelen.
3. **Wat de editor ziet is wat de bezoeker krijgt.** Voorbeeld met dezelfde sjablonen als de echte site.
4. **De regels van Aethra worden bewaakt door het systeem** (bronnen, claims, disclaimers), niet alleen door afspraken.
5. **Veilig als standaard**: geen verborgen achterdeurtjes, alles gelogd, alles toegankelijk met rollen.
6. **Open source en zonder verplichte cloud**: te draaien op één kleine server.

## B2. Pagina's bewerken

| # | Eis | Prio |
|---|---|---|
| 2.1 | Overzicht van alle pagina's (vast en extra) met status, taal, laatst gewijzigd, door wie | M |
| 2.2 | Elke bestaande pagina (Home, Het probleem, Hoe het werkt, Toepassingen, Contact, Privacy, doelgroeppagina's, eco-modus vandaag) bewerken per sectie, in een formulier dat de volgorde van de site volgt | M |
| 2.3 | Per veld: label, uitleg, lengtebegrenzing, teller, standaardtekst zichtbaar, "terugzetten naar standaard" | M |
| 2.4 | Alle talen naast elkaar bewerken (kolom per taal), met markering welke vertalingen ontbreken | S |
| 2.5 | Rich-tekst-editor beperkt tot wat de site kan tonen (h2, h3, alinea, lijst, citaat, vet, cursief, link) met controle van links | M |
| 2.6 | Concept en gepubliceerd, **autosave**, publiceren, depubliceren | M |
| 2.7 | Versiegeschiedenis per pagina met vergelijken en terugzetten | M |
| 2.8 | Geplande publicatie en depublicatie (datum, tijd) | C |
| 2.9 | Sectievolgorde en secties aan/uit zetten op pagina's waar dat past (bijvoorbeeld over ons, statusband) | S |
| 2.10 | Dubbel-bewerken voorkomen: wie een pagina opent, ziet dat een ander bezig is | S |
| 2.11 | Wijzigingen zijn direct zichtbaar op de site na publiceren (binnen seconden) | M |
| 2.12 | Opmerkingen bij een concept voor een reviewer (juridisch, taalcontrole) | C |

## B3. Voorbeeld van de site (preview)

| # | Eis | Prio |
|---|---|---|
| 3.1 | **Live voorbeeld naast het formulier**: de pagina zoals de bezoeker haar ziet, met dezelfde sjablonen, bijgewerkt terwijl je typt | M |
| 3.2 | Voorbeeld van **concepten** zonder ze te publiceren (afgeschermd, met tijdelijke link of alleen voor ingelogde mensen) | M |
| 3.3 | Schakelen tussen taal en schermbreedte (telefoon, tablet, bureaublad) | M |
| 3.4 | Voorbeeld van **hoe de pagina in Google staat** (titel, beschrijving, adres) en van de **deelkaart** (LinkedIn, WhatsApp) | S |
| 3.5 | Voorbeeld van de pagina met extreme data (lange teksten, lege optionele velden), zoals de bestaande testmodus | S |
| 3.6 | Delen van een voorbeeldlink met een externe reviewer, met vervaldatum | C |
| 3.7 | Voorbeeld toont ook menu, footer en taalschakelaar zoals ze op die pagina verschijnen | M |

## B4. Nieuwe pagina's maken, met sjablonen

Een **sjabloon** bepaalt welke secties een pagina heeft, in welke volgorde, en wat er in elke sectie ingevuld moet worden. Het ontwerp (opmaak) blijft in de code; de editor kiest alleen sjabloon en vult in.

### Sjablonen die minimaal nodig zijn
| Sjabloon | Secties | Gebruik |
|---|---|---|
| **Standaardpagina** | paginakop, rich-tekst, CTA-band | informatie, juridische pagina's |
| **Doelgroeppagina** | paginakop, drie punten met knop, veelgestelde vragen, andere doelgroepen, CTA-band | nieuwe doelgroep of branche |
| **Landingspagina** | hero, probleem-teaser, drie stappen, kaarten, statusband, CTA-band | campagne |
| **Feitenpagina** | paginakop, feitenkaarten met bron, foto, CTA-band | onderbouwing, onderzoek |
| **Nieuws- of updatepagina** | paginakop, datum, rich-tekst, foto's, CTA-band | voortgang, publicaties |
| **Contactpagina** | paginakop, formulier met rolkeuze en tekst, bevestiging | alternatieve contactingang (bijvoorbeeld per doelgroep) |
| **Eigen pagina met losse secties** | secties kiezen uit de bibliotheek en slepen | vrije opbouw |

### Sectiebibliotheek (herbruikbaar)
Paginakop, hero, feitenkaart, stappen, kaarten, punten, veelgestelde vragen, statusband met tijdlijn, chips, over ons-blok, CTA-band, fotovak, rich-tekst, citaat, tabel, knoppenrij, video-embed zonder externe diensten (lokaal bestand), downloadblok (pdf).

### Eisen
| # | Eis | Prio |
|---|---|---|
| 4.1 | Nieuwe pagina maken door een sjabloon te kiezen; het formulier toont alleen de velden van dat sjabloon | M |
| 4.2 | Pagina dupliceren (ook naar een andere taal als startpunt voor vertaling) | S |
| 4.3 | Adres (slug) wordt uit de titel gemaakt, is aanpasbaar, en wordt gecontroleerd op unieke en gereserveerde adressen | M |
| 4.4 | Adresverandering maakt automatisch een omleiding (301) van het oude adres | M |
| 4.5 | Pagina verwijderen alleen met bevestiging; verwijderde pagina's zijn terug te halen (prullenbak) | S |
| 4.6 | Pagina bestaat alleen in ingevulde talen; sitemap en hreflang volgen dat | M |
| 4.7 | Pagina-eigenschappen: naam in menu, plaats in menu of footer, volgorde, zichtbaar in zoekmachines (indexeren ja/nee) | M |
| 4.8 | Beheer van **menu's en footer**: items toevoegen, ordenen, per taal een eigen label | M |
| 4.9 | Sectievolgorde slepen (op sjablonen met losse secties) | S |
| 4.10 | Sjablonen zelf toevoegen door een ontwikkelaar (nieuw sjabloon = code + registratie), niet door de editor | M |
| 4.11 | Herbruikbare blokken: een tekst of CTA één keer maken en op meerdere pagina's gebruiken | C |
| 4.12 | Foto's in een pagina kiezen uit de mediabibliotheek, met verplichte omschrijving | M |

## B5. Berichten (inbox)

| # | Eis | Prio |
|---|---|---|
| 5.1 | Lijst van berichten met datum, naam, organisatie, rol, taal, bron/campagne, status | M |
| 5.2 | Zoeken en filteren (rol, taal, bron, status, periode) en sorteren | M |
| 5.3 | Detailweergave met volledig bericht en reply-knop (opent mailprogramma met onderwerp en citaat) | M |
| 5.4 | Status per bericht: nieuw, gelezen, beantwoord, afgesloten; interne notitie; toewijzen aan een persoon | S |
| 5.5 | Melding bij nieuw bericht: e-mail naar vast adres, optioneel een melding in de beheeromgeving | S |
| 5.6 | Teller van ongelezen berichten in de navigatie en op het dashboard | M |
| 5.7 | Verwijderen per bericht, meerdere tegelijk, en automatisch na de bewaartermijn; bewaartermijn instelbaar in de CMS | M |
| 5.8 | Export naar CSV, met log wie wanneer exporteerde | S |
| 5.9 | Privacyverzoeken: alle berichten van één e-mailadres vinden, exporteren en wissen | M |
| 5.10 | Spamfilter: markeren, in quarantaine, blokkeren van adressen; zichtbaar hoeveel er is tegengehouden | S |
| 5.11 | Antwoordsjablonen per rol en taal (gemeente, wagenpark, fabrikant, platform, investeerder) | C |
| 5.12 | Koppeling met een CRM of mailinglijst (optioneel, alleen met toestemming) | C |
| 5.13 | Berichten staan nooit alleen in de CMS: de site bewaart ze zelf ook, zodat er niets verloren gaat bij een storing | M |
| 5.14 | Beheer van **formulieren**: velden, rollen in de keuzelijst, bevestigingstekst en e-mailtekst per taal aanpasbaar | S |

## B6. Foto's en bestanden (mediabibliotheek)

| # | Eis | Prio |
|---|---|---|
| 6.1 | Upload van JPG, PNG, WebP (en pdf voor downloads), maximumgrootte instelbaar | M |
| 6.2 | Bestandscontrole op inhoud, verwijderen van EXIF/locatiegegevens, willekeurige bestandsnaam | M |
| 6.3 | Automatisch verkleinen en meerdere formaten (WebP) voor snelle pagina's; afmetingen bewaren | S |
| 6.4 | Verplichte omschrijving (alt-tekst) per taal; waarschuwing als die ontbreekt | M |
| 6.5 | **Rechten per afbeelding**: eigen foto, gelicentieerd, AI-sfeerbeeld; bron en licentie. AI-beelden krijgen automatisch de aanduiding "illustratie" | M |
| 6.6 | Zien waar een afbeelding wordt gebruikt; verwijderen alleen als ze nergens meer gebruikt wordt | S |
| 6.7 | Uitsnede kiezen (focuspunt) voor hero en deelafbeelding | S |
| 6.8 | Deelafbeelding per pagina | S |

## B7. SEO en vindbaarheid

| # | Eis | Prio |
|---|---|---|
| 7.1 | Per pagina en taal: SEO-titel, beschrijving, deelafbeelding, indexeren ja/nee, canonical | M |
| 7.2 | Lengtecontrole en teller met kleur (titel tot ongeveer 60 tekens, beschrijving ongeveer 150) | M |
| 7.3 | Waarschuwingen: ontbrekende titel of beschrijving, dubbele titels, ontbrekende vertaling, kapotte interne links, afbeelding zonder omschrijving | S |
| 7.4 | Omleidingen beheren (301), met overzicht en foutmeldingen voor lussen | M |
| 7.5 | Sitemap, hreflang en structured data (breadcrumbs, FAQ, organisatie) volgen automatisch uit de inhoud | M |
| 7.6 | Beheer van `robots.txt`-keuzes (AI-training toestaan of blokkeren) en IndexNow | S |
| 7.7 | Knop "SEO-controle nu uitvoeren" met overzicht van problemen (de huidige `npm run seo`) | C |
| 7.8 | Zicht op statistieken (weergaven, bronnen, contactpercentage) in de CMS | S |

## B8. Inhoudelijke bewaking (specifiek voor Aethra)

Dit is wat een eigen CMS voor Aethra toevoegt boven een standaardsysteem.

| # | Eis | Prio |
|---|---|---|
| 8.1 | **Verboden-claimslijst**: woorden en zinnen (bijvoorbeeld "reduceert uitstoot met", "gegarandeerd", "rendement", "winst") geven een waarschuwing of blokkeren publiceren, met uitleg welke regel geldt | M |
| 8.2 | **Bronplicht voor cijfers**: een feitenkaart kan alleen gepubliceerd worden met bronnaam, link en datum van controle | M |
| 8.3 | **Technische details bewaken**: lijst van termen die niet gepubliceerd mogen worden, met waarschuwing | S |
| 8.4 | **Investeerderspagina**: verplichte disclaimer, niet te verwijderen; waarschuwing bij woorden over aandelen, rendement, deelname | M |
| 8.5 | **Publicatiecontrolelijst** per pagina: bronnen gecontroleerd, juridisch gelezen, moedertaalcontrole gedaan, foto-rechten bevestigd; pas publiceren als alles is afgevinkt (of bewust overgeslagen met reden en naam) | S |
| 8.6 | Status per taal: "machinevertaling of eerste versie", "nagekeken door moedertaalspreker", met naam en datum | S |
| 8.7 | Verborgen pagina's (zoals eco-modus vandaag) hebben een expliciete schakelaar en tonen waarom ze verborgen zijn | M |
| 8.8 | Datum "laatst gecontroleerd" bij elke bron en een herinnering na bijvoorbeeld 6 maanden | C |

## B9. Gebruikers, rollen en beveiliging

| # | Eis | Prio |
|---|---|---|
| 9.1 | Eigen account per persoon; geen gedeelde wachtwoorden | M |
| 9.2 | Rollen: **beheerder** (alles), **editor** (inhoud en berichten), **alleen lezen** (bijvoorbeeld jurist, adviseur), **website** (alleen om berichten door te geven) | M |
| 9.3 | Rechten per onderdeel: wie mag publiceren, wie mag berichten zien, wie mag exporteren | S |
| 9.4 | Tweestapsverificatie met authenticatie-app en herstelcodes, verplicht voor beheerders | M |
| 9.5 | Sterk wachtwoordbeleid, wachtwoord vergeten via e-mail, geforceerd wijzigen na eerste login | M |
| 9.6 | Blokkade na foute pogingen, vertraging bij herhaling, melding bij verdachte inlog | M |
| 9.7 | Sessies met vervaltijd, uitloggen overal, overzicht van actieve sessies | S |
| 9.8 | **Auditlog**: wie deed wat en wanneer (inloggen, wijzigen, publiceren, verwijderen, exporteren), niet aanpasbaar door editors | M |
| 9.9 | Alle formulieren beschermd tegen CSRF; herkomstcontrole; strikte CSP; geen scripts van derden | M |
| 9.10 | Toegang tot de CMS te beperken tot bepaalde netwerken of via VPN (instelbaar) | C |
| 9.11 | Gevoelige velden (API-sleutels, wachtwoorden) nooit zichtbaar in de interface of de logs | M |
| 9.12 | Goedkeuring door een tweede persoon voor gevoelige pagina's (investeerders, privacy) | C |

## B10. Instellingen en beheer

| # | Eis | Prio |
|---|---|---|
| 10.1 | Siteinstellingen: naam, bedrijfsregel, contactadres, standaard-SEO, sociale profielen, deelafbeelding | M |
| 10.2 | Bedrijfsgegevens (KvK, adres) die alleen op de site verschijnen als ze zijn ingevuld | M |
| 10.3 | Privacyverklaring met versies en datum; wijzigingen worden bewaard | M |
| 10.4 | E-mailinstellingen (SMTP), testmail versturen, bevestigingsmail aan/uit en tekst per taal | S |
| 10.5 | Bewaartermijn berichten en statistieken | M |
| 10.6 | Talen aan- of uitzetten; standaardtaal | S |
| 10.7 | Onderhoudsmodus (korte pagina in plaats van de site) | C |
| 10.8 | Dashboard: onbeantwoorde berichten, laatste wijzigingen, pagina's met waarschuwingen, ontbrekende vertalingen, verlopen bronnen | S |

## B11. Techniek en kwaliteit

| # | Eis | Prio |
|---|---|---|
| 11.1 | Open-source licentie voor alle onderdelen, geen betaalde functies | M |
| 11.2 | Draait op één server of container; geen verplichte clouddiensten; start met één commando | M |
| 11.3 | Dezelfde sjablonen voor site en voorbeeld, zodat die nooit uit elkaar lopen | M |
| 11.4 | Opslag eenvoudig te back-uppen (database en media), met één commando terugzetten; geautomatiseerde dagelijkse back-up | M |
| 11.5 | Versiebeheer van het datamodel (migraties) | M |
| 11.6 | De site haalt inhoud op via een eenvoudige, alleen-lezen interface en bewaart een kopie; bij storing blijft de site draaien | M |
| 11.7 | Geautomatiseerde tests voor rechten, publiceren, voorbeeld, berichten en de verboden-claimscontrole | M |
| 11.8 | Prestaties: de beheeromgeving is bruikbaar op een laptop en telefoon; de site blijft zonder JavaScript volledig werken | M |
| 11.9 | Toegankelijkheid van de CMS zelf (toetsenbord, schermlezer, contrast) | S |
| 11.10 | Interface in het Nederlands en Engels, duidelijke taal voor niet-technische gebruikers | S |
| 11.11 | Updatebeleid en beveiligingsmeldingen voor gebruikte pakketten | M |
| 11.12 | Documentatie voor beheerders (handleiding met screenshots) en voor ontwikkelaars (nieuw sjabloon of sectie toevoegen) | M |
| 11.13 | Een API (alleen-lezen publiek voor gepubliceerde inhoud, beveiligd voor schrijven) voor eventuele latere koppelingen | S |

## B12. Datamodel (kern)

| Object | Velden |
|---|---|
| **Pagina** | id, sjabloon, status per taal, adres per taal, titel, intro, secties (lijst), SEO-velden, indexeren, menu-plaats, volgorde, gepubliceerd op, geplande datum, laatst gewijzigd door |
| **Sectie** | type (uit de bibliotheek), volgorde, velden per type, per taal |
| **Sjabloon** | naam, toegestane secties, verplichte secties, standaardinhoud |
| **Feit** | waarde, omschrijving, bronnaam, bron-URL, datum gecontroleerd, per taal |
| **Menu-item** | positie (hoofdmenu, footer), pagina of link, label per taal, volgorde |
| **Foto/bestand** | bestand, afmetingen, omschrijving per taal, rechtensoort, bron, licentie, gebruikt op |
| **Bericht** | tijdstip, taal, naam, e-mail, organisatie, rol, tekst, bron, campagne, status, notitie, toegewezen aan |
| **Omleiding** | van, naar, aangemaakt |
| **Gebruiker** | e-mail, naam, rol, 2FA aan, laatste login |
| **Logboek** | wie, wat, object, wanneer |
| **Instelling** | sleutel, waarde (per taal indien nodig) |
| **Versie** | object, inhoud, wie, wanneer, opmerking |
| **Regel (bewaking)** | type (verboden term, bronplicht, disclaimer), waarde, uitleg, ernst (waarschuwen of blokkeren) |

## B13. Workflow in de praktijk

1. Editor kiest **Nieuwe pagina** en een sjabloon, vult in per taal, ziet rechts het **live voorbeeld**.
2. Het systeem toont waarschuwingen (claims, ontbrekende bron, ontbrekende omschrijving, SEO).
3. De editor slaat op als concept; een reviewer bekijkt het voorbeeld en vinkt de controlelijst af.
4. Publiceren: de pagina verschijnt binnen seconden op de site, in sitemap en hreflang; de wijziging staat in het logboek.
5. Een bezoeker stuurt een bericht: het staat in de inbox, een e-mailmelding volgt, de teller springt op; Pim zet de status op beantwoord.
6. Na de bewaartermijn verdwijnt het bericht automatisch.

## B14. Voorgestelde fasering

| Fase | Inhoud |
|---|---|
| **1. Fundament** | gebruikers, rollen, 2FA, auditlog, back-up, instellingen, mediabibliotheek met rechten en omschrijving |
| **2. Bestaande pagina's** | alle huidige pagina's en teksten bewerken per sectie, concept en publiceren, versies, direct zichtbaar op de site |
| **3. Voorbeeld** | live voorbeeld met dezelfde sjablonen, taal en schermbreedte, voorbeeld van Google en deelkaart |
| **4. Inbox** | berichten met zoeken, status, notities, melding, export, privacyverzoeken, bewaartermijn |
| **5. Sjablonen en nieuwe pagina's** | sjabloonbibliotheek, nieuwe pagina's, menu- en footerbeheer, omleidingen, duplicatie |
| **6. Bewaking** | verboden claims, bronplicht, disclaimer, publicatiecontrolelijst, status per taal |
| **7. Afwerking** | dashboard, geplande publicatie, herbruikbare blokken, antwoordsjablonen, toegang beperken, goedkeuring door tweede persoon |

## B15. Wat al bestaat en hergebruikt kan worden

- Beveiliging: inloggen, sessies, CSRF, herkomstcontrole, TOTP met herstelcodes, limieten (`lib/auth.js`, `lib/totp.js`, `lib/ratelimit.js`).
- Uploads: controle, EXIF-verwijdering, afmetingen (`lib/image.js`, `lib/multipart.js`).
- Sjablonen en secties: `lib/views.js` (de bibliotheek in A5 is daar al grotendeels te vinden).
- Berichten: opslag, bewaartermijn, CSV, gelezen-markering, e-mail en bevestigingsmail (`lib/store.js`, `lib/mail.js`).
- Statistieken en SEO-controle (`lib/stats.js`, `scripts/seo-audit.cjs`).
- Meertalige tekstlijst met standaardwaarden (`lib/fields.js`, `lib/i18n.js`).
- De koppeling waarbij de site inhoud ophaalt en een kopie bewaart (`lib/payload-content.js`), die ook met een eigen CMS bruikbaar is.

## B16. Open vragen voor Pim

1. Hoeveel mensen gaan de CMS gebruiken, en met welke rollen?
2. Moeten er sjablonen komen buiten de zeven in B4, bijvoorbeeld voor nieuws of vacatures?
3. Welke talen moeten er naast EN, NL, DE en FR bij?
4. Is een goedkeuringsstap door een tweede persoon (bijvoorbeeld juridisch) verplicht voor sommige pagina's?
5. Moeten berichten naar een CRM of mailinglijst, en zo ja, met welke toestemming?
6. Waar komt de site te draaien (eigen server, hosting), en wie doet de back-ups?
7. Welke woorden en zinnen horen op de verboden-claimslijst en de lijst met gevoelige technische termen?
