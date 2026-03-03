import Fastify from 'fastify';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { getDbContext } from './tools/getDbContext.js';
import { runReadQuery } from './tools/runReadQuery.js';

const PORT = parseInt(process.env.MCP_SERVER_PORT ?? '3002', 10);

// ── MCP Server ─────────────────────────────────────────────────────────────
const mcpServer = new McpServer({
  name: 'threatgrid-mcp',
  version: '1.0.0',
});

// ── Tool: get_db_context ─────────────────────────────────────────────────────
mcpServer.registerTool(
  'get_db_context',
  {
    description:
      'Call this FIRST before writing any SQL query. ' +
      'Given a session_id, returns every column name, its data type, nullability, ' +
      'and up to 10 distinct non-null values that exist in zscaler_logs for that session. ' +
      'Use this to discover what data is available before constructing a run_read_query call.',
    // Cast to any: prevents TypeScript from recursively resolving Zod generics
    // (causes TS2589 / infinite type-resolution hang with MCP SDK v1.27+ + TS 5.9)
    inputSchema: { session_id: z.string().describe('The upload session UUID to inspect') } as any,
  },
  async ({ session_id }: { session_id: string }) => {
    console.log(`[get_db_context] session_id=${session_id}`);
    try {
      const result = await getDbContext(session_id);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[get_db_context] error: ${message}`);
      return {
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: run_read_query ─────────────────────────────────────────────────────
mcpServer.registerTool(
  'run_read_query',
  {
    description:
      'Execute a read-only SELECT query against the zscaler_logs table. ' +
      'Do NOT include session_id in your WHERE clause — it is injected automatically. ' +
      'Only SELECT statements are permitted; no INSERT / UPDATE / DELETE / DDL. ' +
      'Include a "reason" describing why you are running this query. ' +
      'Results are capped at 200 rows.',
    // Cast to any: prevents TypeScript from recursively resolving Zod generics
    // (causes TS2589 / infinite type-resolution hang with MCP SDK v1.27+ + TS 5.9)
    inputSchema: {
      query: z.string().describe('A SELECT SQL query against zscaler_logs. Do NOT include session_id in WHERE.'),
      reason: z.string().describe('A short explanation of why this query is being run.'),
      session_id: z.string().describe('The upload session UUID — used internally to scope results.'),
    } as any,
  },
  async ({ query, reason, session_id }: { query: string; reason: string; session_id: string }) => {
    console.log(`[run_read_query] reason="${reason}" | session_id=${session_id}`);
    try {
      const result = await runReadQuery(query, reason, session_id);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[run_read_query] error: ${message}`);
      return {
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  }
);

// ── Fastify HTTP server (SSE transport) ────────────────────────────────────
const fastify = Fastify({ logger: false });

// Track active transports by session ID so POST /messages can route correctly
const transports = new Map<string, SSEServerTransport>();

// SSE endpoint — one persistent connection per client
// reply.hijack() hands full control of the raw socket to SSEServerTransport
fastify.get('/sse', async (request, reply) => {
  console.log('[mcp-server] New SSE connection');
  reply.hijack();

  const transport = new SSEServerTransport('/messages', reply.raw);
  transports.set(transport.sessionId, transport);

  request.raw.on('close', () => {
    console.log(`[mcp-server] SSE connection closed (session=${transport.sessionId})`);
    transports.delete(transport.sessionId);
  });

  await mcpServer.connect(transport);
});

// Message endpoint — client posts JSON-RPC messages here
fastify.post<{ Querystring: { sessionId?: string }; Body: unknown }>(
  '/messages',
  async (request, reply) => {
    const { sessionId } = request.query;
    if (!sessionId) {
      return reply.status(400).send({ error: 'Missing sessionId query parameter' });
    }

    const transport = transports.get(sessionId);
    if (!transport) {
      return reply.status(404).send({ error: `No active SSE session: ${sessionId}` });
    }

    // Hand raw req/res to the MCP transport; pass already-parsed body as third arg
    reply.hijack();
    await transport.handlePostMessage(request.raw, reply.raw, request.body);
  }
);

// Health check
fastify.get('/health', async (_request, reply) => {
  return reply.send({ status: 'ok', service: 'mcp-server', port: PORT });
});

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error('[mcp-server] Failed to start:', err);
    process.exit(1);
  }
  console.log(`[mcp-server] Listening on port ${PORT}`);
  console.log('[mcp-server] SSE endpoint: GET  /sse');
  console.log('[mcp-server] Msg endpoint: POST /messages?sessionId=<id>');
  console.log('[mcp-server] Health check: GET  /health');
});
