-- Planning: wat er gepubliceerd moet worden (de staat van de editor) en de reden bij een waarschuwing.
ALTER TABLE planning ADD COLUMN payload TEXT;
ALTER TABLE planning ADD COLUMN reden TEXT;
ALTER TABLE planning ADD COLUMN uitgevoerd_op TEXT;

-- Vertaaloverzicht: wanneer is een vertaling nagekeken (los van wanneer ze is geschreven)
ALTER TABLE vertalingen ADD COLUMN nagekeken_op TEXT;
