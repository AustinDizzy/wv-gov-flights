CREATE TABLE IF NOT EXISTS "aircraft" (
    tail_no TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
    type TEXT NOT NULL CHECK (type IN ('helicopter', 'airplane')),
    rate REAL NOT NULL,
    seats INTEGER,
    content TEXT,
    icao_no TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS "trips" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL, -- YYYY-MM-DD
    tail_no TEXT NOT NULL, -- aircraft tail number
    route TEXT NOT NULL, -- ex. CRW-MRB-CRW; CRW-Massey Energy-CRW; CRW-Hedgesville-CRW
    passengers TEXT, -- optional, free string, comma-separated list of names
    department TEXT NOT NULL, -- ex. Governor's Office
    division TEXT, -- optional, ex. Aviation Division
    flight_hours REAL NOT NULL, -- ex. 1.5
    comments TEXT, -- optional, free string
    justification_lwb TEXT, -- optional, free string, see FAQ#justification_lwb
    flight_path TEXT, -- optional, computed WKT LineString of recorded flight path, see FAQ#flight_path
    FOREIGN KEY (tail_no) REFERENCES aircraft(tail_no)
);

CREATE TABLE IF NOT EXISTS "datasources" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, -- ex. "FOIA response from WV Governor's Office"
    source TEXT NOT NULL, -- ex. "West Virginia Governor's Office"
    date TEXT NOT NULL, -- date the data was produced
    path TEXT NOT NULL -- path to the data file on disk
);

CREATE TABLE IF NOT EXISTS "datasource_trips" (
    datasource_id INTEGER NOT NULL,
    trip_id INTEGER NOT NULL,
    FOREIGN KEY (datasource_id) REFERENCES datasources(id),
    FOREIGN KEY (trip_id) REFERENCES trips(id)
);

CREATE INDEX IF NOT EXISTS idx_trips_tail_no ON trips(tail_no);
CREATE INDEX IF NOT EXISTS idx_aircraft_tail_no ON aircraft(tail_no);
CREATE INDEX IF NOT EXISTS idx_trips_date ON trips(date DESC);
CREATE INDEX IF NOT EXISTS idx_trips_department ON trips(department);
CREATE INDEX IF NOT EXISTS idx_trips_division ON trips(division);
CREATE INDEX IF NOT EXISTS idx_trips_department_division ON trips(department, division);
CREATE INDEX IF NOT EXISTS idx_trips_flight_hours ON trips(flight_hours);

CREATE VIRTUAL TABLE trips_fts USING fts5(
    route,
    passengers,
    department,
    division,
    comments,
    justification_lwb,
    content='trips',
    content_rowid='id'
);