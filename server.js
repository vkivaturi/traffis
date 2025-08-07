const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 4000;
const DATABASE = process.env.DB_PATH || 'traffic.db';

app.use(cors());
app.use(express.json());

function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    const validApiKey = process.env.API_KEY;
    
    if (!validApiKey) {
        return res.status(500).json({ error: 'Server configuration error: API key not set' });
    }
    
    if (!apiKey) {
        return res.status(401).json({ error: 'API key required' });
    }
    
    if (apiKey !== validApiKey) {
        return res.status(403).json({ error: 'Invalid API key' });
    }
    
    next();
}

function getDbConnection() {
    return new sqlite3.Database(DATABASE, (err) => {
        if (err) {
            console.error('Error creating database connection:', err.message);
        }
    });
}

// Serve the main page
app.get('/', (req, res) => {
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Traffis - Traffic Monitoring System</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: Arial, sans-serif;
        }
        h1 {
            text-align: center;
            color: #333;
        }
        #map {
            width: 100%;
            height: 500px;
            border: 2px solid #ccc;
            border-radius: 8px;
        }
        .legend {
            background: white;
            padding: 10px;
            margin-top: 10px;
            border-radius: 5px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .legend-item {
            display: flex;
            align-items: center;
            margin: 5px 0;
        }
        .legend-color {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            margin-right: 10px;
            border: 2px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
    </style>
</head>
<body>
    <h1>Traffis - Traffic Monitoring System</h1>
    <div id="map"></div>
    
    <div class="legend">
        <h3>Traffic Status Legend</h3>
        <div class="legend-item">
            <div class="legend-color" style="background-color: green;"></div>
            <span>Normal Traffic</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background-color: yellow;"></div>
            <span>Slow Traffic</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background-color: red;"></div>
            <span>Very Slow Traffic</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background-color: orange;"></div>
            <span>Warning/Alert</span>
        </div>
    </div>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        // Initialize the map
        var map = L.map('map').setView([17.415275150958514, 78.48165413403578], 11);

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(map);

        // Store markers for easy access
        var markers = {};

        // Define marker colors for different event types
        function getMarkerIcon(type) {
            var color;
            switch(type) {
                case 'warning':
                    color = 'orange';
                    break;
                case 'slow traffic':
                    color = 'yellow';
                    break;
                case 'very slow traffic':
                    color = 'red';
                    break;
                case 'normal':
                    color = 'green';
                    break;
                default:
                    color = 'blue';
            }
            
            return L.divIcon({
                className: 'custom-div-icon',
                html: \`<div style="background-color: \${color}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>\`,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });
        }

        // Function to load events from API
        async function loadEvents() {
            try {
                const response = await fetch('/api/events');
                const events = await response.json();
                
                // Clear existing markers
                Object.values(markers).forEach(marker => {
                    map.removeLayer(marker);
                });
                markers = {};
                
                // Add new markers
                events.forEach(event => {
                    const marker = L.marker([event.lat, event.long], {
                        icon: getMarkerIcon(event.type)
                    }).addTo(map);
                    
                    const popupContent = \`
                        <div>
                            <strong>Type:</strong> \${event.type}<br>
                            <strong>Note:</strong> \${event.note || 'No notes'}<br>
                            <strong>Start:</strong> \${event.start_time ? new Date(event.start_time).toLocaleString() : 'Not specified'}<br>
                            <strong>End:</strong> \${event.end_time ? new Date(event.end_time).toLocaleString() : 'Ongoing'}
                        </div>
                    \`;
                    
                    marker.bindPopup(popupContent);
                    markers[event.id] = marker;
                });
                
                console.log(\`Loaded \${events.length} events\`);
            } catch (error) {
                console.error('Error loading events:', error);
            }
        }

        // Load events when page loads
        loadEvents();

        // Refresh events every 30 seconds
        setInterval(loadEvents, 30000);
    </script>
</body>
</html>
    `;
    
    res.send(htmlContent);
});

app.get('/api/events', (req, res) => {
    const db = getDbConnection();
    
    const query = `
        SELECT id, lat, long, created_time, start_time, end_time, note, type
        FROM events
        WHERE end_time IS NULL OR end_time > datetime('now')
        ORDER BY created_time DESC
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Error fetching events:', err.message);
            res.status(500).json({ error: err.message });
            return;
        }
        
        res.json(rows);
    });
    
    db.close();
});

app.post('/api/events', requireApiKey, (req, res) => {
    const { lat, long, start_time, end_time, note, type } = req.body;
    
    const requiredFields = ['lat', 'long', 'type'];
    for (const field of requiredFields) {
        if (req.body[field] === undefined) {
            return res.status(400).json({ error: `Missing required field: ${field}` });
        }
    }
    
    const validTypes = ['warning', 'slow traffic', 'very slow traffic', 'normal'];
    if (!validTypes.includes(type)) {
        return res.status(400).json({ 
            error: `Invalid type. Must be one of: ${validTypes.join(', ')}` 
        });
    }
    
    const db = getDbConnection();
    
    const query = `
        INSERT INTO events (lat, long, start_time, end_time, note, type)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    db.run(query, [lat, long, start_time, end_time, note || '', type], function(err) {
        if (err) {
            console.error('Error creating event:', err.message);
            res.status(500).json({ error: err.message });
            return;
        }
        
        res.status(201).json({ 
            id: this.lastID, 
            message: 'Event created successfully' 
        });
    });
    
    db.close();
});

app.delete('/api/events/:id', (req, res) => {
    const eventId = req.params.id;
    const db = getDbConnection();
    
    db.run('DELETE FROM events WHERE id = ?', [eventId], function(err) {
        if (err) {
            console.error('Error deleting event:', err.message);
            res.status(500).json({ error: err.message });
            return;
        }
        
        if (this.changes === 0) {
            res.status(404).json({ error: 'Event not found' });
            return;
        }
        
        res.json({ message: 'Event deleted successfully' });
    });
    
    db.close();
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});