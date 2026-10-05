-- Linkcontrole: een externe link telt pas als kapot na meerdere mislukte controles (met minstens een dag ertussen)
ALTER TABLE link_resultaten ADD COLUMN reeks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE link_resultaten ADD COLUMN eerste_fout TEXT;

-- Meldingen per persoon
ALTER TABLE gebruikers ADD COLUMN meld_toewijzing INTEGER NOT NULL DEFAULT 0;     -- mail als een bericht aan jou wordt toegewezen
ALTER TABLE gebruikers ADD COLUMN meld_werkdagen INTEGER NOT NULL DEFAULT 0;      -- meldingen alleen op werkdagen (anders wachten ze tot maandag 07:00)

-- Sessies: een leesbare omschrijving van het apparaat (de browser zelf wordt niet bewaard)
ALTER TABLE sessies ADD COLUMN apparaat TEXT NOT NULL DEFAULT '';

-- Passkeys (WebAuthn) als tweede stap
CREATE TABLE passkeys (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	gebruiker_id INTEGER NOT NULL REFERENCES gebruikers(id) ON DELETE CASCADE,
	credential_id TEXT NOT NULL UNIQUE,               -- base64url
	publieke_sleutel TEXT NOT NULL,                   -- JWK als JSON
	alg INTEGER NOT NULL,                             -- COSE-algoritme: -7 (ES256) of -257 (RS256)
	teller INTEGER NOT NULL DEFAULT 0,
	naam TEXT NOT NULL DEFAULT '',
	aangemaakt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	laatst_gebruikt TEXT
);
CREATE INDEX idx_passkeys_gebruiker ON passkeys(gebruiker_id);
