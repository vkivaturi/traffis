const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { callLLM } = require('./utils');
const { initializeDatabase } = require('./init_db');

const app = express();
const PORT = process.env.PORT || 4000;
const DATABASE = process.env.DB_PATH || 'traffic.db';

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Middleware to log all incoming requests
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || (req.connection.socket ? req.connection.socket.remoteAddress : null);
    console.log(`[${timestamp}] ${req.method} ${req.url} - IP: ${ip}`);
    next();
});

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

async function getDbConnection() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DATABASE, async (err) => {
            if (err) {
                // Database doesn't exist, initialize it
                if (err.code === 'SQLITE_CANTOPEN') {
                    console.log('Database not found. Initializing...');
                    try {
                        await initializeDatabase();
                        console.log('Database initialized successfully');
                        // Try connecting again after initialization
                        const newDb = new sqlite3.Database(DATABASE, (err2) => {
                            if (err2) {
                                console.error('Error after initialization:', err2.message);
                                reject(err2);
                            } else {
                                resolve(newDb);
                            }
                        });
                    } catch (initErr) {
                        console.error('Error initializing database:', initErr.message);
                        reject(initErr);
                    }
                } else {
                    console.error('Error creating database connection:', err.message);
                    reject(err);
                }
            } else {
                resolve(db);
            }
        });
    });
}

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/map.html');
});

// Serve the admin page
app.get('/cyberabad_admin', (req, res) => {
    res.sendFile(__dirname + '/admin.html');
});

app.get('/api/events', async (req, res) => {
    try {
        const db = await getDbConnection();
        const { start_time, end_time } = req.query;
    
    if (!start_time) {
        return res.status(400).json({ error: 'start_time is required' });
    }
    console.log('Fetching events between:', start_time, end_time);
    let query;
    let params = [];
    
    if (end_time) {
        query = `
            SELECT id, lat, long, created_time, start_time, end_time, note, type
            FROM events
            WHERE datetime(start_time) >= datetime(?) AND datetime(start_time) <= datetime(?)
            ORDER BY start_time DESC
        `;
        params = [start_time, end_time];
    } else {
        query = `
            SELECT id, lat, long, created_time, start_time, end_time, note, type
            FROM events
            WHERE datetime(start_time) >= datetime(?)
            ORDER BY start_time DESC
        `;
        params = [start_time];
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
    } catch (error) {
        console.error('Error in /api/events:', error.message);
        res.status(500).json({ error: 'Database connection failed' });
    }
});

app.post('/api/events', requireApiKey, (req, res) => {
    const { lat, long, start_time, end_time, note, type } = req.body;
    
    const requiredFields = ['lat', 'long', 'type'];
    for (const field of requiredFields) {
        if (req.body[field] === undefined) {
            return res.status(400).json({ error: `Missing required field: ${field}` });
        }
    }
    
    const validTypes = ['active', 'inactive'];
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

app.delete('/api/events/:id', requireApiKey, (req, res) => {
    const eventId = req.params.id;
    const { start_time } = req.body;
    
    if (!start_time) {
        return res.status(400).json({ error: 'start_time is required in request body' });
    }
    
    const db = getDbConnection();
    
    db.run('DELETE FROM events WHERE id = ? AND datetime(start_time) = datetime(?)', [eventId, start_time], function(err) {
        if (err) {
            console.error('Error deleting event:', err.message);
            res.status(500).json({ error: err.message });
            return;
        }
        
        if (this.changes === 0) {
            res.status(404).json({ error: 'Event not found or start_time does not match' });
            return;
        }
        
        res.json({ message: 'Event deleted successfully' });
    });
    
    db.close();
});

app.post('/api/llm', requireApiKey, async (req, res) => {
    const { prompt } = req.body;
    
    if (!prompt) {
        return res.status(400).json({ error: 'prompt is required' });
    }
    
    try {
        const result = await callLLM(prompt);
        res.json(result);
    } catch (error) {
        console.error('Error calling LLM:', error.message);
        res.status(500).json({ error: 'Failed to call LLM service' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});