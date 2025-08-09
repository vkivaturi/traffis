const fetch = require('node-fetch');

async function initializeDatabase() {
    const RQLITE_URL = process.env.RQLITE_URL || 'http://localhost:4001';
    
    try {
        console.log(`Connecting to rqlite at ${RQLITE_URL}`);
        
        // Test connection first
        const testResult = await fetch(`${RQLITE_URL}/status`);
        if (!testResult.ok) {
            throw new Error(`Cannot connect to rqlite at ${RQLITE_URL}. Is rqlite running?`);
        }
        console.log('✅ rqlite is running');
        
        // Create table
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lat REAL NOT NULL,
                long REAL NOT NULL,
                created_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                start_time DATETIME,
                end_time DATETIME,
                note TEXT,
                type TEXT CHECK(type IN ('active', 'inactive')) NOT NULL
            )
        `;
        
        console.log('Creating events table...');
        const createResult = await fetch(`${RQLITE_URL}/db/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([createTableSQL])
        });
        
        const createResponse = await createResult.json();
        console.log('Table creation result:', createResponse);
        
        // Insert sample data
        const currentTime = new Date().toISOString();
        const oneHourLater = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const twoHoursLater = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
        const thirtyMinutesLater = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        
        const sampleData = [
            [17.415275, 78.481654, currentTime, oneHourLater, 'Heavy traffic on main road', 'active'],
            [17.420000, 78.485000, currentTime, twoHoursLater, 'Construction work ahead', 'active'],
            [17.410000, 78.475000, currentTime, thirtyMinutesLater, 'Minor slowdown', 'active'],
            [17.425000, 78.490000, currentTime, null, 'Clear roads', 'inactive']
        ];
        
        console.log('Inserting sample data...');
        
        // Insert each row individually with proper rqlite format
        let successfulInserts = 0;
        
        for (let i = 0; i < sampleData.length; i++) {
            const [lat, long, start_time, end_time, note, type] = sampleData[i];
            
            // Use direct string substitution for rqlite (safer than complex parameterization)
            const insertSQL = `INSERT INTO events (lat, long, start_time, end_time, note, type) VALUES (${lat}, ${long}, '${start_time}', ${end_time ? `'${end_time}'` : 'NULL'}, '${note}', '${type}')`;
            
            console.log(`Executing SQL: ${insertSQL}`);
            
            const insertResult = await fetch(`${RQLITE_URL}/db/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify([insertSQL])
            });
            
            if (insertResult.ok) {
                const insertResponse = await insertResult.json();
                console.log(`✅ Inserted event ${i + 1}:`, insertResponse);
                successfulInserts++;
            } else {
                const errorText = await insertResult.text();
                console.error(`❌ Error inserting event ${i + 1}:`, errorText);
                console.error(`Failed SQL: ${insertSQL}`);
            }
        }
        
        console.log(`Database initialization completed successfully`);
        console.log(`Created table and inserted ${successfulInserts} sample events`);
        
    } catch (error) {
        console.error('Error initializing database:', error.message);
        throw error;
    }
}

if (require.main === module) {
    initializeDatabase();
}

module.exports = { initializeDatabase };