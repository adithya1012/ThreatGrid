import Fastify, { FastifyError, FastifyRequest, FastifyReply } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import dotenv from "dotenv";
import { testConnection, pool } from "./db/client";
import { uploadRoutes } from "./routes/upload";
import { dashboardRoutes } from "./routes/dashboard";
import { generateCsvRoutes } from "./routes/generateCsv";
import { aiAnalysisRoutes } from "./routes/aiAnalysis";
import { mlAnalysisRoutes } from "./routes/mlAnalysis";
import { authRoutes } from "./routes/auth";
import { chatRoutes } from "./routes/chat";
import { listTools } from "./mcp/client";
import fs from "fs";
import path from "path";

dotenv.config();

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const BODY_LIMIT = 50 * 1024 * 1024; // 50 MB

async function buildServer() {
  const app = Fastify({
    logger: false, // we handle request logging manually below
    bodyLimit: BODY_LIMIT,
  });

  // ── Request / response logger ──────────────────────────────────────────────
  app.addHook(
    "onResponse",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ms = (reply.elapsedTime ?? 0).toFixed(1);
      // eslint-disable-next-line no-console
      console.log(
        `[${new Date().toISOString()}] ${request.method} ${request.url} → ${reply.statusCode} (${ms} ms)`
      );
    }
  );

  // ── Global error handler ───────────────────────────────────────────────────
  app.setErrorHandler(
    (error: FastifyError, _request: FastifyRequest, reply: FastifyReply) => {
      const statusCode = error.statusCode ?? 500;
      // eslint-disable-next-line no-console
      console.error(`[ERROR] ${error.message}`);
      return reply.status(statusCode).send({
        error: error.message ?? "Internal server error",
        statusCode,
      });
    }
  );

  // ── Swagger / OpenAPI docs ──────────────────────────────────────────────────
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'ThreatGrid SOC API',
        description: 'REST API for the ThreatGrid Security Operations Center. Authenticate by passing the user id in the `x-user-id` header (returned by `/api/auth/login`).',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          userId: {
            type: 'apiKey',
            in: 'header',
            name: 'x-user-id',
            description: 'User ID returned by the login endpoint',
          },
        },
      },
      security: [{ userId: [] }],
      tags: [
        { name: 'auth',      description: 'Authentication' },
        { name: 'upload',    description: 'CSV upload & sessions' },
        { name: 'dashboard', description: 'Dashboard stats & charts' },
        { name: 'logs',      description: 'Log entries (SOC Table)' },
        { name: 'chat',      description: 'AI analyst chat (SSE streaming)' },
        { name: 'ai',        description: 'Per-row AI analysis' },
        { name: 'ml',        description: 'Per-row ML analysis' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      displayRequestDuration: true,
    },
  });

  // Register CORS – only allow the Vite dev server
  await app.register(cors, {
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-user-id"],
    credentials: true,
  });

  // Register multipart for file upload support (50 MB limit)
  await app.register(multipart, {
    limits: {
      fileSize: BODY_LIMIT,
    },
  });

  // Health check route
  app.get("/health", async (_request, _reply) => {
    return { status: "ok" };
  });

  // API routes
  await app.register(authRoutes);
  await app.register(uploadRoutes);
  await app.register(dashboardRoutes);
  await app.register(generateCsvRoutes);
  await app.register(aiAnalysisRoutes);
  await app.register(mlAnalysisRoutes);
  await app.register(chatRoutes);

  return app;
}

async function main() {
  const app = await buildServer();

  try {
    await testConnection();

    // Apply / migrate schema on startup (idempotent — all statements use IF NOT EXISTS)
    const schemaPath = path.join(__dirname, 'db', 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(schemaSql);
      await client.query('COMMIT');
      console.log('[server] Schema migration applied.');
    } catch (migrateErr) {
      await client.query('ROLLBACK');
      console.error('[server] Schema migration failed:', migrateErr);
    } finally {
      client.release();
    }

    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`[server] Listening on http://0.0.0.0:${PORT}`);

    // ── MCP Server connectivity probe ────────────────────────────────────────
    // Run after the HTTP server starts so startup isn't blocked by a slow MCP
    // container. Chat will fail gracefully if MCP is unreachable.
    listTools()
      .then((tools) => {
        const names = tools.map((t) => t.function.name).join(', ');
        console.log(`[mcp] Connected — available tools: ${names}`);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[mcp] WARNING: Could not reach MCP server (${msg}). Chat endpoints will fail until MCP is available.`);
      });
  } catch (err) {
    console.error('[server] Startup failed:', err);
    process.exit(1);
  }
}

main();
