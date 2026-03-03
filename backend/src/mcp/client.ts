/**
 * MCP Client wrapper for the ThreatGrid backend.
 *
 * Connects to the mcp-server container via SSE transport and exposes two
 * helper functions consumed by the orchestrator:
 *   listTools()         → OpenAI-formatted tool definitions
 *   callTool(name,args) → text result (or error string)
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

// ── Types ──────────────────────────────────────────────────────────────────

/** OpenAI function-calling tool definition */
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// ── Config ─────────────────────────────────────────────────────────────────

function getMcpUrl(): string {
  return process.env.MCP_SERVER_URL ?? 'http://mcp-server:3002';
}

// ── Connection factory ─────────────────────────────────────────────────────
// Each call gets a fresh Client + transport. SSE connections are lightweight
// and this avoids stale-connection issues across Docker restarts.

async function createConnectedClient(): Promise<Client> {
  const baseUrl = getMcpUrl();
  const sseUrl = new URL('/sse', baseUrl);

  const transport = new SSEClientTransport(sseUrl);
  const client = new Client({ name: 'threatgrid-backend', version: '1.0.0' });

  await client.connect(transport);
  return client;
}

// ── listTools ──────────────────────────────────────────────────────────────

/**
 * Fetches all tool definitions from the MCP server and returns them in
 * OpenAI's function-calling format.
 */
export async function listTools(): Promise<OpenAITool[]> {
  const client = await createConnectedClient();

  try {
    const { tools } = await client.listTools();

    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description ?? '',
        // MCP inputSchema is already JSON Schema — forward it directly.
        // Fall back to an empty object schema if undefined.
        parameters: (tool.inputSchema ?? { type: 'object', properties: {} }) as Record<
          string,
          unknown
        >,
      },
    }));
  } finally {
    await client.close().catch(() => undefined);
  }
}

// ── callTool ───────────────────────────────────────────────────────────────

/**
 * Calls a tool by name with the given argument object.
 * Returns the concatenated text content from the MCP response, or an error
 * message string so the LLM can see what went wrong.
 */
export async function callTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const client = await createConnectedClient();

  try {
    const result = await client.callTool({ name, arguments: args });

    // MCP content is an array of typed blocks; extract text blocks.
    if (Array.isArray(result.content)) {
      const textParts = result.content
        .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
        .map((block) => block.text);

      if (textParts.length > 0) return textParts.join('\n');
    }

    // Fallback: stringify whatever we got
    return JSON.stringify(result.content ?? result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[mcp/client] callTool("${name}") failed: ${message}`);
    // Return error as a string so the LLM can observe it and decide what to do
    return `Tool error: ${message}`;
  } finally {
    await client.close().catch(() => undefined);
  }
}
