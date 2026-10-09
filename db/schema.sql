-- Energía Vital PR schema. Idempotent: safe to run on every startup.

CREATE TABLE IF NOT EXISTS municipios (
  id                      INTEGER PRIMARY KEY,
  name                    TEXT NOT NULL UNIQUE,
  participating           INTEGER NOT NULL DEFAULT 0 CHECK (participating IN (0, 1)),
  omme_office             TEXT,
  oncall_name             TEXT,
  oncall_phone            TEXT,            -- encrypted
  backup_name             TEXT,
  backup_phone            TEXT,            -- encrypted
  contact_24h_verified_at TEXT,
  joined_at               TEXT,
  CHECK (participating = 0 OR oncall_phone IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS residents (
  id                    INTEGER PRIMARY KEY,
  first_name            TEXT NOT NULL,     -- encrypted
  last_name_paternal    TEXT NOT NULL,     -- encrypted
  last_name_maternal    TEXT,              -- encrypted
  phone                 TEXT NOT NULL,     -- encrypted
  address               TEXT NOT NULL,     -- encrypted
  gps                   TEXT,              -- encrypted "lat,lng"
  luma_meter            TEXT,              -- encrypted
  notify_channel        TEXT NOT NULL CHECK (notify_channel IN ('sms', 'whatsapp', 'call')),
  municipio_id          INTEGER NOT NULL REFERENCES municipios(id),
  zip_code              TEXT NOT NULL,
  barrio                TEXT,
  equipment_category    TEXT NOT NULL CHECK (equipment_category IN ('breathing', 'dialysis', 'feeding', 'refrigeration', 'mobility')),
  survival_window_hours REAL NOT NULL CHECK (survival_window_hours > 0),
  backup_power          TEXT NOT NULL CHECK (backup_power IN ('generator', 'solar_battery', 'none')),
  lives_alone           INTEGER NOT NULL CHECK (lives_alone IN (0, 1)),
  mobility_limited      INTEGER NOT NULL CHECK (mobility_limited IN (0, 1)),
  subsidy_status        TEXT CHECK (subsidy_status IN ('approved', 'in_process', 'no')),
  created_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_residents_municipio ON residents(municipio_id);

CREATE TABLE IF NOT EXISTS caregivers (
  id           INTEGER PRIMARY KEY,
  resident_id  INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  first_name   TEXT NOT NULL,              -- encrypted
  last_names   TEXT NOT NULL,              -- encrypted
  phone        TEXT NOT NULL,              -- encrypted
  email        TEXT,                       -- encrypted
  relationship TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_caregivers_resident ON caregivers(resident_id);

CREATE TABLE IF NOT EXISTS consents (
  id          INTEGER PRIMARY KEY,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  partner     TEXT NOT NULL CHECK (partner IN ('service', 'caregiver', 'luma', 'municipio')),
  granted_at  TEXT NOT NULL,
  revoked_at  TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_consents_active
  ON consents(resident_id, partner) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS outages (
  id           INTEGER PRIMARY KEY,
  scope_type   TEXT NOT NULL CHECK (scope_type IN ('municipio', 'resident')),
  municipio_id INTEGER REFERENCES municipios(id),
  resident_id  INTEGER REFERENCES residents(id) ON DELETE CASCADE,
  source       TEXT NOT NULL CHECK (source IN ('simulated', 'resident_report')),
  started_at   TEXT NOT NULL,               -- simulated clock time
  ended_at     TEXT,
  CHECK ((scope_type = 'municipio' AND municipio_id IS NOT NULL) OR
         (scope_type = 'resident'  AND resident_id  IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_outages_active ON outages(ended_at);

CREATE TABLE IF NOT EXISTS checkins (
  id          INTEGER PRIMARY KEY,
  outage_id   INTEGER NOT NULL REFERENCES outages(id) ON DELETE CASCADE,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  response    TEXT NOT NULL CHECK (response IN ('ok', 'help')),
  channel     TEXT NOT NULL,
  at          TEXT NOT NULL                 -- simulated clock time
);
CREATE INDEX IF NOT EXISTS idx_checkins_outage_resident ON checkins(outage_id, resident_id);

CREATE TABLE IF NOT EXISTS escalation_events (
  id          INTEGER PRIMARY KEY,
  outage_id   INTEGER NOT NULL REFERENCES outages(id) ON DELETE CASCADE,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  step        TEXT NOT NULL,
  at          TEXT NOT NULL,                -- simulated clock time
  UNIQUE (outage_id, resident_id, step)
);

CREATE TABLE IF NOT EXISTS checkin_tokens (
  token_hash  TEXT PRIMARY KEY,             -- SHA-256 hex of 32 random bytes
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  revoked_at  TEXT
);

CREATE TABLE IF NOT EXISTS access_log (
  id                  INTEGER PRIMARY KEY,
  request_id          TEXT NOT NULL,        -- groups one screen load into one entry
  context             TEXT NOT NULL CHECK (context IN ('case_list', 'case_detail', 'luma_list')),
  viewer_role         TEXT NOT NULL,
  viewer_label        TEXT NOT NULL,        -- persona display, e.g. "R. Quiñones · OMME San Sebastián"
  viewer_municipio_id INTEGER,
  resident_id         INTEGER NOT NULL,
  fields_disclosed    TEXT NOT NULL,        -- JSON array of field names
  at                  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_access_log_at ON access_log(at);
CREATE INDEX IF NOT EXISTS idx_access_log_request ON access_log(request_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY,
  event_type  TEXT NOT NULL,                -- UPPERCASE, e.g. RESIDENT_CREATED
  actor_role  TEXT NOT NULL,
  resident_id INTEGER,
  details     TEXT,                         -- JSON, never PII
  at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS case_actions (
  id           INTEGER PRIMARY KEY,
  outage_id    INTEGER REFERENCES outages(id) ON DELETE CASCADE,
  resident_id  INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('call_resident', 'call_caregiver', 'attempted',
                                             'coordinated', 'followup', 'resolved', 'note')),
  note         TEXT,                        -- encrypted (may contain PII)
  actor_label  TEXT NOT NULL,
  municipio_id INTEGER NOT NULL,
  at           TEXT NOT NULL                -- simulated clock time
);
CREATE INDEX IF NOT EXISTS idx_case_actions_resident ON case_actions(resident_id, at);

CREATE TABLE IF NOT EXISTS app_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);