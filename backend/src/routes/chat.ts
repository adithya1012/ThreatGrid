import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { pool } from '../db/client';
import { runAgentLoop } from '../mcp/orchestrator';

// ── Auth helpers (mirrors dashboard.ts) ───────────────────────────────────

function requireUserId(request: FastifyRequest, reply: FastifyReply): string | null {
  const userId = request.headers['x-user-id'] as string | undefined;
  if (!userId) {
    reply.status(401).send({ error: 'Authentication required' });
    return null;
  }
  return userId;
}

async function verifySessionOwner(
  sessionId: string,
  userId: string,
  reply: FastifyReply
): Promise<boolean> {
  const check = await pool.query(
    'SELECT id FROM upload_sessions WHERE id = $1 AND user_id = $2',
    [sessionId, userId]
  );
  if (check.rows.length === 0) {
    reply.status(403).send({ error: 'Access denied or session not found' });
    return false;
  }
  return true;
}

// ── SSE helpers ────────────────────────────────────────────────────────────

function sseEvent(res: import('http').ServerResponse, type: string, data: unknown): void {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  res.write(`event: ${type}\ndata: ${payload}\n\n`);
}

// ── Route bodies ───────────────────────────────────────────────────────────

interface ChatPostBody {
  message: string;
  pageContext?: Record<string, unknown>;
}

interface ChatParams {
  sessionId: string;
}

// ── Route plugin ───────────────────────────────────────────────────────────

export async function chatRoutes(app: FastifyInstance): Promise<void> {

  // ── POST /api/chat/:sessionId — streams AI response via SSE ──────────────
  app.post<{ Params: ChatParams; Body: ChatPostBody }>(
    '/api/chat/:sessionId',    {
      schema: {
        tags: ['chat'],
        summary: 'Send a message and receive a streaming SSE AI response',
        security: [{ userId: [] }],
        headers: {
          type: 'object',
          required: ['x-user-id'],
          properties: {
            'x-user-id': { type: 'string', description: 'User ID from login' },
          },
        },
        params: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string', format: 'uuid', description: 'Upload session ID' },
          },
        },
        body: {
          type: 'object',
          required: ['message'],
          properties: {
            message:     { type: 'string', minLength: 1, description: 'User\'s question for the AI analyst' },
            pageContext: { type: 'object', additionalProperties: true, description: 'Optional page state context' },
          },
        },
        response: {
          200: {
            description: 'Server-Sent Events stream (text/event-stream). Events: text | tool_call | done | error',
            type: 'string',
          },
          400: { type: 'object', properties: { error: { type: 'string' } }, description: 'Missing message' },
          401: { type: 'object', properties: { error: { type: 'string' } }, description: 'Authentication required' },
          403: { type: 'object', properties: { error: { type: 'string' } }, description: 'Access denied' },
        },
      },
    },    async (request: FastifyRequest<{ Params: ChatParams; Body: ChatPostBody }>, reply: FastifyReply) => {
      const userId = requireUserId(request, reply);
      if (!userId) return;

      const { sessionId } = request.params;
      const { message, pageContext = {} } = request.body ?? {};

      if (!message || typeof message !== 'string' || message.trim() === '') {
        return reply.status(400).send({ error: '"message" is required' });
      }

      const isOwner = await verifySessionOwner(sessionId, userId, reply);
      if (!isOwner) return;

      // ── Save the user message ─────────────────────────────────────────────
      await pool.query(
        `INSERT INTO chat_messages (session_id, user_id, role, content, page_context)
         VALUES ($1, $2, 'user', $3, $4)`,
        [sessionId, userId, message.trim(), JSON.stringify(pageContext)]
      );

      // ── Switch to raw SSE mode ────────────────────────────────────────────
      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',   // disable nginx buffering
      });
      // Flush immediately so the browser opens the event stream
      raw.write(':\n\n');

      // ── Run the agentic loop ──────────────────────────────────────────────
      let toolsUsed: Array<{ tool: string; args: Record<string, unknown> }> = [];

      try {
        const result = await runAgentLoop({
          sessionId,
          userMessage: message.trim(),
          onToolCall: (msg) => {
            sseEvent(raw, 'tool_call', { message: msg });
          },
          onChunk: (chunk) => {
            sseEvent(raw, 'text', { chunk });
          },
        });

        toolsUsed = result.toolCallLog.map(({ tool, args }) => ({ tool, args }));

        // ── Save the assistant message ──────────────────────────────────────
        await pool.query(
          `INSERT INTO chat_messages (session_id, user_id, role, content, tools_used)
           VALUES ($1, $2, 'assistant', $3, $4)`,
          [
            sessionId,
            userId,
            result.answer,
            JSON.stringify(toolsUsed),
          ]
        );

        // Signal completion
        sseEvent(raw, 'done', { message: 'Analysis complete' });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[chat] runAgentLoop error: ${errorMsg}`);
        sseEvent(raw, 'error', { message: errorMsg });
      } finally {
        raw.end();
      }
    }
  );

  // ── GET /api/chat/:sessionId/history ─────────────────────────────────────
  app.get<{ Params: ChatParams }>(
    '/api/chat/:sessionId/history',    {
      schema: {
        tags: ['chat'],
        summary: 'Get chat message history for a session (last 50 messages)',
        security: [{ userId: [] }],
        headers: {
          type: 'object',
          required: ['x-user-id'],
          properties: {
            'x-user-id': { type: 'string', description: 'User ID from login' },
          },
        },
        params: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            description: 'Chat messages',
            type: 'object',
            properties: {
              messages: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id:           { type: 'string' },
                    role:         { type: 'string', enum: ['user', 'assistant'] },
                    content:      { type: 'string' },
                    tools_used:   { type: 'array', items: { type: 'object', additionalProperties: true } },
                    page_context: { type: 'object', additionalProperties: true },
                    created_at:   { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          401: { type: 'object', properties: { error: { type: 'string' } }, description: 'Authentication required' },
          403: { type: 'object', properties: { error: { type: 'string' } }, description: 'Access denied' },
        },
      },
    },    async (request: FastifyRequest<{ Params: ChatParams }>, reply: FastifyReply) => {
      const userId = requireUserId(request, reply);
      if (!userId) return;

      const { sessionId } = request.params;

      const isOwner = await verifySessionOwner(sessionId, userId, reply);
      if (!isOwner) return;

      const result = await pool.query(
        `SELECT id, role, content, tools_used, page_context, created_at
         FROM chat_messages
         WHERE session_id = $1
           AND user_id    = $2
         ORDER BY created_at ASC
         LIMIT 50`,
        [sessionId, userId]
      );

      return reply.send({ messages: result.rows });
    }
  );
}
