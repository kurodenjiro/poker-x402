const { Pool } = require('pg');
require('dotenv').config();

// Create pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function main() {
    try {
        const client = await pool.connect();
        try {
            // Find latest lobby
            const res = await client.query('SELECT game_id, updated_at, status FROM lobbies ORDER BY updated_at DESC LIMIT 5');
            console.log('Latest lobbies:');
            res.rows.forEach(row => {
                console.log(`- ID: ${row.game_id} | Status: ${row.status} | Updated: ${row.updated_at}`);
            });

            if (res.rows.length > 0) {
                console.log(`\nMOST RECENT GAME ID: ${res.rows[0].game_id}`);
            }
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Error querying database:', err);
    } finally {
        await pool.end();
    }
}

main();
