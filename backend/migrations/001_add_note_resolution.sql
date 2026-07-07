-- Adds emergency-resolution tracking to notes without dropping existing data.
-- Run this instead of re-applying schema.sql if you want to keep your seeded data.
ALTER TABLE notes ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS resolved_by INTEGER REFERENCES doctors(id);
CREATE INDEX IF NOT EXISTS idx_notes_active_emergency ON notes(alert_type) WHERE alert_type = 'emergency' AND resolved_at IS NULL;
