import { pool } from '../db.js';

// Keywords that are forbidden anywhere in the query
const FORBIDDEN_PATTERNS = [
  /\binsert\b/i,
  /\bupdate\b/i,
  /\bdelete\b/i,
  /\bdrop\b/i,
  /\btruncate\b/i,
  /\balter\b/i,
  /\bcreate\b/i,
  /\bgrant\b/i,
  /\brevoke\b/i,
  /\bexecute\b/i,
  /--/,
  /\/\*/,
  /;/,
];

// Keywords that follow the WHERE clause (used for injection point detection)
const AFTER_WHERE_REGEX = /\b(GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|FETCH|UNION|INTERSECT|EXCEPT)\b/gi;

function validateQuery(query: string): void {
  const trimmed = query.trimStart();
  if (!/^select\b/i.test(trimmed)) {
    throw new Error('Query must start with SELECT.');
  }
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(query)) {
      throw new Error(
        `Query contains a forbidden keyword or character: ${pattern.toString()}. ` +
        'Only read-only SELECT statements are allowed.'
      );
    }
  }
}

function injectSessionFilter(
  query: string,
  sessionId: string
): { sql: string; params: unknown[] } {
  // Find the next available $N index based on any $1, $2 ... already in the query
  const existingParams = query.match(/\$(\d+)/g) ?? [];
  const maxParam =
    existingParams.length > 0
      ? Math.max(...existingParams.map((p) => parseInt(p.slice(1), 10)))
      : 0;
  const idx = maxParam + 1;
  const placeholder = `$${idx}`;

  const hasWhere = /\bWHERE\b/i.test(query);

  // Reset lastIndex because we use the global flag
  AFTER_WHERE_REGEX.lastIndex = 0;
  const afterMatch = AFTER_WHERE_REGEX.exec(query);
  
  let injected: string;

  if (hasWhere) {
    // Inject AND <filter> right before the next clause (GROUP BY / ORDER BY / etc.)
    if (afterMatch) {
      injected =
        query.slice(0, afterMatch.index).trimEnd() +
        ` AND session_id = ${placeholder} ` +
        query.slice(afterMatch.index);
    } else {
      injected = query.trimEnd() + ` AND session_id = ${placeholder}`;
    }
  } else {
    // No WHERE — insert WHERE <filter> before the next clause or at the end
    if (afterMatch) {
      injected =
        query.slice(0, afterMatch.index).trimEnd() +
        ` WHERE session_id = ${placeholder} ` +
        query.slice(afterMatch.index);
    } else {
      injected = query.trimEnd() + ` WHERE session_id = ${placeholder}`;
    }
  }

  // Enforce LIMIT 200 if the query has no LIMIT yet
  if (!/\bLIMIT\b/i.test(injected)) {
    injected = injected.trimEnd() + ' LIMIT 200';
  }

  return { sql: injected, params: [sessionId] };
}

export interface ReadQueryResult {
  rows: Record<string, unknown>[];
  row_count: number;
  columns: string[];
  executed_query: string;
  reason: string;
}

export async function runReadQuery(
  query: string,
  reason: string,
  session_id: string
): Promise<ReadQueryResult> {
  // ── 1. Validate ────────────────────────────────────────────────────────
  validateQuery(query);

  // ── 2. Inject session_id filter ────────────────────────────────────────
  const { sql, params } = injectSessionFilter(query, session_id);

  console.log(`[run_read_query] reason="${reason}" | executing: ${sql}`);

  // ── 3. Execute with a 5-second statement timeout ───────────────────────
  const client = await pool.connect();
  let result: { rows: Record<string, unknown>[]; fields: Array<{ name: string }> };

  try {
    await client.query('SET statement_timeout = 5000');
    result = await client.query(sql, params);
  } finally {
    client.release();
  }

  return {
    rows: result.rows,
    row_count: result.rows.length,
    columns: result.fields.map((f) => f.name),
    executed_query: sql,
    reason,
  };
}
