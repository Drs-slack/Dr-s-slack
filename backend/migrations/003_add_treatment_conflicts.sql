-- Adds cross-department conflict-detection fields to treatments, without
-- dropping existing data. Safe to run repeatedly.
ALTER TABLE treatments ADD COLUMN IF NOT EXISTS conflict_severity TEXT;
ALTER TABLE treatments ADD COLUMN IF NOT EXISTS conflict_details JSONB;
ALTER TABLE treatments ADD COLUMN IF NOT EXISTS override_reason TEXT;
ALTER TABLE treatments ADD COLUMN IF NOT EXISTS is_override BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_treatments_conflict ON treatments(patient_id) WHERE conflict_severity IS NOT NULL;
