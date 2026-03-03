import { pool } from '../db.js';

export interface ColumnContext {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  distinct_values: unknown[];
  truncated: boolean;
}

export interface DbContextResult {
  table: string;
  session_id: string;
  columns: ColumnContext[];
}

export async function getDbContext(session_id: string): Promise<DbContextResult> {
  // ── 1. Get column metadata from information_schema ──────────────────────
  const columnsResult = await pool.query<{
    column_name: string;
    data_type: string;
    is_nullable: string;
  }>(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'zscaler_logs'
     ORDER BY ordinal_position`
  );

  const columns: ColumnContext[] = [];

  // ── 2. For each column, fetch distinct non-null values for this session ──
  for (const col of columnsResult.rows) {
    // Skip internal / metadata columns that aren't analytically useful
    const skip = ['id', 'session_id', 'raw_json'];
    if (skip.includes(col.column_name)) {
      continue;
    }

    let distinctValues: unknown[] = [];
    let truncated = false;

    try {
      const dvResult = await pool.query(
        `SELECT DISTINCT ${col.column_name}
         FROM zscaler_logs
         WHERE session_id = $1
           AND ${col.column_name} IS NOT NULL
         LIMIT 11`,          // fetch 11 so we can detect truncation
        [session_id]
      );

      const rows = dvResult.rows.map((r) => r[col.column_name]);
      if (rows.length > 10) {
        truncated = true;
        distinctValues = rows.slice(0, 10);
      } else {
        distinctValues = rows;
      }
    } catch {
      // If a column type doesn't support DISTINCT (e.g. jsonb arrays), skip values
      distinctValues = [];
    }

    columns.push({
      column_name: col.column_name,
      data_type: col.data_type,
      is_nullable: col.is_nullable === 'YES',
      distinct_values: distinctValues,
      truncated,
    });
  }

  return {
    table: 'zscaler_logs',
    session_id,
    columns,
  };
}
