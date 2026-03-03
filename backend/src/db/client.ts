import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

// Prefer explicit DATABASE_URL; fall back to individual PG* env vars
// (docker-compose sets PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD directly)
function buildConnectionString(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  const host   = process.env.PGHOST     ?? "localhost";
  const port   = process.env.PGPORT     ?? "5432";
  const db     = process.env.PGDATABASE ?? "zscaler_soc";
  const user   = process.env.PGUSER     ?? "socadmin";
  const pass   = process.env.PGPASSWORD ?? "socpassword";
  return `postgresql://${user}:${pass}@${host}:${port}/${db}`;
}

export const pool = new Pool({
  connectionString: buildConnectionString(),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
});

export async function testConnection(): Promise<void> {
  try {
    const client = await pool.connect();
    const result = await client.query("SELECT NOW() AS now");
    client.release();
    console.log(
      `[DB] Connection successful. Server time: ${result.rows[0].now}`
    );
  } catch (error) {
    console.error("[DB] Connection failed:", error);
    throw error;
  }
}
