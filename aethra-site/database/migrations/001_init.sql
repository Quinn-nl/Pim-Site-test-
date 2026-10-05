-- Aethra CMS: initial schema. Table and column names are Dutch on purpose (they appear in the audit trail and exports).

CREATE TABLE gebruikers (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	email TEXT NOT NULL UNIQUE COLLATE NOCASE,
	naam TEXT NOT NULL,
	rol TEXT NOT NULL CHECK (rol IN ('beheerder', 'editor', 'lezer')),
	wachtwoord_hash TEXT NOT NULL,                    -- scrypt$N$r$p$salt$hash
	totp_geheim TEXT,                                 -- AES-256-GCM, sleutel uit secret.key
	totp_open_geheim TEXT,                            -- geheim tijdens instellen, nog niet bevestigd
	totp_open_sinds INTEGER,
	totp_laatste_stap INTEGER NOT NULL DEFAULT 0,
	actief INTEGER NOT NULL DEFAULT 1,
	aangemaakt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	laatste_login TEXT
);

CREATE TABLE herstelcodes (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	gebruiker_id INTEGER NOT NULL REFERENCES gebruikers(id) ON DELETE CASCADE,
	hash TEXT NOT NULL,
	salt TEXT NOT NULL,
	gebruikt INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_herstelcodes_gebruiker ON herstelcodes(gebruiker_id);

CREATE TABLE sessies (
	id_hash TEXT PRIMARY KEY,                         -- sha256 van het sessie-id; het id zelf staat alleen in de cookie
	gebruiker_id INTEGER NOT NULL REFERENCES gebruikers(id) ON DELETE CASCADE,
	csrf TEXT NOT NULL,
	ua_hash TEXT NOT NULL,
	ip_subnet TEXT NOT NULL,
	aangemaakt INTEGER NOT NULL,
	laatst_gezien INTEGER NOT NULL
);
CREATE INDEX idx_sessies_gebruiker ON sessies(gebruiker_id);

CREATE TABLE inlog_pogingen (
	sleutel TEXT PRIMARY KEY,                         -- ip + '|' + e-mailadres
	aantal INTEGER NOT NULL DEFAULT 0,
	venster_start INTEGER NOT NULL,
	niveau INTEGER NOT NULL DEFAULT 0,                -- 0 = geen blokkade gehad; 1 = 15 min, 2 = 1 uur, 3+ = 24 uur
	vergrendeld_tot INTEGER NOT NULL DEFAULT 0
);

-- Elk bewerkbaar veld is een eigen rij per taal.
CREATE TABLE vertalingen (
	object TEXT NOT NULL,                             -- bijvoorbeeld tekst:hero, pagina:12, media:3, privacy
	veld TEXT NOT NULL,
	taal TEXT NOT NULL,
	waarde TEXT NOT NULL DEFAULT '',
	status TEXT NOT NULL DEFAULT 'eerste_versie' CHECK (status IN ('leeg', 'eerste_versie', 'nagekeken')),
	nagekeken_door INTEGER REFERENCES gebruikers(id),
	gewijzigd_op TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	versie_nummer INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX idx_vertalingen_uniek ON vertalingen(object, veld, taal);
CREATE INDEX idx_vertalingen_object ON vertalingen(object);

-- Versie per object (een tekstgroep, een pagina): voor optimistic concurrency op paginaniveau.
CREATE TABLE objecten (
	object TEXT PRIMARY KEY,
	versie_nummer INTEGER NOT NULL DEFAULT 1,
	gewijzigd_op TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	gewijzigd_door INTEGER REFERENCES gebruikers(id)
);

-- Tijdelijke schaduwrij van wat iemand aan het typen is (auto-save). Nooit zichtbaar op de site.
CREATE TABLE concepten (
	object TEXT NOT NULL,
	gebruiker_id INTEGER NOT NULL REFERENCES gebruikers(id) ON DELETE CASCADE,
	status TEXT NOT NULL DEFAULT 'auto-save',
	data TEXT NOT NULL,
	basis_versie INTEGER NOT NULL DEFAULT 0,
	bijgewerkt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	PRIMARY KEY (object, gebruiker_id)
);

CREATE TABLE geschiedenis (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	object TEXT NOT NULL,
	versie_nummer INTEGER NOT NULL,                   -- de versie die hier is vastgelegd (de staat voor de wijziging)
	snapshot TEXT NOT NULL,                           -- volledige JSON-momentopname
	gebruiker_id INTEGER REFERENCES gebruikers(id),
	reden TEXT,
	tijdstip TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_geschiedenis_object ON geschiedenis(object, id DESC);

CREATE TABLE paginas (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	sjabloon TEXT NOT NULL,
	indeling TEXT NOT NULL DEFAULT '[]',              -- JSON: [{ "id": "s1", "type": "tekst" }, ...]
	status TEXT NOT NULL DEFAULT 'concept' CHECK (status IN ('concept', 'gepubliceerd')),
	in_footer INTEGER NOT NULL DEFAULT 0,
	indexeren INTEGER NOT NULL DEFAULT 1,
	volgorde INTEGER NOT NULL DEFAULT 0,
	aangemaakt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	gepubliceerd_op TEXT
);

CREATE TABLE berichten (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	tijd TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	taal TEXT NOT NULL,
	naam TEXT NOT NULL,
	email TEXT NOT NULL COLLATE NOCASE,
	organisatie TEXT NOT NULL DEFAULT '',
	rol TEXT NOT NULL,
	tekst TEXT NOT NULL,
	bron TEXT NOT NULL DEFAULT 'direct',
	campagne TEXT NOT NULL DEFAULT '',
	status TEXT NOT NULL DEFAULT 'nieuw' CHECK (status IN ('nieuw', 'gelezen', 'beantwoord', 'afgesloten')),
	notitie TEXT NOT NULL DEFAULT '',
	toegewezen_aan INTEGER REFERENCES gebruikers(id) ON DELETE SET NULL
);
CREATE INDEX idx_berichten_tijd ON berichten(tijd DESC);
CREATE INDEX idx_berichten_email ON berichten(email);

CREATE TABLE uitgaande_wachtrij (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	bericht_id INTEGER NOT NULL REFERENCES berichten(id) ON DELETE CASCADE,
	soort TEXT NOT NULL DEFAULT 'team' CHECK (soort IN ('team', 'bezoeker')),
	status TEXT NOT NULL DEFAULT 'wacht' CHECK (status IN ('wacht', 'verzonden', 'mislukt', 'gefaald')),
	aantal_pogingen INTEGER NOT NULL DEFAULT 0,
	volgende_poging INTEGER NOT NULL DEFAULT 0,       -- ms sinds epoch
	foutmelding TEXT,
	eerste_fout INTEGER,
	aangemaakt INTEGER NOT NULL
);
CREATE INDEX idx_wachtrij_status ON uitgaande_wachtrij(status, volgende_poging);

CREATE TABLE media (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	bestand TEXT NOT NULL UNIQUE,
	varianten TEXT NOT NULL DEFAULT '[]',             -- JSON: [{ "bestand": "...", "breedte": 1600, "type": "image/webp", "dichtheid": 1 }]
	breedte INTEGER NOT NULL,
	hoogte INTEGER NOT NULL,
	grootte INTEGER NOT NULL,
	mime TEXT NOT NULL,
	rechten TEXT NOT NULL DEFAULT 'eigen' CHECK (rechten IN ('eigen', 'gelicentieerd', 'ai_sfeer')),
	bron TEXT NOT NULL DEFAULT '',
	aangemaakt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	gebruiker_id INTEGER REFERENCES gebruikers(id) ON DELETE SET NULL
);

CREATE TABLE instellingen (
	sleutel TEXT PRIMARY KEY,
	waarde TEXT NOT NULL
);

CREATE TABLE redirects (
	van TEXT PRIMARY KEY,
	naar TEXT NOT NULL,
	aangemaakt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	hits INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE gezondheid (
	sleutel TEXT PRIMARY KEY,
	bericht TEXT NOT NULL,
	ernst TEXT NOT NULL DEFAULT 'waarschuwing',
	tijdstip TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Append-only: de applicatie mag nooit wijzigen. Verwijderen mag alleen voor rijen ouder dan 180 dagen (log-rotatie, nadat het archief is geschreven).
CREATE TABLE audit_logs (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	gebruiker_id INTEGER,
	actie TEXT NOT NULL,
	entiteit TEXT NOT NULL,
	oude_waarde TEXT,
	nieuwe_waarde TEXT,
	override_reden TEXT,
	timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_audit_tijd ON audit_logs(timestamp DESC);
CREATE TRIGGER audit_logs_geen_update BEFORE UPDATE ON audit_logs
BEGIN
	SELECT RAISE(ABORT, 'audit_logs is append-only');
END;
CREATE TRIGGER audit_logs_geen_delete BEFORE DELETE ON audit_logs
WHEN OLD.timestamp > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-180 days')
BEGIN
	SELECT RAISE(ABORT, 'audit_logs is append-only (rijen jonger dan 180 dagen blijven bewaard)');
END;
