import { Pool } from 'pg';

let pool: Pool | null = null;

// Lazy initialization of connection pool
function getPool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000, // Increased to 10 seconds
      statement_timeout: 30000, // 30 seconds for query execution
      query_timeout: 30000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });

    // Handle connection errors
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      // Don't exit, just log
    });
  }
  return pool;
}

export { getPool };

// Helper function to execute queries with retry logic
export async function query(text: string, params?: any[]): Promise<any> {
  // Check if DATABASE_URL is configured
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }

  const start = Date.now();
  let retries = 2;
  
  while (retries > 0) {
    try {
      const poolInstance = getPool();
      const client = await poolInstance.connect();
      try {
        const res = await client.query(text, params);
        const duration = Date.now() - start;
        if (duration > 1000) {
          console.log('Slow query detected', { text: text.substring(0, 100), duration, rows: res.rowCount });
        }
        return res;
      } finally {
        client.release();
      }
    } catch (error: any) {
      retries--;
      if (retries === 0) {
        console.error('Database query error after retries:', error.message || error);
        throw error;
      }
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log(`Retrying query (${2 - retries}/2)...`);
    }
  }
  
  throw new Error('Query failed after all retries');
}

