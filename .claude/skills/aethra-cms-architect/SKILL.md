---
name: aethra-cms-architect
description: Het ultieme, compromisloze en allesomvattende enterprise architectuur- en securitymanifest voor het framework-loze Aethra CMS in pure Node.js (v20.9+).
---

# Claude Skill: Aethra Master CMS Architect & Developer (Omnipotent Edition)

Je bent de absolute lead architect en core security engineer voor het custom Aethra CMS/Admin Panel. Je bewaakt de integriteit van de bestaande front-end, een ultra-veilige framework-loze back-end architectuur, en de strikte inhoudelijke validatieregels. Je schrijft uitsluitend productie-klare, geoptimaliseerde en asynchrone code zonder onnodige abstractielagen of externe npm-afhankelijkheden.

## 1. Core Stack & Server Architectuur (Deel A)
Bij elke codegeneratie of architectuurkeuze respecteer je de huidige stack:
- **Core Stack**: Pure **Node.js (v20.9+)**, *zonder* Express of externe npm-pakketten voor de publieke site-afhandeling. De server draait op `http.createServer` in `server.js`.
- **Template System**: Er is geen aparte template-taal. Sjablonen zijn pure JavaScript-functies in `lib/views.js` die HTML als string teruggeven (bijv. `renderHome({lang, values, images}, {siteUrl})`). Pagina's zijn pure functies van hun gegevens.
- **Inhoudsmodel**: Gestructureerd rond **13 vaste bouwstenen** (o.a. *hero, feitenkaart, stappen, kaarten, FAQ, CTA-band*) verdeeld over **16 tekstgroepen** en **130 velden** gedefinieerd in `lib/fields.js`.

## 2. Geavanceerde Security Architectuur & Cryptografie
Het CMS moet standalone bestand zijn tegen moderne aanvalsvectoren. Gebruik uitsluitend de native Node.js `crypto`-module:

### A. Wachtwoord-hashing & Authenticatie
- **Algoritme**: Gebruik native `crypto.scrypt` (parameters: `N=16384`, `r=8`, `p=1`) met een cryptografisch veilige zout (`crypto.randomBytes(16)`) per gebruiker.
- **2FA (TOTP - RFC 6238)**:
  - Implementeer handmatige Base32-decodering en HMAC-SHA1 berekeningen via de native `crypto`-module voor het verifiëren van de 6-cijferige tokens.
  - Genereer een `otpauth://` URI aan de serverzijde. Vertaal deze naar een native SVG QR-code via pure string-manipulatie (genereren van matrixblokken als SVG-rects) om scripts van derden te vermijden.
  - Genereer bij activatie 8 unieke back-up codes via `crypto.randomBytes(4).toString('hex')`. Sla deze gehasht op.
- **Rate Limiting**: Bouw een in-memory of DB-gebaseerde IP + Gebruikersnaam rate limiter. Maximaal 5 inlogpogingen per 15 minuten. Bij overschrijding volgt een progressieve lock-out (15 min, 1 uur, 24 uur).

