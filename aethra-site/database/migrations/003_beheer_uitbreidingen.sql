-- migrate: foreign-keys-off
-- Uitbreidingen van het beheer: rol 'redacteur', meldingen, uitgaande mail, planning, prullenbak, voorbeeldlinks, reviews, compliance-regels, linkcontrole.

-- gebruikers: nieuwe rol en voorkeuren (de CHECK kan niet worden aangepast, dus de tabel wordt opnieuw opgebouwd)
CREATE TABLE gebruikers_nieuw (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	email TEXT NOT NULL UNIQUE COLLATE NOCASE,
	naam TEXT NOT NULL,
	rol TEXT NOT NULL CHECK (rol IN ('beheerder', 'editor', 'redacteur', 'lezer')),
	wachtwoord_hash TEXT NOT NULL,
	totp_geheim TEXT,
	totp_open_geheim TEXT,
	totp_open_sinds INTEGER,
	totp_laatste_stap INTEGER NOT NULL DEFAULT 0,
	actief INTEGER NOT NULL DEFAULT 1,
	aangemaakt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	laatste_login TEXT,
	meld_nieuw_bericht INTEGER NOT NULL DEFAULT 0,
	weekrapport INTEGER NOT NULL DEFAULT 0,
	token_hash TEXT,                                  -- uitnodiging of herstellink (alleen de hash)
	token_soort TEXT,
	token_tot INTEGER
);
INSERT INTO gebruikers_nieuw (id, email, naam, rol, wachtwoord_hash, totp_geheim, totp_open_geheim, totp_open_sinds, totp_laatste_stap, actief, aangemaakt, laatste_login)
	SELECT id, email, naam, rol, wachtwoord_hash, totp_geheim, totp_open_geheim, totp_open_sinds, totp_laatste_stap, actief, aangemaakt, laatste_login FROM gebruikers;
DROP TABLE gebruikers;
ALTER TABLE gebruikers_nieuw RENAME TO gebruikers;
CREATE INDEX idx_gebruikers_token ON gebruikers(token_hash);

-- Uitgaande mail buiten de berichtenwachtrij (uitnodigingen, herstel, meldingen, weekrapport). Zelfde uitstelschema.
CREATE TABLE mail_uit (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	aan TEXT NOT NULL,
	onderwerp TEXT NOT NULL,
	tekst TEXT NOT NULL,
	soort TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'wacht' CHECK (status IN ('wacht', 'verzonden', 'mislukt', 'gefaald')),
	pogingen INTEGER NOT NULL DEFAULT 0,
	volgende_poging INTEGER NOT NULL DEFAULT 0,
	fout TEXT,
	aangemaakt INTEGER NOT NULL
);
CREATE INDEX idx_mail_uit_status ON mail_uit(status, volgende_poging);

CREATE TABLE bekende_apparaten (
	gebruiker_id INTEGER NOT NULL REFERENCES gebruikers(id) ON DELETE CASCADE,
	ua_hash TEXT NOT NULL,
	eerste_keer TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	PRIMARY KEY (gebruiker_id, ua_hash)
);

CREATE TABLE antwoord_sjablonen (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	naam TEXT NOT NULL,
	teksten TEXT NOT NULL DEFAULT '{}'                -- JSON: { "nl": { "onderwerp": "...", "tekst": "..." }, ... }
);

-- Plannen van publicatie
CREATE TABLE planning (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	soort TEXT NOT NULL CHECK (soort IN ('pagina', 'tekst')),
	ref TEXT NOT NULL,                                -- pagina-id of tekstgroep
	actie TEXT NOT NULL CHECK (actie IN ('publiceren', 'depubliceren')),
	wanneer INTEGER NOT NULL,                         -- ms sinds epoch
	status TEXT NOT NULL DEFAULT 'wacht' CHECK (status IN ('wacht', 'klaar', 'mislukt', 'geannuleerd')),
	fout TEXT,
	door INTEGER REFERENCES gebruikers(id) ON DELETE SET NULL,
	aangemaakt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_planning_wanneer ON planning(status, wanneer);

-- Prullenbak en focuspunt
ALTER TABLE paginas ADD COLUMN verwijderd_op TEXT;
ALTER TABLE media ADD COLUMN verwijderd_op TEXT;
ALTER TABLE media ADD COLUMN focus_x INTEGER NOT NULL DEFAULT 50;
ALTER TABLE media ADD COLUMN focus_y INTEGER NOT NULL DEFAULT 50;

-- Voorbeeldlinks (geheime link naar een concept)
CREATE TABLE voorbeeld_links (
	token_hash TEXT PRIMARY KEY,
	object TEXT NOT NULL,
	soort TEXT NOT NULL,                              -- 'tekst', 'privacy' of 'pagina'
	taal TEXT NOT NULL,
	pad TEXT NOT NULL DEFAULT '/',
	payload TEXT NOT NULL,                            -- de staat van de editor op het moment van delen
	door INTEGER REFERENCES gebruikers(id) ON DELETE SET NULL,
	aangemaakt INTEGER NOT NULL,
	verloopt INTEGER NOT NULL
);

-- Reviewflow: een redacteur dient in, een editor of beheerder beoordeelt
CREATE TABLE reviews (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	soort TEXT NOT NULL,                              -- 'tekst', 'privacy' of 'pagina'
	ref TEXT NOT NULL,
	payload TEXT NOT NULL,                            -- wat er gepubliceerd zou worden
	samenvatting TEXT NOT NULL DEFAULT '',
	status TEXT NOT NULL DEFAULT 'wacht' CHECK (status IN ('wacht', 'goedgekeurd', 'afgewezen', 'ingetrokken')),
	ingediend_door INTEGER REFERENCES gebruikers(id) ON DELETE SET NULL,
	ingediend_op TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	beoordeeld_door INTEGER REFERENCES gebruikers(id) ON DELETE SET NULL,
	beoordeeld_op TEXT,
	opmerking TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_reviews_status ON reviews(status);

-- Extra redactionele regels (bovenop de vaste regels in de code; alleen aanvullen, nooit versoepelen)
CREATE TABLE compliance_regels (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	soort TEXT NOT NULL CHECK (soort IN ('verboden', 'waarschuwing')),
	term TEXT NOT NULL COLLATE NOCASE,
	toelichting TEXT NOT NULL DEFAULT '',
	aangemaakt_door INTEGER REFERENCES gebruikers(id) ON DELETE SET NULL,
	aangemaakt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	UNIQUE (soort, term)
);

-- Linkcontrole
CREATE TABLE link_resultaten (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	bron TEXT NOT NULL,                               -- de pagina waarop de link staat
	url TEXT NOT NULL,
	soort TEXT NOT NULL CHECK (soort IN ('intern', 'extern')),
	status INTEGER,                                   -- HTTP-status, null bij netwerkfout
	fout TEXT,
	gecontroleerd TEXT NOT NULL
);
CREATE INDEX idx_link_resultaten_status ON link_resultaten(status);
