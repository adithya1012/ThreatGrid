import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { pool } from "../db/client";

// ---------------------------------------------------------------------------
// Query-param type helpers
// ---------------------------------------------------------------------------

interface LogsQueryParams {
  page?: string;
  limit?: string;
  filter_anomaly?: string;
  search?: string;
}

interface SessionParams {
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

// Helper: read x-user-id header or return 401
function requireUserId(
  request: FastifyRequest,
  reply: FastifyReply
): string | null {
  const userId = request.headers["x-user-id"] as string | undefined;
  if (!userId) {
    reply.status(401).send({ error: "Authentication required" });
    return null;
  }
  return userId;
}

// Helper: verify a sessionId belongs to the given userId (returns false + sends 403 if not)
async function verifySessionOwner(
  sessionId: string,
  userId: string,
  reply: FastifyReply
): Promise<boolean> {
  const check = await pool.query(
    "SELECT id FROM upload_sessions WHERE id = $1 AND user_id = $2",
    [sessionId, userId]
  );
  if (check.rows.length === 0) {
    reply.status(403).send({ error: "Access denied or session not found" });
    return false;
  }
  return true;
}

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {

  // ── GET /api/sessions ──────────────────────────────────────────────────────
  app.get(
    "/api/sessions",
    {
      schema: {
        tags: ["upload"],
        summary: "List upload sessions for the authenticated user",
        security: [{ userId: [] }],
        headers: {
          type: "object",
          required: ["x-user-id"],
          properties: {
            "x-user-id": { type: "string", description: "User ID from login" },
          },
        },
        response: {
          200: {
            description: "Array of upload sessions",
            type: "array",
            items: {
              type: "object",
              properties: {
                id:           { type: "string", format: "uuid" },
                filename:     { type: "string" },
                uploadedAt:   { type: "string", format: "date-time" },
                totalRows:    { type: "integer" },
                anomalyCount: { type: "integer" },
                status:       { type: "string" },
              },
            },
          },
          401: { type: "object", properties: { error: { type: "string" } }, description: "Authentication required" },
          500: { type: "object", properties: { error: { type: "string" } }, description: "Server error" },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = requireUserId(request, reply);
      if (!userId) return;
      try {
        const result = await pool.query(
          `SELECT
             id,
             filename,
             uploaded_at  AS "uploadedAt",
             total_rows   AS "totalRows",
             anomaly_count AS "anomalyCount",
             status
           FROM upload_sessions
           WHERE user_id = $1
           ORDER BY uploaded_at DESC`,
          [userId]
        );
        return reply.send(result.rows);
      } catch (err) {
        app.log.error(err, "[sessions] Query failed");
        return reply.status(500).send({ error: "Failed to fetch sessions" });
      }
    }
  );

  // ── GET /api/dashboard/:sessionId/logs ────────────────────────────────────
  app.get(
    "/api/dashboard/:sessionId/logs",
    {
      schema: {
        tags: ["logs"],
        summary: "Get paginated log entries for a session",
        security: [{ userId: [] }],
        headers: {
          type: "object",
          required: ["x-user-id"],
          properties: {
            "x-user-id": { type: "string", description: "User ID from login" },
          },
        },
        params: {
          type: "object",
          required: ["sessionId"],
          properties: {
            sessionId: { type: "string", format: "uuid", description: "Upload session ID" },
          },
        },
        querystring: {
          type: "object",
          properties: {
            page:           { type: "string", description: "Page number (default 1)" },
            limit:          { type: "string", description: "Rows per page (max 200, default 20)" },
            filter_anomaly: { type: "string", enum: ["true", "false"], description: "Filter to anomalies only" },
            search:         { type: "string", description: "Search by email or URL" },
          },
        },
        response: {
          200: {
            description: "Paginated log results",
            type: "object",
            properties: {
              logs:       { type: "array", items: { type: "object", additionalProperties: true } },
              total:      { type: "integer" },
              page:       { type: "integer" },
              totalPages: { type: "integer" },
            },
          },
          401: { type: "object", properties: { error: { type: "string" } }, description: "Authentication required" },
          403: { type: "object", properties: { error: { type: "string" } }, description: "Access denied" },
          500: { type: "object", properties: { error: { type: "string" } }, description: "Server error" },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: SessionParams;
        Querystring: LogsQueryParams;
      }>,
      reply: FastifyReply
    ) => {
      const userId = requireUserId(request, reply);
      if (!userId) return;
      try {
        const { sessionId } = request.params;
        if (!(await verifySessionOwner(sessionId, userId, reply))) return;
        const page = Math.max(1, parseInt(request.query.page ?? "1", 10));
        const limit = Math.min(
          200,
          Math.max(1, parseInt(request.query.limit ?? "20", 10))
        );
        const offset = (page - 1) * limit;
        const filterAnomaly = request.query.filter_anomaly === "true";
        const search = request.query.search?.trim() ?? "";

        // Build WHERE clauses dynamically
        const conditions: string[] = ["session_id = $1"];
        const params: unknown[] = [sessionId];
        let paramIdx = 2;

        if (filterAnomaly) {
          conditions.push(`is_anomaly = TRUE`);
        }

        if (search) {
          conditions.push(
            `(user_email ILIKE $${paramIdx} OR url ILIKE $${paramIdx})`
          );
          params.push(`%${search}%`);
          paramIdx++;
        }

        const whereClause = `WHERE ${conditions.join(" AND ")}`;

        // Total count for pagination
        const countResult = await pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM zscaler_logs ${whereClause}`,
          params
        );
        const total = parseInt(countResult.rows[0].count, 10);
        const totalPages = Math.max(1, Math.ceil(total / limit));

        // Paginated rows
        const logsResult = await pool.query(
          `SELECT
             id,
             datetime,
             user_email        AS "userEmail",
             client_ip         AS "clientIp",
             url,
             action,
             url_category      AS "urlCategory",
             threat_name       AS "threatName",
             threat_severity   AS "threatSeverity",
             department,
             transaction_size  AS "transactionSize",
             request_method    AS "requestMethod",
             status_code       AS "statusCode",
             url_class         AS "urlClass",
             dlp_engine        AS "dlpEngine",
             useragent,
             location,
             app_name          AS "appName",
             app_class         AS "appClass",
             is_anomaly        AS "isAnomaly",
             anomaly_confidence AS "anomalyConfidence",
             anomaly_reason    AS "anomalyReason"
           FROM zscaler_logs
           ${whereClause}
           ORDER BY datetime DESC NULLS LAST
           LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
          [...params, limit, offset]
        );

        return reply.send({
          logs: logsResult.rows,
          total,
          page,
          totalPages,
        });
      } catch (err) {
        app.log.error(err, "[dashboard/logs] Query failed");
        return reply.status(500).send({ error: "Failed to fetch logs" });
      }
    }
  );

  // ── GET /api/dashboard/:sessionId/stats ───────────────────────────────────
  app.get(
    "/api/dashboard/:sessionId/stats",
    {
      schema: {
        tags: ["dashboard"],
        summary: "Get aggregate stats for a session",
        security: [{ userId: [] }],
        headers: {
          type: "object",
          required: ["x-user-id"],
          properties: {
            "x-user-id": { type: "string", description: "User ID from login" },
          },
        },
        params: {
          type: "object",
          required: ["sessionId"],
          properties: {
            sessionId: { type: "string", format: "uuid" },
          },
        },
        response: {
          200: {
            description: "Session statistics",
            type: "object",
            properties: {
              totalRequests:    { type: "integer" },
              anomalyCount:     { type: "integer" },
              legitimateCount:  { type: "integer" },
              anomalyPercentage:{ type: "number" },
              blockedCount:     { type: "integer" },
              allowedCount:     { type: "integer" },
              topThreats:       { type: "array", items: { type: "object", additionalProperties: true } },
              topRiskyUsers:    { type: "array", items: { type: "object", additionalProperties: true } },
              topDepartments:   { type: "array", items: { type: "object", additionalProperties: true } },
            },
          },
          401: { type: "object", properties: { error: { type: "string" } }, description: "Authentication required" },
          403: { type: "object", properties: { error: { type: "string" } }, description: "Access denied" },
          500: { type: "object", properties: { error: { type: "string" } }, description: "Server error" },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: SessionParams }>,
      reply: FastifyReply
    ) => {
      const userId = requireUserId(request, reply);
      if (!userId) return;
      try {
        const { sessionId } = request.params;
        if (!(await verifySessionOwner(sessionId, userId, reply))) return;

        // Aggregated counts in a single pass
        const countsResult = await pool.query<{
          total: string;
          anomaly: string;
          blocked: string;
          allowed: string;
        }>(
          `SELECT
             COUNT(*)                                     AS total,
             COUNT(*) FILTER (WHERE is_anomaly = TRUE)   AS anomaly,
             COUNT(*) FILTER (WHERE LOWER(action) = 'blocked') AS blocked,
             COUNT(*) FILTER (WHERE LOWER(action) = 'allowed') AS allowed
           FROM zscaler_logs
           WHERE session_id = $1`,
          [sessionId]
        );

        const { total, anomaly, blocked, allowed } = countsResult.rows[0];
        const totalNum = parseInt(total, 10);
        const anomalyNum = parseInt(anomaly, 10);
        const blockedNum = parseInt(blocked, 10);
        const allowedNum = parseInt(allowed, 10);
        const legitimateNum = totalNum - anomalyNum;
        const anomalyPercentage =
          totalNum > 0
            ? Math.round((anomalyNum / totalNum) * 10000) / 100
            : 0;

        // Top 5 threats (excluding "None" / empty)
        const threatsResult = await pool.query<{
          threatName: string;
          count: string;
        }>(
          `SELECT
             threat_name AS "threatName",
             COUNT(*)    AS count
           FROM zscaler_logs
           WHERE session_id = $1
             AND threat_name IS NOT NULL
             AND threat_name <> ''
             AND LOWER(threat_name) <> 'none'
           GROUP BY threat_name
           ORDER BY count DESC
           LIMIT 5`,
          [sessionId]
        );

        // Top 5 risky users (by anomaly count)
        const usersResult = await pool.query<{
          user: string;
          anomalyCount: string;
        }>(
          `SELECT
             user_email    AS user,
             COUNT(*)      AS "anomalyCount"
           FROM zscaler_logs
           WHERE session_id = $1
             AND is_anomaly = TRUE
           GROUP BY user_email
           ORDER BY "anomalyCount" DESC
           LIMIT 5`,
          [sessionId]
        );

        // Top 5 departments by log volume
        const deptResult = await pool.query<{
          department: string;
          count: string;
        }>(
          `SELECT
             department,
             COUNT(*) AS count
           FROM zscaler_logs
           WHERE session_id = $1
             AND department IS NOT NULL
             AND department <> ''
           GROUP BY department
           ORDER BY count DESC
           LIMIT 5`,
          [sessionId]
        );

        return reply.send({
          totalRequests: totalNum,
          anomalyCount: anomalyNum,
          legitimateCount: legitimateNum,
          anomalyPercentage,
          blockedCount: blockedNum,
          allowedCount: allowedNum,
          topThreats: threatsResult.rows.map((r) => ({
            threatName: r.threatName,
            count: parseInt(r.count, 10),
          })),
          topRiskyUsers: usersResult.rows.map((r) => ({
            user: r.user,
            anomalyCount: parseInt(r.anomalyCount, 10),
          })),
          topDepartments: deptResult.rows.map((r) => ({
            department: r.department,
            count: parseInt(r.count, 10),
          })),
        });
      } catch (err) {
        app.log.error(err, "[dashboard/stats] Query failed");
        return reply.status(500).send({ error: "Failed to fetch stats" });
      }
    }
  );

  // ── GET /api/dashboard/:sessionId/piechart ─────────────────────────────────
  app.get(
    "/api/dashboard/:sessionId/piechart",
    {
      schema: {
        tags: ["dashboard"],
        summary: "Get anomaly vs legitimate breakdown for pie chart",
        security: [{ userId: [] }],
        headers: {
          type: "object",
          required: ["x-user-id"],
          properties: {
            "x-user-id": { type: "string", description: "User ID from login" },
          },
        },
        params: {
          type: "object",
          required: ["sessionId"],
          properties: {
            sessionId: { type: "string", format: "uuid" },
          },
        },
        response: {
          200: {
            description: "Pie chart data",
            type: "object",
            properties: {
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name:       { type: "string" },
                    value:      { type: "integer" },
                    percentage: { type: "number" },
                  },
                },
              },
            },
          },
          401: { type: "object", properties: { error: { type: "string" } }, description: "Authentication required" },
          403: { type: "object", properties: { error: { type: "string" } }, description: "Access denied" },
          500: { type: "object", properties: { error: { type: "string" } }, description: "Server error" },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: SessionParams }>,
      reply: FastifyReply
    ) => {
      const userId = requireUserId(request, reply);
      if (!userId) return;
      try {
        const { sessionId } = request.params;
        if (!(await verifySessionOwner(sessionId, userId, reply))) return;

        const result = await pool.query<{
          total: string;
          anomaly: string;
        }>(
          `SELECT
             COUNT(*)                                   AS total,
             COUNT(*) FILTER (WHERE is_anomaly = TRUE) AS anomaly
           FROM zscaler_logs
           WHERE session_id = $1`,
          [sessionId]
        );

        const total = parseInt(result.rows[0].total, 10);
        const anomalyVal = parseInt(result.rows[0].anomaly, 10);
        const legitimateVal = total - anomalyVal;

        const anomalyPct =
          total > 0 ? Math.round((anomalyVal / total) * 10000) / 100 : 0;
        const legitimatePct =
          total > 0 ? Math.round((legitimateVal / total) * 10000) / 100 : 0;

        return reply.send({
          data: [
            {
              name: "Legitimate",
              value: legitimateVal,
              percentage: legitimatePct,
            },
            {
              name: "Anomaly",
              value: anomalyVal,
              percentage: anomalyPct,
            },
          ],
        });
      } catch (err) {
        app.log.error(err, "[dashboard/piechart] Query failed");
        return reply
          .status(500)
          .send({ error: "Failed to fetch pie chart data" });
      }
    }
  );

  // ── GET /api/dashboard/:sessionId/barchart ────────────────────────────────
  app.get(
    "/api/dashboard/:sessionId/barchart",
    {
      schema: {
        tags: ["dashboard"],
        summary: "Get hourly traffic breakdown for bar chart",
        security: [{ userId: [] }],
        headers: {
          type: "object",
          required: ["x-user-id"],
          properties: {
            "x-user-id": { type: "string", description: "User ID from login" },
          },
        },
        params: {
          type: "object",
          required: ["sessionId"],
          properties: {
            sessionId: { type: "string", format: "uuid" },
          },
        },
        response: {
          200: {
            description: "Hourly bar chart data",
            type: "object",
            properties: {
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    hour:        { type: "string", description: "YYYY-MM-DD HH:00" },
                    legitimate:  { type: "integer" },
                    anomalies:   { type: "integer" },
                    total:       { type: "integer" },
                  },
                },
              },
            },
          },
          401: { type: "object", properties: { error: { type: "string" } }, description: "Authentication required" },
          403: { type: "object", properties: { error: { type: "string" } }, description: "Access denied" },
          500: { type: "object", properties: { error: { type: "string" } }, description: "Server error" },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: SessionParams }>,
      reply: FastifyReply
    ) => {
      const userId = requireUserId(request, reply);
      if (!userId) return;
      try {
        const { sessionId } = request.params;
        if (!(await verifySessionOwner(sessionId, userId, reply))) return;

        const result = await pool.query<{
          hour: Date;
          legitimate: string;
          anomalies: string;
          total: string;
        }>(
          `SELECT
             DATE_TRUNC('hour', datetime)                     AS hour,
             COUNT(*) FILTER (WHERE is_anomaly = FALSE)       AS legitimate,
             COUNT(*) FILTER (WHERE is_anomaly = TRUE)        AS anomalies,
             COUNT(*)                                         AS total
           FROM zscaler_logs
           WHERE session_id = $1
             AND datetime IS NOT NULL
           GROUP BY DATE_TRUNC('hour', datetime)
           ORDER BY hour ASC`,
          [sessionId]
        );

        const data = result.rows.map((row) => {
          // Format: "2024-05-06 10:00"
          const d = new Date(row.hour);
          const pad = (n: number) => String(n).padStart(2, "0");
          const hourLabel = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
            d.getDate()
          )} ${pad(d.getHours())}:00`;

          return {
            hour: hourLabel,
            legitimate: parseInt(row.legitimate, 10),
            anomalies: parseInt(row.anomalies, 10),
            total: parseInt(row.total, 10),
          };
        });

        return reply.send({ data });
      } catch (err) {
        app.log.error(err, "[dashboard/barchart] Query failed");
        return reply
          .status(500)
          .send({ error: "Failed to fetch bar chart data" });
      }
    }
  );

  // ── GET /api/dashboard/:sessionId/insights ────────────────────────────────
  app.get(
    "/api/dashboard/:sessionId/insights",
    {
      schema: {
        tags: ["dashboard"],
        summary: "Get AI-derived security insight cards for a session",
        security: [{ userId: [] }],
        headers: {
          type: "object",
          required: ["x-user-id"],
          properties: {
            "x-user-id": { type: "string", description: "User ID from login" },
          },
        },
        params: {
          type: "object",
          required: ["sessionId"],
          properties: {
            sessionId: { type: "string", format: "uuid" },
          },
        },
        response: {
          200: {
            description: "Array of insight cards",
            type: "array",
            items: {
              type: "object",
              properties: {
                id:         { type: "integer" },
                label:      { type: "string" },
                value:      { },
                confidence: { type: "number" },
                severity:   { type: "string", enum: ["critical", "high", "medium", "low"] },
              },
            },
          },
          401: { type: "object", properties: { error: { type: "string" } }, description: "Authentication required" },
          403: { type: "object", properties: { error: { type: "string" } }, description: "Access denied" },
          500: { type: "object", properties: { error: { type: "string" } }, description: "Server error" },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: SessionParams }>,
      reply: FastifyReply
    ) => {
      const userId = requireUserId(request, reply);
      if (!userId) return;
      try {
        const { sessionId } = request.params;
        if (!(await verifySessionOwner(sessionId, userId, reply))) return;
        const sid = sessionId;

        // Fire all queries in parallel for speed
        const [
          aggRow,
          topUserRow,
          topCategoryRow,
          dlpRow,
          sslRow,
          unscannableRow,
          rwRow,
          largestRow,
          topDeptRow,
        ] = await Promise.all([
          // 1 + 2: totals, threats, blocked
          pool.query<{
            total: string;
            threats: string;
            blocked: string;
          }>(
            `SELECT
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE threat_name IS NOT NULL
                                  AND threat_name <> ''
                                  AND LOWER(threat_name) <> 'none')  AS threats,
               COUNT(*) FILTER (WHERE LOWER(action) = 'blocked')     AS blocked
             FROM zscaler_logs WHERE session_id = $1`,
            [sid]
          ),
          // 3: top risky user
          pool.query<{ user_email: string; cnt: string }>(
            `SELECT user_email, COUNT(*) AS cnt
             FROM zscaler_logs
             WHERE session_id = $1 AND is_anomaly = TRUE
               AND user_email IS NOT NULL AND user_email <> ''
             GROUP BY user_email ORDER BY cnt DESC LIMIT 1`,
            [sid]
          ),
          // 4: top blocked category
          pool.query<{ url_category: string; cnt: string }>(
            `SELECT url_category, COUNT(*) AS cnt
             FROM zscaler_logs
             WHERE session_id = $1
               AND LOWER(action) = 'blocked'
               AND url_category IS NOT NULL AND url_category <> ''
             GROUP BY url_category ORDER BY cnt DESC LIMIT 1`,
            [sid]
          ),
          // 5: DLP violations
          pool.query<{ cnt: string }>(
            `SELECT COUNT(*) AS cnt FROM zscaler_logs
             WHERE session_id = $1
               AND dlp_engine IS NOT NULL AND dlp_engine <> ''
               AND LOWER(dlp_engine) <> 'none'`,
            [sid]
          ),
          // 6: SSL bypass events (url_category contains Bypass / DNI)
          pool.query<{ cnt: string }>(
            `SELECT COUNT(*) AS cnt FROM zscaler_logs
             WHERE session_id = $1
               AND (url_category ILIKE '%bypass%' OR url_category ILIKE '%DNI%')`,
            [sid]
          ),
          // 7: Unscannable transfers
          pool.query<{ cnt: string }>(
            `SELECT COUNT(*) AS cnt FROM zscaler_logs
             WHERE session_id = $1
               AND (url_category ILIKE '%unscannable%'
                    OR app_class  ILIKE '%unscannable%'
                    OR LOWER(action) = 'unscannable')`,
            [sid]
          ),
          // 8: Road Warrior activity (non-empty distinct remote locations)
          pool.query<{ cnt: string }>(
            `SELECT COUNT(*) AS cnt FROM zscaler_logs
             WHERE session_id = $1
               AND location IS NOT NULL AND location <> ''`,
            [sid]
          ),
          // 9: Largest single transaction
          pool.query<{ user_email: string; transaction_size: string }>(
            `SELECT user_email, transaction_size
             FROM zscaler_logs
             WHERE session_id = $1
             ORDER BY transaction_size DESC NULLS LAST
             LIMIT 1`,
            [sid]
          ),
          // 10: Most active department
          pool.query<{ department: string; cnt: string }>(
            `SELECT department, COUNT(*) AS cnt
             FROM zscaler_logs
             WHERE session_id = $1
               AND department IS NOT NULL AND department <> ''
             GROUP BY department ORDER BY cnt DESC LIMIT 1`,
            [sid]
          ),
        ]);

        // ── Derived values ─────────────────────────────────────────────────
        const total   = parseInt(aggRow.rows[0]?.total   ?? "0", 10);
        const threats = parseInt(aggRow.rows[0]?.threats ?? "0", 10);
        const blocked = parseInt(aggRow.rows[0]?.blocked ?? "0", 10);
        const blockRate =
          total > 0
            ? `${((blocked / total) * 100).toFixed(1)}%`
            : "0.0%";

        const topUser = topUserRow.rows[0];
        const topUserValue = topUser
          ? `${topUser.user_email} (${topUser.cnt} threats)`
          : "No anomalies";

        const topCat = topCategoryRow.rows[0];
        const topCatValue = topCat
          ? `${topCat.url_category} (${topCat.cnt})`
          : "None";

        const dlp          = parseInt(dlpRow.rows[0]?.cnt          ?? "0", 10);
        const ssl          = parseInt(sslRow.rows[0]?.cnt          ?? "0", 10);
        const unscannable  = parseInt(unscannableRow.rows[0]?.cnt  ?? "0", 10);
        const rw           = parseInt(rwRow.rows[0]?.cnt           ?? "0", 10);

        const largestRow0 = largestRow.rows[0];
        const largestBytes = parseInt(largestRow0?.transaction_size ?? "0", 10);
        const largestMb = largestBytes > 0
          ? `${(largestBytes / (1024 * 1024)).toFixed(2)} MB by ${largestRow0?.user_email ?? "unknown"}`
          : "No data";

        const topDept = topDeptRow.rows[0];
        const topDeptValue = topDept
          ? `${topDept.department} (${topDept.cnt} reqs)`
          : "No data";

        return reply.send([
          {
            id: 1,
            label: "Total Threats Detected",
            value: threats,
            confidence: 95,
            severity: "critical",
          },
          {
            id: 2,
            label: "Block Rate",
            value: blockRate,
            confidence: 99,
            severity: "high",
          },
          {
            id: 3,
            label: "Top Risky User",
            value: topUserValue,
            confidence: 80,
            severity: "high",
          },
          {
            id: 4,
            label: "Top Blocked Category",
            value: topCatValue,
            confidence: 82,
            severity: "high",
          },
          {
            id: 5,
            label: "DLP Violations",
            value: dlp,
            confidence: 85,
            severity: "high",
          },
          {
            id: 6,
            label: "SSL Bypass Events",
            value: ssl,
            confidence: 90,
            severity: "medium",
          },
          {
            id: 7,
            label: "Unscannable Transfers",
            value: unscannable,
            confidence: 72,
            severity: "medium",
          },
          {
            id: 8,
            label: "Road Warrior Activity",
            value: rw,
            confidence: 88,
            severity: "medium",
          },
          {
            id: 9,
            label: "Largest Transaction",
            value: largestMb,
            confidence: 96,
            severity: "low",
          },
          {
            id: 10,
            label: "Most Active Department",
            value: topDeptValue,
            confidence: 78,
            severity: "low",
          },
        ]);
      } catch (err) {
        app.log.error(err, "[dashboard/insights] Query failed");
        return reply.status(500).send({ error: "Failed to fetch insights" });
      }
    }
  );
}
