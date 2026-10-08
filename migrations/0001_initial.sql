PRAGMA foreign_keys = ON;

CREATE TABLE aircraft (
  id TEXT PRIMARY KEY,
  tail_no TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  icao_no TEXT COLLATE NOCASE UNIQUE,
  manufacturer TEXT,
  model TEXT,
  serial_number TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  hourly_cost_cents INTEGER CHECK (hourly_cost_cents IS NULL OR hourly_cost_cents >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE source_collections (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_agency TEXT,
  criteria_start TEXT,
  criteria_end TEXT,
  response_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE source_documents (
  id TEXT PRIMARY KEY,
  collection_id TEXT REFERENCES source_collections(id) ON DELETE SET NULL,
  sha256 TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'application/pdf',
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  r2_key TEXT NOT NULL UNIQUE,
  page_count INTEGER,
  publication_state TEXT NOT NULL DEFAULT 'draft'
    CHECK (publication_state IN ('draft', 'published', 'withdrawn')),
  ocr_r2_key TEXT,
  ocr_model TEXT,
  ocr_usage_json TEXT,
  ocr_status TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT
);

CREATE TABLE ingestion_batches (
  id TEXT PRIMARY KEY,
  source_document_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE RESTRICT,
  workflow_instance_id TEXT UNIQUE,
  state TEXT NOT NULL DEFAULT 'uploaded'
    CHECK (state IN ('uploaded', 'ocr_running', 'review_required', 'publishing', 'published', 'failed', 'cancelled')),
  ocr_r2_key TEXT,
  validation_summary_json TEXT,
  error_message TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT
);

CREATE TABLE trips (
  id TEXT PRIMARY KEY,
  legacy_id INTEGER UNIQUE,
  ingestion_batch_id TEXT REFERENCES ingestion_batches(id) ON DELETE SET NULL,
  report_date TEXT NOT NULL,
  aircraft_id TEXT REFERENCES aircraft(id) ON DELETE SET NULL,
  raw_route TEXT NOT NULL,
  department TEXT NOT NULL,
  division TEXT,
  printed_passengers TEXT,
  flight_hours REAL NOT NULL CHECK (flight_hours >= 0),
  comments TEXT,
  justification TEXT,
  invoiced_amount_cents INTEGER,
  estimated_cost_cents INTEGER
    CHECK (estimated_cost_cents IS NULL OR estimated_cost_cents >= 0),
  publication_state TEXT NOT NULL DEFAULT 'draft'
    CHECK (publication_state IN ('draft', 'ready', 'published', 'withdrawn')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT
);

CREATE TABLE trip_route_stops (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  raw_label TEXT NOT NULL,
  UNIQUE (trip_id, position)
);

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  legacy_id INTEGER UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX people_normalized_name_unique ON people(normalized_name COLLATE NOCASE);

CREATE TABLE trip_people (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position >= 0),
  printed_name TEXT NOT NULL,
  PRIMARY KEY (trip_id, position),
  UNIQUE (trip_id, person_id, position)
);

CREATE TABLE trip_sources (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  source_document_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (trip_id, source_document_id)
);

CREATE TABLE ingestion_rows (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES ingestion_batches(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  source_page INTEGER NOT NULL CHECK (source_page > 0),
  source_row INTEGER NOT NULL CHECK (source_row > 0),
  extracted_json TEXT NOT NULL,
  edited_json TEXT,
  validation_errors_json TEXT NOT NULL DEFAULT '[]',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  duplicate_candidates_json TEXT NOT NULL DEFAULT '[]',
  flight_candidate_ids_json TEXT NOT NULL DEFAULT '[]',
  review_action TEXT CHECK (review_action IN ('create', 'link_existing', 'exclude')),
  existing_trip_id TEXT REFERENCES trips(id) ON DELETE SET NULL,
  review_note TEXT,
  reviewed_by_user_id TEXT,
  reviewed_at TEXT,
  published_trip_id TEXT REFERENCES trips(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (batch_id, position),
  UNIQUE (batch_id, source_page, source_row)
);

CREATE TABLE observed_flights (
  id TEXT PRIMARY KEY,
  aircraft_id TEXT NOT NULL REFERENCES aircraft(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL,
  provider_flight_id TEXT,
  started_at_utc TEXT NOT NULL,
  ended_at_utc TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds >= 0),
  raw_r2_key TEXT,
  raw_expires_at TEXT,
  source_date TEXT,
  segment_index INTEGER,
  geometry_json TEXT NOT NULL,
  point_count INTEGER NOT NULL CHECK (point_count >= 2),
  telemetry_r2_key TEXT,
  telemetry_point_count INTEGER,
  min_altitude_ft REAL,
  max_altitude_ft REAL,
  source_hash TEXT,
  distance_metres REAL NOT NULL CHECK (distance_metres >= 0),
  geometry_source TEXT NOT NULL DEFAULT 'provider'
    CHECK (geometry_source IN ('provider', 'manual')),
  geometry_updated_by_user_id TEXT,
  state TEXT NOT NULL DEFAULT 'unmatched'
    CHECK (state IN ('unmatched', 'suggested', 'linked', 'ignored')),
  legacy_id INTEGER UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (provider, provider_flight_id)
);

CREATE TABLE trip_flight_links (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  observed_flight_id TEXT NOT NULL REFERENCES observed_flights(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL DEFAULT 0,
  confirmed_by_user_id TEXT,
  confirmed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note TEXT,
  UNIQUE (trip_id, observed_flight_id)
);

CREATE TABLE flight_match_candidates (
  id TEXT PRIMARY KEY,
  ingestion_row_id TEXT REFERENCES ingestion_rows(id) ON DELETE CASCADE,
  trip_id TEXT REFERENCES trips(id) ON DELETE CASCADE,
  observed_flight_id TEXT NOT NULL REFERENCES observed_flights(id) ON DELETE CASCADE,
  score REAL NOT NULL,
  score_breakdown_json TEXT NOT NULL,
  ai_rank INTEGER,
  ai_explanation TEXT,
  state TEXT NOT NULL DEFAULT 'suggested'
    CHECK (state IN ('suggested', 'accepted', 'rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ingestion_row_id IS NOT NULL OR trip_id IS NOT NULL)
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  request_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Better Auth tables. Names and camel-case columns match Better Auth's D1 adapter.
CREATE TABLE user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE session (
  id TEXT PRIMARY KEY,
  expiresAt INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE account (
  id TEXT PRIMARY KEY,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope TEXT,
  password TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER,
  updatedAt INTEGER
);

CREATE INDEX trips_public_date_idx ON trips(publication_state, report_date DESC, id DESC);
CREATE INDEX trips_aircraft_date_idx ON trips(aircraft_id, report_date DESC, id DESC);
CREATE INDEX trips_agency_idx ON trips(department, division, report_date DESC);
CREATE INDEX trips_batch_idx ON trips(ingestion_batch_id, publication_state);
CREATE INDEX trip_people_person_idx ON trip_people(person_id, trip_id);
CREATE INDEX trip_sources_document_idx ON trip_sources(source_document_id, trip_id);
CREATE INDEX ingestion_rows_review_idx ON ingestion_rows(batch_id, review_action, position);
CREATE INDEX observed_flights_aircraft_time_idx ON observed_flights(aircraft_id, started_at_utc, ended_at_utc);
CREATE INDEX observed_flights_state_time_idx ON observed_flights(state, started_at_utc DESC);
CREATE INDEX observed_flights_source_segment_idx
  ON observed_flights(provider, aircraft_id, source_date, segment_index);
CREATE INDEX observed_flights_source_hash_idx
  ON observed_flights(source_hash)
  WHERE source_hash IS NOT NULL;
CREATE INDEX trip_flight_links_flight_idx ON trip_flight_links(observed_flight_id, trip_id);
CREATE INDEX audit_events_entity_idx ON audit_events(entity_type, entity_id, created_at DESC);
CREATE INDEX session_user_idx ON session(userId);
CREATE INDEX account_user_idx ON account(userId);
CREATE UNIQUE INDEX account_provider_unique ON account(providerId, accountId);
CREATE INDEX verification_identifier_idx ON verification(identifier);

CREATE TABLE trip_search (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id TEXT NOT NULL UNIQUE REFERENCES trips(id) ON DELETE CASCADE,
  route TEXT NOT NULL DEFAULT '',
  passengers TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  division TEXT NOT NULL DEFAULT '',
  comments TEXT NOT NULL DEFAULT '',
  justification TEXT NOT NULL DEFAULT ''
);

CREATE VIRTUAL TABLE trips_fts USING fts5(
  route,
  passengers,
  department,
  division,
  comments,
  justification,
  content='trip_search',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER trip_search_ai AFTER INSERT ON trip_search BEGIN
  INSERT INTO trips_fts(rowid, route, passengers, department, division, comments, justification)
  VALUES (new.id, new.route, new.passengers, new.department, new.division, new.comments, new.justification);
END;

CREATE TRIGGER trip_search_ad AFTER DELETE ON trip_search BEGIN
  INSERT INTO trips_fts(trips_fts, rowid, route, passengers, department, division, comments, justification)
  VALUES ('delete', old.id, old.route, old.passengers, old.department, old.division, old.comments, old.justification);
END;

CREATE TRIGGER trip_search_au AFTER UPDATE ON trip_search BEGIN
  INSERT INTO trips_fts(trips_fts, rowid, route, passengers, department, division, comments, justification)
  VALUES ('delete', old.id, old.route, old.passengers, old.department, old.division, old.comments, old.justification);
  INSERT INTO trips_fts(rowid, route, passengers, department, division, comments, justification)
  VALUES (new.id, new.route, new.passengers, new.department, new.division, new.comments, new.justification);
END;
