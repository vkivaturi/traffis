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
    res.sendFile(__dirname + '/map.html');
});

app.get('/api/events', (req, res) => {
    const db = getDbConnection();
    const { start_time, end_time } = req.query;
    
    let query;
    let params = [];
    
    if (start_time && end_time) {
        // Filter by time range when provided
        query = `
            SELECT id, lat, long, created_time, start_time, end_time, note, type
            FROM events
            WHERE start_time >= ? AND start_time <= ?
            ORDER BY start_time DESC
        `;
        params = [start_time, end_time];
    } else {
        // Default behavior: show active events
        query = `
            SELECT id, lat, long, created_time, start_time, end_time, note, type
            FROM events
            WHERE end_time IS NULL OR end_time > datetime('now')
            ORDER BY created_time DESC
        `;
    }
    
    db.all(query, params, (err, rows) => {
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