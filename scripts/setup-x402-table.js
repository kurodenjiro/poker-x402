const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

async function setupX402Table() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Connecting to database...');
    const client = await pool.connect();
    
    try {
      console.log('Creating x402_transactions table...');
      
      // Read and execute the schema
      const schemaPath = path.join(__dirname, '../supabase/schema-x402.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      
      await client.query(schema);
      
      console.log('✅ x402_transactions table created successfully!');
    } catch (error) {
      console.error('❌ Error creating table:', error.message);
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

setupX402Table();

