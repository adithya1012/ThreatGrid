import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { pool } from "../db/client";
import { parseCSV } from "../services/csvParser";
import { processUpload } from "../services/uploadService";
import { Readable } from "stream";

export async function uploadRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/upload
   * Accept a multipart CSV file and run the full parse + anomaly pipeline.
   */
  app.post("/api/upload", {
    // attachValidation: true — prevents Fastify from returning a 400 when the
    // JSON body validator runs against a multipart request (request.body is
    // undefined for multipart). The handler always reads the file via
    // request.file() from @fastify/multipart, so the JSON validation result
    // is irrelevant and can be safely ignored.
    attachValidation: true,
    schema: {
      tags: ["upload"],
      summary: "Upload a Zscaler CSV log file for analysis",
      consumes: ["multipart/form-data"],
      security: [{ userId: [] }],
      headers: {
        type: "object",
        required: ["x-user-id"],
        properties: {
          "x-user-id": { type: "string", description: "User ID returned by /api/auth/login" },
        },
      },
      body: {
        type: "object",
        required: ["file"],
        properties: {
          file: {
            type: "string",
            format: "binary",
            description: "CSV log file to upload (Zscaler NSS format)",
          },
        },
      },
      response: {
        200: {
          description: "Upload processed successfully",
          type: "object",
          properties: {
            sessionId:         { type: "string", format: "uuid" },
            filename:          { type: "string" },
            totalRows:         { type: "integer" },
            anomalyCount:      { type: "integer" },
            legitimateCount:   { type: "integer" },
            anomalyPercentage: { type: "number" },
          },
        },
        400: { type: "object", properties: { error: { type: "string" } }, description: "Bad request (no file or wrong format)" },
        401: { type: "object", properties: { error: { type: "string" } }, description: "Authentication required" },
        500: { type: "object", properties: { error: { type: "string" }, details: { type: "string" } }, description: "Processing error" },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    let sessionId: string | null = null;

    // ── Require authenticated user ────────────────────────────────────────
    const userId = request.headers["x-user-id"] as string | undefined;
    if (!userId) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    try {
      // ── Get the uploaded file part ───────────────────────────────────────
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({ error: "No file uploaded" });
      }

      const { filename, mimetype, file } = data;

      // ── Validate: CSV only ───────────────────────────────────────────────
      const isCsvMime =
        mimetype === "text/csv" ||
        mimetype === "application/csv" ||
        mimetype === "application/vnd.ms-excel" ||
        mimetype === "text/plain";
      const isCsvExt = filename.toLowerCase().endsWith(".csv");

      if (!isCsvMime && !isCsvExt) {
        // Drain the stream to avoid memory leaks before rejecting
        file.resume();
        return reply.status(400).send({ error: "Only CSV files are accepted" });
      }

      // ── Create upload_session with status = "processing" ─────────────────
      const sessionResult = await pool.query<{ id: string }>(
        `INSERT INTO upload_sessions (user_id, filename, status)
         VALUES ($1, $2, 'processing')
         RETURNING id`,
        [userId, filename]
      );
      sessionId = sessionResult.rows[0].id;

      app.log.info(`[upload] Session created: ${sessionId} for file: ${filename}`);

      // ── Parse the CSV stream ─────────────────────────────────────────────
      const rows = await parseCSV(file as unknown as Readable);

      // ── Run anomaly detection + DB insertion ────────────────────────────
      const result = await processUpload(sessionId, rows);

      const legitimateCount = result.totalRows - result.anomalyCount;
      const anomalyPercentage =
        result.totalRows > 0
          ? Math.round((result.anomalyCount / result.totalRows) * 10000) / 100
          : 0;

      return reply.status(200).send({
        sessionId: result.sessionId,
        filename,
        totalRows: result.totalRows,
        anomalyCount: result.anomalyCount,
        legitimateCount,
        anomalyPercentage,
      });
    } catch (err) {
      app.log.error(err, "[upload] Processing failed");

      // Mark session as failed if it was created
      if (sessionId) {
        try {
          await pool.query(
            `UPDATE upload_sessions SET status = 'failed' WHERE id = $1`,
            [sessionId]
          );
        } catch {
          // best-effort — swallow secondary error
        }
      }

      return reply.status(500).send({
        error: "Failed to process upload",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
