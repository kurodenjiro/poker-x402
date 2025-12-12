require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function setupPaymentAccountsTable() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Connecting to database...');
    const client = await pool.connect();

    const schemaPath = path.join(__dirname, '../supabase/schema-payment-accounts.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('Running payment accounts schema...');
    await client.query(schema);

    console.log('✅ payment_accounts table created/updated successfully!');

    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'payment_accounts'
    `);

    if (result.rows.length > 0) {
      console.log('✅ Table "payment_accounts" verified.');
    } else {
      console.error('❌ Table "payment_accounts" not found after script execution.');
    }

  } catch (error) {
    console.error('❌ Error setting up payment accounts table:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupPaymentAccountsTable();

