require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { callLLM } = require('./utils');
const { executeQuery, queryDatabase } = require('./db');
const { getRoutesLimiter, postRoutesLimiter, requireApiKey } = require('./middleware');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Middleware to log all incoming requests and responses
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || (req.connection.socket ? req.connection.socket.remoteAddress : null);
    const startTime = Date.now();
    
    // Log incoming request
    console.log(`[${timestamp}] ${req.method} ${req.url} - IP: ${ip}`);
    
    // Override res.end to capture response details
    const originalEnd = res.end;
    res.end = function(chunk, encoding) {
        const responseTime = Date.now() - startTime;
        const statusCode = res.statusCode;
        const responseTimestamp = new Date().toISOString();
        
        console.log(`[${responseTimestamp}] ${req.method} ${req.url} - ${statusCode} - ${responseTime}ms - IP: ${ip}`);
        
        originalEnd.call(this, chunk, encoding);
    };
    
    next();
});

// Serve the main page
app.get('/', getRoutesLimiter, (req, res) => {
    res.sendFile(__dirname + '/map.html');
});

// Serve the admin page
app.get('/cyberabad_admin', getRoutesLimiter, (req, res) => {
    res.sendFile(__dirname + '/admin.html');
});

app.get('/api/events', getRoutesLimiter, async (req, res) => {
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
                SELECT id, latitude, longitude, DATE_FORMAT(created_time, '%Y-%m-%d %H:%i') as created_time, 
                       DATE_FORMAT(start_time, '%Y-%m-%d %H:%i') as start_time, 
                       DATE_FORMAT(end_time, '%Y-%m-%d %H:%i') as end_time, 
                       note, type
                FROM events
                WHERE start_time >= ? AND start_time <= ?
                ORDER BY start_time DESC
            `;
            params = [start_time, end_time];
        } else {
            query = `
                SELECT id, latitude, longitude, DATE_FORMAT(created_time, '%Y-%m-%d %H:%i') as created_time, 
                       DATE_FORMAT(start_time, '%Y-%m-%d %H:%i') as start_time, 
                       DATE_FORMAT(end_time, '%Y-%m-%d %H:%i') as end_time, 
                       note, type
                FROM events
                WHERE start_time >= ?
                ORDER BY start_time DESC
            `;
            params = [start_time];
        }
        
        console.log('Executing query with params:', params);
        
        const events = await queryDatabase(query, params);
        
        console.log('Found events:', events.length);
        res.json(events);
        
    } catch (error) {
        console.error('Exception in /api/events:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/events', postRoutesLimiter, requireApiKey, async (req, res) => {
    const { latitude, longitude, start_time, end_time, note, type } = req.body;

    const requiredFields = ['latitude', 'type'];
    if (!longitude && !latitude) {
        return res.status(400).json({ error: 'Missing required field: longitude or latitude' });
    }
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
            INSERT INTO events (latitude, longitude, start_time, end_time, note, type)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        const result = await executeQuery(query, [latitude, longitude || latitude, start_time, end_time, note || '', type]);
        
        res.status(201).json({ 
            message: 'Event created successfully',
            insertId: result.rows.insertId
        });
        
    } catch (error) {
        console.error('Error creating event:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/events/:id', postRoutesLimiter, requireApiKey, async (req, res) => {
    const eventId = req.params.id;
    
    try {
        const query = 'DELETE FROM events WHERE id = ?';
        const result = await executeQuery(query, [eventId]);
        
        if (result.rows.affectedRows === 0) {
            res.status(404).json({ error: 'Event not found' });
            return;
        }
        
        res.json({ message: 'Event deleted successfully' });
        
    } catch (error) {
        console.error('Error deleting event:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/llm', postRoutesLimiter, requireApiKey, async (req, res) => {
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