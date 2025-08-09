const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

function initializeDatabase() {
    return new Promise((resolve, reject) => {
        const dbPath = process.env.DB_PATH || 'traffic.db';
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
                reject(err);
                return;
            }
            console.log('Connected to SQLite database');
        });

        const schema = fs.readFileSync('schema.sql', 'utf8');
        
        db.exec(schema, (err) => {
            if (err) {
                console.error('Error creating schema:', err.message);
                reject(err);
                return;
            }
            console.log('Database schema created successfully');
            
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
            
            const insertStmt = db.prepare(`
                INSERT INTO events (lat, long, start_time, end_time, note, type)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            
            let completedInserts = 0;
            const totalInserts = sampleData.length;
            
            sampleData.forEach(data => {
                insertStmt.run(data, (err) => {
                    if (err) {
                        console.error('Error inserting sample data:', err.message);
                    }
                    completedInserts++;
                    
                    if (completedInserts === totalInserts) {
                        insertStmt.finalize((err) => {
                            if (err) {
                                console.error('Error finalizing statement:', err.message);
                                reject(err);
                            } else {
                                console.log(`Sample data inserted: ${sampleData.length} events`);
                                db.close((err) => {
                                    if (err) {
                                        console.error('Error closing database:', err.message);
                                        reject(err);
                                    } else {
                                        console.log('Database initialization completed');
                                        resolve();
                                    }
                                });
                            }
                        });
                    }
                });
            });
        });
    });
}

if (require.main === module) {
    initializeDatabase();
}

module.exports = { initializeDatabase };