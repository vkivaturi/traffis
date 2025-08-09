const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'traffic',
    port: process.env.DB_PORT || 3306
};

let pool;

function initializePool() {
    if (!pool) {
        pool = mysql.createPool({
            ...dbConfig,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
    }
    return pool;
}

async function executeQuery(sql, params = []) {
    try {
        const connection = initializePool();
        console.log('Executing SQL:', sql, 'Params:', params);
        
        const [rows, fields] = await connection.execute(sql, params);
        return { rows, fields };
    } catch (error) {
        console.error('MySQL execute error:', error.message);
        throw error;
    }
}

async function queryDatabase(sql, params = []) {
    try {
        const connection = initializePool();
        
        const [rows, fields] = await connection.execute(sql, params);
        return rows;
    } catch (error) {
        console.error('MySQL query error:', error.message);
        throw error;
    }
}

module.exports = {
    executeQuery,
    queryDatabase
};