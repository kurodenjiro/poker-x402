const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// Try to load .env or .env.local
const envPath = path.join(__dirname, '../.env');
const envLocalPath = path.join(__dirname, '../.env.local');

if (fs.existsSync(envLocalPath)) {
  require('dotenv').config({ path: envLocalPath });
} else if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

async function resetDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set in .env file');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Connecting to database...');
    const client = await pool.connect();
    
    try {
      console.log('Resetting database...');
      
      // Delete all data from tables
      await client.query('TRUNCATE TABLE game_plays CASCADE');
      console.log('  ✓ Cleared game_plays table');
      
      await client.query('TRUNCATE TABLE lobbies CASCADE');
      console.log('  ✓ Cleared lobbies table');
      
      console.log('\n✅ Database reset successfully!');
      console.log('All game_plays and lobbies data has been cleared.');
    } catch (error) {
      console.error('❌ Error resetting database:', error.message);
      console.error('Full error:', error);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Error connecting to database:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   Make sure PostgreSQL is running and DATABASE_URL is correct');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

resetDatabase();

