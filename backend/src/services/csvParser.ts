import { Readable } from "stream";
import { parse } from "fast-csv";

/**
 * Represents a single parsed + normalised row ready for DB insertion.
 * Field names match the zscaler_logs table columns exactly.
 */
export interface ParsedRow {
  datetime: Date | null;
  user_email: string;
  client_ip: string;
  url: string;
  action: string;
  url_category: string;
  threat_name: string;
  threat_severity: string;
  department: string;
  transaction_size: number;
  request_method: string;
  status_code: string;
  url_class: string;
  dlp_engine: string;
  useragent: string;
  location: string;
  app_name: string;
  app_class: string;
  raw_json: Record<string, unknown>;
}

/** Safely decode a URI-encoded field; return original string on failure. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Parse an integer field; return 0 on failure. */
function safeInt(value: string): number {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Parse a datetime string into a Date; return null on failure. */
function safeDatetime(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Map raw CSV column names to our internal field names.
 * Keys are exact CSV header strings (case-sensitive as Zscaler exports them).
 */
const COLUMN_MAP: Record<string, keyof ParsedRow | null> = {
  datetime: "datetime",
  user: "user_email",
  ClientIP: "client_ip",
  url: "url",
  action: "action",
  urlcategory: "url_category",
  threatname: "threat_name",
  threatseverity: "threat_severity",
  department: "department",
  transactionsize: "transaction_size",
  requestmethod: "request_method",
  status: "status_code",
  urlclass: "url_class",
  dlpengine: "dlp_engine",
  useragent: "useragent",
  location: "location",
  appname: "app_name",
  appclass: "app_class",
};

/** Fields that require URL decoding before storage */
const URL_DECODE_FIELDS: Set<keyof ParsedRow> = new Set([
  "department",
  "location",
]);

/** Fields that require integer parsing */
const INT_FIELDS: Set<keyof ParsedRow> = new Set(["transaction_size"]);

/** Fields that require datetime parsing */
const DATE_FIELDS: Set<keyof ParsedRow> = new Set(["datetime"]);

function mapRow(raw: Record<string, string>): ParsedRow {
  // Start with sensible defaults for every column so partial rows still insert.
  const row: ParsedRow = {
    datetime: null,
    user_email: "",
    client_ip: "",
    url: "",
    action: "",
    url_category: "",
    threat_name: "",
    threat_severity: "",
    department: "",
    transaction_size: 0,
    request_method: "",
    status_code: "",
    url_class: "",
    dlp_engine: "",
    useragent: "",
    location: "",
    app_name: "",
    app_class: "",
    raw_json: raw as Record<string, unknown>,
  };

  for (const [csvCol, fieldName] of Object.entries(COLUMN_MAP)) {
    if (fieldName === null) continue;
    const rawValue: string = raw[csvCol] ?? "";

    if (DATE_FIELDS.has(fieldName)) {
      (row as unknown as Record<string, unknown>)[fieldName] =
        safeDatetime(rawValue);
    } else if (INT_FIELDS.has(fieldName)) {
      (row as unknown as Record<string, unknown>)[fieldName] =
        safeInt(rawValue);
    } else if (URL_DECODE_FIELDS.has(fieldName)) {
      (row as unknown as Record<string, unknown>)[fieldName] =
        safeDecode(rawValue);
    } else {
      (row as unknown as Record<string, unknown>)[fieldName] = rawValue;
    }
  }

  return row;
}

/**
 * Parse a CSV readable stream and return an array of normalised rows.
 *
 * @param stream - Readable stream of CSV file content
 * @returns Promise resolving to an array of ParsedRow objects
 */
export function parseCSV(stream: Readable): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const rows: ParsedRow[] = [];

    stream
      .pipe(
        parse<Record<string, string>, ParsedRow>({
          headers: true,       // Use first row as column headers
          trim: true,          // Trim whitespace from values
          ignoreEmpty: true,   // Skip empty lines
        })
      )
      .on("data", (raw: Record<string, string>) => {
        try {
          rows.push(mapRow(raw));
        } catch (err) {
          // Skip malformed rows and continue processing
          console.warn("[csvParser] Skipping malformed row:", err, raw);
        }
      })
      .on("error", (err: Error) => {
        console.error("[csvParser] Stream error:", err.message);
        reject(err);
      })
      .on("end", () => {
        console.log(`[csvParser] Parsed ${rows.length} rows successfully.`);
        resolve(rows);
      });
  });
}
