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

CREATE TABLE `locations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) DEFAULT NULL,
  `type` varchar(20) DEFAULT NULL,
  `area` varchar(100) DEFAULT NULL,
  `ward` varchar(100) DEFAULT NULL,
  `district` varchar(50) DEFAULT NULL,
  `state` varchar(20) DEFAULT NULL,
  `assembly` varchar(100) DEFAULT NULL,
  `parliament` varchar(100) DEFAULT NULL,
  `coordinates` point NOT NULL,
  PRIMARY KEY (`id`),
  KEY `locations_type_IDX` (`type`) USING BTREE,
  KEY `locations_assembly_IDX` (`assembly`) USING BTREE,
  SPATIAL KEY `locations_coordinates_IDX` (`coordinates`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;