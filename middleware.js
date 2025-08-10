const rateLimit = require('express-rate-limit');

// Rate limiters
const getRoutesLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 200, // Limit each IP to 200 GET requests per windowMs
    message: 'Too many search requests, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    keyGenerator: () => 'global', // Force all requests to use the same key
});

const postRoutesLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 20, // Limit each IP to 20 POST requests per windowMs
    message: 'Too many update requests, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    keyGenerator: () => 'global', // Force all requests to use the same key
});

// API key validation middleware
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

module.exports = {
    getRoutesLimiter,
    postRoutesLimiter,
    requireApiKey
};