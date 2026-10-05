-- Berichten krijgen de status 'in_behandeling'. SQLite kan een CHECK niet wijzigen, dus de tabel wordt opnieuw opgebouwd.
-- De wachtrij verwijst naar berichten met ON DELETE CASCADE: eerst veiligstellen, daarna terugzetten.
CREATE TEMP TABLE wachtrij_kopie AS SELECT * FROM uitgaande_wachtrij;

CREATE TABLE berichten_nieuw (
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
	status TEXT NOT NULL DEFAULT 'nieuw' CHECK (status IN ('nieuw', 'gelezen', 'in_behandeling', 'beantwoord', 'afgesloten')),
	notitie TEXT NOT NULL DEFAULT '',
	toegewezen_aan INTEGER REFERENCES gebruikers(id) ON DELETE SET NULL
);
INSERT INTO berichten_nieuw SELECT id, tijd, taal, naam, email, organisatie, rol, tekst, bron, campagne, status, notitie, toegewezen_aan FROM berichten;
DROP TABLE berichten;
ALTER TABLE berichten_nieuw RENAME TO berichten;
CREATE INDEX idx_berichten_tijd ON berichten(tijd DESC);
CREATE INDEX idx_berichten_email ON berichten(email);
CREATE INDEX idx_berichten_status ON berichten(status);

INSERT OR IGNORE INTO uitgaande_wachtrij SELECT * FROM wachtrij_kopie;
DROP TABLE wachtrij_kopie;
