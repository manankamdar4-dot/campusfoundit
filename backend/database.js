const { createClient } = require('@libsql/client');
require('dotenv').config();

// Initialize Turso database connection
const dbClient = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

const db = {};

// Helper to run queries with promises, keeping the same API shape
db.query = async (sql, params = []) => {
  const result = await dbClient.execute({ sql, args: params });
  return result.rows;
};

db.getOne = async (sql, params = []) => {
  const result = await dbClient.execute({ sql, args: params });
  return result.rows[0];
};

db.runQuery = async (sql, params = []) => {
  const result = await dbClient.execute({ sql, args: params });
  return { 
    lastInsertRowid: result.lastInsertRowid ? result.lastInsertRowid.toString() : null, 
    changes: result.rowsAffected 
  };
};

// Create tables sequentially on Turso
const initDb = async () => {
    try {
        await dbClient.execute(`
            CREATE TABLE IF NOT EXISTS lost_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT NOT NULL,
            item_name TEXT NOT NULL,
            category TEXT NOT NULL,
            color TEXT NOT NULL,
            brand TEXT,
            location_lost TEXT NOT NULL,
            date_lost TEXT NOT NULL,
            description TEXT,
            photo_path TEXT,
            hidden_detail TEXT NOT NULL,
            status TEXT DEFAULT 'open',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await dbClient.execute(`
            CREATE TABLE IF NOT EXISTS found_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT NOT NULL,
            item_name TEXT NOT NULL,
            category TEXT NOT NULL,
            color TEXT NOT NULL,
            brand TEXT,
            location_found TEXT NOT NULL,
            date_found TEXT NOT NULL,
            description TEXT,
            photo_path TEXT,
            status TEXT DEFAULT 'unclaimed',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await dbClient.execute(`
            CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lost_id INTEGER NOT NULL,
            found_id INTEGER NOT NULL,
            similarity_score INTEGER NOT NULL,
            confirmed INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (lost_id) REFERENCES lost_items(id),
            FOREIGN KEY (found_id) REFERENCES found_items(id)
            )
        `);
        console.log('✅ Database tables verified on Turso.');
    } catch (err) {
        console.error('❌ Error initializing Turso database:', err.message);
    }
};

initDb();

module.exports = db;
