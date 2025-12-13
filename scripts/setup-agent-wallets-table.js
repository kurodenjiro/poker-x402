require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function setupAgentWalletsTable() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Connecting to database...');
    const client = await pool.connect();

    const schemaPath = path.join(__dirname, '../supabase/schema-agent-wallets.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('Running agent wallets schema...');
    await client.query(schema);

    console.log('✅ agent_wallets table created/updated successfully!');

    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'agent_wallets'
    `);

    if (result.rows.length > 0) {
      console.log('✅ Table "agent_wallets" verified.');
    } else {
      console.error('❌ Table "agent_wallets" not found after script execution.');
    }

  } catch (error) {
    console.error('❌ Error setting up agent wallets table:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupAgentWalletsTable();


