const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { callLLM } = require('./utils');

const app = express();
const PORT = process.env.PORT || 4000;
const RQLITE_URL = process.env.RQLITE_URL || 'http://localhost:4001';

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

async function executeRQLiteQuery(sql, params = []) {
    try {
        // For rqlite, substitute parameters directly into SQL string
        let finalSQL = sql;
        if (params.length > 0) {
            params.forEach(param => {
                if (param === null) {
                    finalSQL = finalSQL.replace('?', 'NULL');
                } else {
                    finalSQL = finalSQL.replace('?', `'${param}'`);
                }
            });
        }

        console.log('Executing SQL:', finalSQL);

        const response = await fetch(`${RQLITE_URL}/db/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([finalSQL])
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`rqlite execute failed: ${errorText}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('rqlite execute error:', error.message);
        throw error;
    }
}

async function queryRQLite(sql, params = []) {
    try {
        // For rqlite, substitute parameters directly into SQL string
        let finalSQL = sql;
        if (params.length > 0) {
            params.forEach((param, index) => {
                const placeholder = `datetime('${param}')`;
                finalSQL = finalSQL.replace(/datetime\(\?\)/, placeholder);
            });
            // Replace any remaining ? with quoted parameters
            params.forEach(param => {
                finalSQL = finalSQL.replace('?', `'${param}'`);
            });
        }
        
        console.log('Final SQL:', finalSQL);

        const response = await fetch(`${RQLITE_URL}/db/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([finalSQL])
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`rqlite query failed: ${errorText}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('rqlite query error:', error.message);
        throw error;
    }
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
    console.log('Starting /api/events request');
    
    try {
        const { start_time, end_time } = req.query;
        
        if (!start_time) {
            return res.status(400).json({ error: 'start_time is required' });
        }
        
        console.log('Fetching events between:', start_time, end_time);
        
        let query;
        let params = [];
        
        if (end_time) {
            query = `
                SELECT id, lat, long, substr(created_time, 1, 16) as created_time, substr(start_time, 1, 16) as start_time, substr(end_time, 1, 16) as end_time, note, type
                FROM events
                WHERE datetime(start_time) >= datetime(?) AND datetime(start_time) <= datetime(?)
                ORDER BY start_time DESC
            `;
            params = [start_time, end_time];
        } else {
            query = `
                SELECT id, lat, long, substr(created_time, 1, 16) as created_time, substr(start_time, 1, 16) as start_time, substr(end_time, 1, 16) as end_time, note, type
                FROM events
                WHERE datetime(start_time) >= datetime(?)
                ORDER BY start_time DESC
            `;
            params = [start_time];
        }
        
        console.log('Executing query with params:', params);
        
        const result = await queryRQLite(query, params);
        
        if (result.results && result.results[0]) {
            const rows = result.results[0].values || [];
            const columns = result.results[0].columns || [];
            
            // Convert rqlite response to objects
            const events = rows.map(row => {
                const event = {};
                columns.forEach((col, index) => {
                    event[col] = row[index];
                });
                return event;
            });
            
            console.log('Found events:', events.length);
    
            res.json(events);
        } else {
            console.log('No events found');
            res.json([]);
        }
        
    } catch (error) {
        console.error('Exception in /api/events:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/events', requireApiKey, async (req, res) => {
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
    
    try {
        const query = `
            INSERT INTO events (lat, long, start_time, end_time, note, type)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        const result = await executeRQLiteQuery(query, [lat, long, start_time, end_time, note || '', type]);
        
        if (result.results && result.results[0]) {
            res.status(201).json({ 
                message: 'Event created successfully' 
            });
        } else {
            throw new Error('Unexpected result from rqlite');
        }
        
    } catch (error) {
        console.error('Error creating event:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/events/:id', requireApiKey, async (req, res) => {
    const eventId = req.params.id;
    
    try {
        const query = 'DELETE FROM events WHERE id = ?';
        const result = await executeRQLiteQuery(query, [eventId]);
        
        if (result.results && result.results[0]) {
            const rowsAffected = result.results[0].rows_affected || 0;
            
            if (rowsAffected === 0) {
                res.status(404).json({ error: 'Event not found' });
                return;
            }
            
            res.json({ message: 'Event deleted successfully' });
        } else {
            throw new Error('Unexpected result from rqlite');
        }
        
    } catch (error) {
        console.error('Error deleting event:', error.message);
        res.status(500).json({ error: error.message });
    }
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