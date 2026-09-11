-- Expert hand labels for bootstrapping (deadline sprint): same table, new
-- source with top weight. Applied live via psql during the sprint; this file
-- keeps fresh installs consistent (db runs migrations at boot).
ALTER TABLE label_events DROP CONSTRAINT IF EXISTS label_events_source_check;
ALTER TABLE label_events ADD CONSTRAINT label_events_source_check
    CHECK (source IN ('gdelt', 'ai_worker', 'human'));
