import fs from "fs";
import path from "path";
import { pool, testConnection } from "./client";

async function migrate(): Promise<void> {
  console.log("[Migrate] Starting database migration...");

  await testConnection();

  const schemaPath = path.join(__dirname, "schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf-8");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(schemaSql);
    await client.query("COMMIT");
    console.log("[Migrate] Schema applied successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[Migrate] Migration failed, rolled back:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error("[Migrate] Unexpected error:", err);
  process.exit(1);
});
