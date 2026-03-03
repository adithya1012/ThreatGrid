import { Pool } from 'pg';

// Uses environment variables set by docker-compose:
// PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
// or falls back to DATABASE_URL
const connectionString = process.env.DATABASE_URL;

export const pool = connectionString
  ? new Pool({ connectionString })
  : new Pool({
      host: process.env.PGHOST ?? 'postgres',
      port: parseInt(process.env.PGPORT ?? '5432', 10),
      database: process.env.PGDATABASE ?? 'zscaler_soc',
      user: process.env.PGUSER ?? 'socadmin',
      password: process.env.PGPASSWORD ?? 'socpassword',
    });

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});
