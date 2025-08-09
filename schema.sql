USE traffic;

CREATE TABLE IF NOT EXISTS events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    start_time DATETIME,
    end_time DATETIME,
    note TEXT,
    type ENUM('active', 'inactive') NOT NULL
);

-- Create index for location queries
CREATE INDEX idx_events_location ON events(latitude, longitude);

-- Create index for time queries
CREATE INDEX idx_events_time ON events(start_time, end_time);

-- Create index for type queries
CREATE INDEX idx_events_type ON events(type);