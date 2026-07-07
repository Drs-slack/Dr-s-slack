-- Dr's Slack — MVP schema
-- Idempotent: safe to re-run.

DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS notes CASCADE;
DROP TABLE IF EXISTS treatments CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS allergies CASCADE;
DROP TABLE IF EXISTS patient_departments CASCADE;
DROP TABLE IF EXISTS patients CASCADE;
DROP TABLE IF EXISTS doctors CASCADE;
DROP TABLE IF EXISTS departments CASCADE;

CREATE TABLE departments (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  icon_key     TEXT NOT NULL DEFAULT 'clinical_notes'  -- material symbol name for UI
);

CREATE TABLE doctors (
  id             SERIAL PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  full_name      TEXT NOT NULL,
  title          TEXT NOT NULL DEFAULT 'Dr.',
  department_id  INTEGER REFERENCES departments(id),  -- null for admins
  role           TEXT NOT NULL DEFAULT 'doctor',      -- 'doctor' | 'admin'
  avatar_url     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE patients (
  id            SERIAL PRIMARY KEY,
  external_id   TEXT NOT NULL UNIQUE,     -- PT-2024-00158
  full_name     TEXT NOT NULL,
  age           INTEGER NOT NULL,
  gender        TEXT NOT NULL,
  blood_group   TEXT,
  admitted_on   DATE NOT NULL,
  risk_level    TEXT NOT NULL DEFAULT 'low',  -- low | medium | high
  status        TEXT NOT NULL DEFAULT 'active',
  avatar_url    TEXT,
  diagnoses     JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{code, label}]
  vitals        JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {bp, hr, ...}
  labs          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{name, value, unit, trend}]
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Which departments are assigned to which patient. Auth checks this.
CREATE TABLE patient_departments (
  patient_id     INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  department_id  INTEGER NOT NULL REFERENCES departments(id),
  assigned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (patient_id, department_id)
);

CREATE TABLE allergies (
  id            SERIAL PRIMARY KEY,
  patient_id    INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  substance     TEXT NOT NULL,          -- e.g. 'Penicillin'
  reaction      TEXT,                   -- e.g. 'Anaphylaxis, hives'
  severity      TEXT NOT NULL DEFAULT 'high',  -- low | medium | high | critical
  recorded_by   INTEGER NOT NULL REFERENCES doctors(id),
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_allergies_patient ON allergies(patient_id);

CREATE TABLE orders (
  id                SERIAL PRIMARY KEY,
  patient_id        INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  medication        TEXT NOT NULL,       -- e.g. 'Amoxicillin'
  dosage            TEXT NOT NULL,       -- e.g. '500mg BD'
  reason            TEXT,
  prescribed_by     INTEGER NOT NULL REFERENCES doctors(id),
  department_id     INTEGER NOT NULL REFERENCES departments(id),
  status            TEXT NOT NULL DEFAULT 'active',   -- active | cancelled | overridden
  ai_check_result   JSONB,               -- {conflicts:[], severity, alternatives:[]}
  override_reason   TEXT,                -- present if doctor overrode a flag
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_orders_patient ON orders(patient_id);

-- Treatment timeline: ongoing/past treatments across every department on the care team.
CREATE TABLE treatments (
  id                  SERIAL PRIMARY KEY,
  patient_id          INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  department_id       INTEGER NOT NULL REFERENCES departments(id),
  treatment_name      TEXT NOT NULL,        -- e.g. 'Beta Blocker Therapy'
  assigned_doctor_id  INTEGER NOT NULL REFERENCES doctors(id),
  start_date          DATE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'ongoing',  -- ongoing | completed | paused
  notes               TEXT,
  created_by          INTEGER NOT NULL REFERENCES doctors(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Cross-department conflict detection (see check-treatment-conflict.js)
  conflict_severity   TEXT,               -- null | low | medium | high | critical
  conflict_details    JSONB,              -- [{type, severity, message, source}, ...]
  override_reason     TEXT,               -- doctor's mandatory note when overriding a flagged conflict
  is_override         BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX idx_treatments_patient ON treatments(patient_id);
CREATE INDEX idx_treatments_conflict ON treatments(patient_id) WHERE conflict_severity IS NOT NULL;

-- Cross-department discussion timeline
CREATE TABLE notes (
  id             SERIAL PRIMARY KEY,
  patient_id     INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  author_id      INTEGER NOT NULL REFERENCES doctors(id),
  department_id  INTEGER NOT NULL REFERENCES departments(id),
  kind           TEXT NOT NULL DEFAULT 'note',   -- note | recommendation | concern | update
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  status         TEXT,                   -- e.g. 'Pending Review', 'Concern', 'Update', 'Note'
  alert_type     TEXT,                   -- quick-alert tag: emergency | critical | urgent | stable | followup | observation
  reply_count    INTEGER NOT NULL DEFAULT 0,
  like_count     INTEGER NOT NULL DEFAULT 0,
  resolved_at    TIMESTAMPTZ,            -- set when an emergency/alert is manually resolved
  resolved_by    INTEGER REFERENCES doctors(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notes_patient ON notes(patient_id);
CREATE INDEX idx_notes_alert_type ON notes(alert_type) WHERE alert_type IS NOT NULL;
CREATE INDEX idx_notes_active_emergency ON notes(alert_type) WHERE alert_type = 'emergency' AND resolved_at IS NULL;

CREATE TABLE audit_log (
  id           SERIAL PRIMARY KEY,
  actor_id     INTEGER REFERENCES doctors(id),   -- null for system events
  patient_id   INTEGER REFERENCES patients(id),
  action       TEXT NOT NULL,           -- 'order.placed', 'order.override', 'ai.alert.raised', 'note.created', 'auth.login'
  details      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_patient ON audit_log(patient_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
