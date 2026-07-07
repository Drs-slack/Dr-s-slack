-- Adds the treatment timeline table without dropping existing data.
-- Run this instead of re-applying schema.sql if you want to keep your seeded data.
CREATE TABLE IF NOT EXISTS treatments (
  id                  SERIAL PRIMARY KEY,
  patient_id          INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  department_id       INTEGER NOT NULL REFERENCES departments(id),
  treatment_name      TEXT NOT NULL,
  assigned_doctor_id  INTEGER NOT NULL REFERENCES doctors(id),
  start_date          DATE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'ongoing',
  notes               TEXT,
  created_by          INTEGER NOT NULL REFERENCES doctors(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_treatments_patient ON treatments(patient_id);