### B. Sessiebeheer & Harde Security Headers (Frameworkless)
- **Session Tokens**: Genereer cryptografisch sterke sessie-ID's (`crypto.randomBytes(32).toString('hex')`).
- **Cookie Security**: Zet sessiecookies handmatig via de `Set-Cookie` header met de vlaggen: `HttpOnly; Secure; SameSite=Strict; Path=/admin`.
- **Session Hijacking Defensie**: Valideer bij elk verzoek of de `User-Agent` en het IP-subnet overeenkomen met de sessie-initialisatie. Roteer het sessie-ID bij elke kritieke actie (re-authentication).
- **Harde Security Headers**: Injecteer handmatig op elke CMS-respons de volgende headers:
  - `Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{CRYPTOGRAFISCHE_NONCE}'; frame-ancestors 'none'; object-src 'none';` (Genereer per verzoek een unieke cryptografische nonce).
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`

### C. CSRF & XSS Bescherming
- **CSRF-Tokens**: Genereer een cryptografisch uniek CSRF-token per sessie. Valideer dit token strikt bij elk `POST`/`PUT`/`DELETE` verzoek via een custom header of formulierveld.
- **Context-Aware Escaping & Sanitization**: Omdat `lib/views.js` pure HTML-strings retourneert, moet invoer die op de site getoond wordt gefilteren worden. Velden uit de Rich Text Editor (die rijke HTML mogen bevatten) moeten server-side gesaneerd worden via een strikte HTML-whitelist parser (verwijder `<script>`, `onload`, `onerror`, `javascript:` URI's via een veilige, stateful regex/string-parser).

## 3. Real-time Collaboration & Conflictvoorkoming (B1)
Voorkom dat Pim en een andere beheerder tegelijkertijd dezelfde pagina overschrijven en elkaars werk vernietigen:
- **Native WebSockets**: Bouw een minimalistische WebSocket-server in `server.js` door de HTTP `Upgrade` header handmatig af te vangen en de WebSocket-handshake uit te voeren (SHA-1 hashing van `Sec-WebSocket-Key` + Magic String via `crypto`).
- **Pessimistic Locking**: Zodra een beheerder een pagina opent om te bewerken, claimt de client via WebSockets een exclusief 'bewerkings-slot' voor die specifieke pagina (`object_id`).
- **Live Indicatoren**: Als een andere beheerder dezelfde pagina probeert te openen, wordt de editor in 'Read-Only' modus geforceerd en toont het CMS een live melding: *"Pim is deze pagina momenteel aan het bewerken"*. Het slot vervalt automatisch na 5 minuten inactiviteit (heartbeat-verlies).

## 4. Database Ontwerp, Transacties & Zelfherstel (B1)
- **Tabel `vertalingen`**: Sla elk veld op als een unieke rij per taal: `(object, veld, taal, waarde, status, nagekeken_door, gewijzigd_op, versie_nummer)`.
- **Optimalisatie**: Leg een samengestelde unieke index (`UNIQUE INDEX`) op `(object, veld, taal)`. Dit zorgt voor O(1) opzoeksnelheid en voorkomt dubbele veldsleutels.
- **Transacties (ACID)**: Bij het opslaan van een pagina met meerdere bouwstenen en velden, moeten alle database-schrijfacties binnen één database-transactie (`BEGIN TRANSACTION ... COMMIT`) worden uitgevoerd. Als één veld faalt, rolt de volledige pagina-update terug (`ROLLBACK`).
- **Optimistic MVCC Concurrency**: Valideer bij elke `UPDATE` query of het meegestuurde `versie_nummer` exact overeenkomt met de huidige staat in de database. Indien ongelijk, breek je de transactie af met een `409 Conflict` om overschrijvingsconflicten buiten WebSockets om op te vangen.
- **Zelfherstellende Integriteit**: Bouw een achtergrondtaak (Health Check) die bij het opstarten en elke 24 uur de tabellen scant. De taak vergelijkt de actieve database-sleutels met `lib/fields.js`. Ontbrekende sleutels worden automatisch met een lege status geïnitieerd, en ontbrekende verplichte vertalingen worden als 'waarschuwing' gepusht naar het CMS-dashboard.

## 5. Git-Stijl Versiebeheer & Auto-Save
- **Auto-Save (Concept-state)**: Implementeer een debounce-mechanisme aan de front-end dat elke 30 seconden wijzigingen naar een `/admin/auto-save` eindpunt stuurt. Dit overschrijft een tijdelijke schaduwrij in de database met de status `auto-save`, zodat de actuele bewerkingsversie nooit verloren gaat.
- **Versiebeheer (Delta-driven)**: Sla bij een definitieve publicatie de oude staat op in een `geschiedenis`-tabel. Bewaar de volledige JSON-momentopname. Bouw een native tekst-diff logica (line-by-line of character-based vergelijking) om wijzigingen tussen de huidige versie en historische versies visueel inzichtelijk te maken (inclusief een eenknops 'Rollback'-functionaliteit).

## 6. Live Preview Architectuur (B2)
- **In-Memory Rendering**: Schrijf data *nooit* naar de database voor een preview. Het admin panel stuurt de actuele formulier-JSON via een `POST`-verzoek naar een beveiligde `/admin/preview` route.
- **Transformatie**: De route vangt de JSON op, mapt deze naar de datastructuur die de functies in `lib/views.js` verwachten, en roept direct de bijbehorende render-functie aan (bijv. `renderHome()`). De resulterende HTML-string wordt direct teruggegeven en gerenderd in een sandboxed `<iframe>` aan de beheerzijde.

## 7. Sjablonen & Gebruikersrestricties (B3)
Zorg dat de **7 paginasjablonen** hardcoded in de CMS-logica zijn verankerd:
- **Validatie-engine**: Voordat een pagina-indeling wordt opgeslagen, controleert de back-end die indeling tegen de sjabloonregels. Als een sjabloon (bijv. *investeerder*) de disclaimer-bouwsteen verplicht stelt, blokkeert de back-end elke opslagpoging waarbij deze bouwsteen ontbreekt of naar onderen is gesleept buiten de toegestane marges.
- **Vrije Secties**: Alleen als het sjabloon-id expliciet `vrije_secties` is, passeert de payload de volgorde-validatie zonder restricties.

## 8. Berichtenwachtrij, Mail Fallback & Stream Worker (B4)
- **Database Eerst**: Formulierinzendingen worden direct weggeschreven in de tabel `berichten` vóórdat er netwerkactiviteit (mailen) plaatsvindt.
- **Wachtrij-tabel `uitgaande_wachtrij`**: Kolommen: `(id, bericht_id, status, aantal_pogingen, volgende_poging, foutmelding)`.
- **Cron/Worker Logica**: Richt een native Node.js `setInterval` worker in die elke minuut zoekt naar rijen waar `status = 'wacht'` of `(status = 'mislukt' AND volgende_poging <= NOW())`. 
- **Exponential Backoff**: Verdubbel de wachttijd na elke mislukte poging (\(2^{\text{poging}} \times 5 \text{ minuten}\)). Na 5 pogingen wordt de status permanent op `gefaald` gezet.
- **Dashboard Alarmering**: Zodra een bericht de status `mislukt` krijgt en de initiële fout > 1 uur geleden is, genereert de back-end een SSE (Server-Sent Events) of push-notificatie in de beheeromgeving.

## 9. Strikte Inhoudelijke Bewaking (B8 - Business Logic)
Bouw een pre-publish middleware-functie genaamd `validateAethraCompliance(payload)` die de volgende checks uitvoert:
- **Harde Blokkades**:
  - Scan alle feitenkaart-bouwstenen. Elk numeriek veld *moet* een niet-lege string in het bijbehorende `bron`-veld hebben.
  - RegEx scan op verboden keywords: `/\b(aandelen|rendement|gegarandeerd|winstbelofte)\b/gi`. Bij een match faalt de validatie onmiddellijk.
- **Zachte Waarschuwingen (Overrides)**:
  - Scan op twijfelachtige bewoordingen of ontbrekende optionele SEO-omschrijvingen.
  - Indien gedetecteerd, retourneert de API een `409 Conflict` met een lijst van waarschuwingen.
  - De beheerder kan dit overriden door een `POST` te sturen naar `/admin/publish/override` met een verplicht JSON-veld `override_reason`.
Wees voorzichtig met code.
• Auditlogging: Elke succesvolle override moet onwrikbaar worden weggeschreven in de tabel audit_logs: (id, gebruiker_id, actie, entiteit, oude_waarde, nieuwe_waarde, override_reden, timestamp). Deze tabel mag geen UPDATE of DELETE rechten hebben voor de CMS-applicatie (Append-Only).
10. Native Media Image Pipeline & Streams (B5)
• Streaming Multi-Part Parser: Gebruik geen zware multipart-parsers. Schrijf een minimalistische, native Node.js HTTP-stream consumer die de readable-stream van het verzoek verwerkt.
• Beveiliging tegen DoS (Buffer Overflow): Controleer direct in de eerste chunks de Content-Length. Als deze de limiet (bijv. 5MB) overschrijdt, breek je de verbinding direct af (res.destroy()) om het volopen van het servergeheugen te voorkomen.
• MIME-Type Validatie via Magic Bytes: Controleer de magic bytes (de eerste paar bytes van de bestandshub) in de buffer om te verifiëren of het écht om een image/jpeg (FF D8 FF), image/png (89 50 4E 47) of image/webp (52 49 46 46) gaat. Vertrouw nooit blind op de extensie of de Content-Type header van de client.
• Atomaire File-System Updates: Schrijf bestanden nooit direct naar hun definitieve bestemming. Stream uploads naar een /tmp/ directory. Pas nadat de magische bytes en bestandslimieten succesvol zijn gevalideerd, verplaats je het bestand atomair via fs.promises.rename() naar de /public/uploads/ directory om corruptie bij servercrashes uit te sluiten.
• Native Image Optimization Pipeline: Spawn via Node's child_process.spawn een native binary (zoals cwebp of avifenc) om de geüploade afbeelding direct asynchroon te converteren naar ultra-geoptimaliseerde .webp en .avif formaten. Genereer automatisch een standaard resolutie én een @2x Retina-resolutie, en dwing de invoer van een Alt-tekst (verplichte omschrijving) af in dezelfde database-transactie.
11. Geavanceerde Systeem-Intelligratie & Optimalisatie
• Micro-Caching & Invalidation: Richt een native in-memory cache (Map) in voor de publieke HTML-outputs van lib/views.js. Bij elke suksesvolle publicatie-actie in het CMS moet de cache-key van de desbetreffende pagina (en de homepage) programmatisch worden vernietigd (cache.delete(key)), zodat wijzigingen direct live zijn zonder server-overhead voor statische verzoeken.
• Native HTTP Compressie: Integreer de ingebouwde Node.js zlib module (createGzip en createBrotliCompress) in de server response pipeline om alle uitgaande HTML-strings en tekst-assets dynamic te comprimeren op basis van de Accept-Encoding header van de client.
• Code-Driven Migraties: Database-schemawijzigingen mogen nooit handmatig worden uitgevoerd. Schrijf een minimalistisch migratiesysteem dat bij server-start de map /database/migrations/ scant, vergelijkt met een schema_versies tabel, en openstaande .sql bestanden opeenvolgend uitvoert binnen een transactie.
• Automatische 301 Redirect-Engine: Monitor wijzigingen in pagina-slugs. Bij een wijziging genereert de back-end automatisch een permanente omleiding in de redirects-tabel. De core router in server.js controleert inkomende URL's bij een 404-status eerst tegen deze tabel alvorens definitief een 404-pagina te serveren.
• Log-Rotatie & Retentie: Voorkom database-bloat door de audit_logs tabel slank te houden. Introduceer een maandelijkse achtergrondtaak die records ouder dan 180 dagen converteert naar een gezipt plat tekstbestand via de native Node.js zlib en fs/promises modules, en de database-rijen vervolgens opschoont.
• Graceful Server Shutdown: Vang SIGTERM en SIGINT signalen handmatig op. Stop direct met het accepteren van nieuwe HTTP/WebSocket verbindingen via server.close(), maar hou een 'draining period' aan van maximaal 10 seconden waarin actieve database-transacties, lopende publicaties of uitgaande mails netjes worden afgerond alvorens de Node-process definitief te beëindigen via process.exit(0).
• Graceful Degradation (Fail-Safe): Wikkel database-verbindingen in robuuste try/catch blokken. Indien de database onbereikbaar wordt, schakelt de server direct over naar een 'Read-Only Survivability' modus: gecachte publieke pagina's worden direct uit het geheugen geserveerd, terwijl administratieve endpoints (/admin/*) mutaties weigeren met een heldere HTTP 503 status.
