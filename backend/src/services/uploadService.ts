import { pool } from "../db/client";
import { ParsedRow } from "./csvParser";
import { detectAnomaly } from "./anomalyDetector";

const BATCH_SIZE = 100;

export interface UploadResult {
  sessionId: string;
  totalRows: number;
  anomalyCount: number;
}

/** Column list for the zscaler_logs INSERT (no id, no session_id — added separately) */
const LOG_COLUMNS = [
  "session_id",
  "datetime",
  "user_email",
  "client_ip",
  "url",
  "action",
  "url_category",
  "threat_name",
  "threat_severity",
  "department",
  "transaction_size",
  "request_method",
  "status_code",
  "url_class",
  "dlp_engine",
  "useragent",
  "location",
  "app_name",
  "app_class",
  "is_anomaly",
  "anomaly_confidence",
  "anomaly_reason",
  "raw_json",
] as const;

type LogColumnTuple = typeof LOG_COLUMNS;
type LogColumnName = LogColumnTuple[number];

/** Build a parameterised INSERT for a batch of rows. */
function buildBatchInsert(
  batch: Array<Record<LogColumnName, unknown>>
): { text: string; values: unknown[] } {
  const numCols = LOG_COLUMNS.length;
  const values: unknown[] = [];
  const rowPlaceholders: string[] = [];

  batch.forEach((row, rowIdx) => {
    const placeholders = LOG_COLUMNS.map(
      (_, colIdx) => `$${rowIdx * numCols + colIdx + 1}`
    ).join(", ");
    rowPlaceholders.push(`(${placeholders})`);
    LOG_COLUMNS.forEach((col) => values.push(row[col]));
  });

  const text = `
    INSERT INTO zscaler_logs (${LOG_COLUMNS.join(", ")})
    VALUES ${rowPlaceholders.join(", ")}
  `;

  return { text, values };
}

/** Chunk an array into sub-arrays of at most `size` elements. */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Orchestrate anomaly detection + DB insertion for a completed CSV upload.
 *
 * Steps:
 *  1. Run detectAnomaly() on every row
 *  2. Batch-insert rows into zscaler_logs (BATCH_SIZE rows per INSERT)
 *  3. Update upload_sessions with final counts + status = "completed"
 *
 * @param sessionId - UUID of the upload_sessions row created before parsing
 * @param rows      - Parsed rows from csvParser.parseCSV()
 */
export async function processUpload(
  sessionId: string,
  rows: ParsedRow[]
): Promise<UploadResult> {
  let anomalyCount = 0;

  // ── 1. Score every row ────────────────────────────────────────────────────
  const enrichedRows: Array<Record<LogColumnName, unknown>> = rows.map(
    (row) => {
      const { isAnomaly, anomalyConfidence, anomalyReason } =
        detectAnomaly(row);

      if (isAnomaly) anomalyCount++;

      return {
        session_id: sessionId,
        datetime: row.datetime,
        user_email: row.user_email,
        client_ip: row.client_ip,
        url: row.url,
        action: row.action,
        url_category: row.url_category,
        threat_name: row.threat_name,
        threat_severity: row.threat_severity,
        department: row.department,
        transaction_size: row.transaction_size,
        request_method: row.request_method,
        status_code: row.status_code,
        url_class: row.url_class,
        dlp_engine: row.dlp_engine,
        useragent: row.useragent,
        location: row.location,
        app_name: row.app_name,
        app_class: row.app_class,
        is_anomaly: isAnomaly,
        anomaly_confidence: anomalyConfidence,
        anomaly_reason: anomalyReason,
        raw_json: JSON.stringify(row.raw_json),
      };
    }
  );

  // ── 2. Batch-insert into zscaler_logs ─────────────────────────────────────
  const batches = chunk(enrichedRows, BATCH_SIZE);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const [batchIdx, batch] of batches.entries()) {
      const { text, values } = buildBatchInsert(batch);
      await client.query(text, values);
      console.log(
        `[uploadService] Inserted batch ${batchIdx + 1}/${batches.length} ` +
          `(${batch.length} rows)`
      );
    }

    // ── 3. Update upload_sessions ────────────────────────────────────────────
    await client.query(
      `UPDATE upload_sessions
         SET total_rows    = $1,
             anomaly_count = $2,
             status        = 'completed'
       WHERE id = $3`,
      [rows.length, anomalyCount, sessionId]
    );

    await client.query("COMMIT");

    console.log(
      `[uploadService] Session ${sessionId} complete — ` +
        `${rows.length} rows, ${anomalyCount} anomalies`
    );
  } catch (err) {
    await client.query("ROLLBACK");
    // Mark the session as failed so the UI can surface it
    try {
      await pool.query(
        `UPDATE upload_sessions SET status = 'failed' WHERE id = $1`,
        [sessionId]
      );
    } catch {
      // best-effort — swallow secondary error
    }
    throw err;
  } finally {
    client.release();
  }

  return {
    sessionId,
    totalRows: rows.length,
    anomalyCount,
  };
}
