CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lat REAL NOT NULL,
    long REAL NOT NULL,
    created_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    start_time DATETIME,
    end_time DATETIME,
    note TEXT,
    type TEXT CHECK(type IN ('warning', 'slow traffic', 'very slow traffic', 'normal')) NOT NULL
);

-- Create index for location queries
CREATE INDEX IF NOT EXISTS idx_events_location ON events(lat, long);

-- Create index for time queries
CREATE INDEX IF NOT EXISTS idx_events_time ON events(start_time, end_time);

-- Create index for type queries
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);