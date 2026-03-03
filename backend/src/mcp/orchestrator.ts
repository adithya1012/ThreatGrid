/**
 * OpenAI agentic loop orchestrator — streaming edition.
 *
 * Drives a multi-turn conversation where the LLM can invoke MCP tools
 * (get_db_context, run_read_query) to analyse a specific upload session
 * and streams the final answer back via optional callbacks.
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { listTools, callTool } from './client';

// ── Lazy OpenAI client ─────────────────────────────────────────────────────

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    const key = process.env.OPENAI_API_KEY;
    if (!key || key === 'your_openai_api_key_here') {
      throw new Error('OPENAI_API_KEY is not configured. Set it in backend/.env');
    }
    _openai = new OpenAI({ apiKey: key });
  }
  return _openai;
}

// ── System prompt ──────────────────────────────────────────────────────────

function buildSystemPrompt(sessionId: string): string {
  return `You are ThreatGrid AI, an expert cybersecurity analyst specialising in \
Zscaler web-proxy logs. You are investigating the upload session \`${sessionId}\`.

## Mandatory workflow

1. **Call \`get_db_context\` FIRST** before writing any SQL query.
   - Pass the session_id: \`${sessionId}\`
   - Read the returned column names, data types, and sample values carefully.
   - Do NOT assume column values — always use the values returned by this tool.

2. **Call \`run_read_query\` to retrieve data.**
   - Write a SELECT query against the \`zscaler_logs\` table.
   - **Do NOT include session_id in your WHERE clause** — it is injected automatically.
   - Respect the column names exactly as returned by get_db_context.
   - You may call run_read_query multiple times with different queries.

## Response requirements

- Respond in **Markdown**.
- Use **tables** for lists of logs, IPs, users, URLs, or counts.
- **Prioritise critical and high-severity anomalies first.**
- For every suspicious item, explain **why it is suspicious** — not just what it is:
  - What behaviour pattern does it represent?
  - What is the likely attacker intent or risk?
  - What should the SOC analyst do next?
- Do NOT say "I cannot query the database" — you have tools for that.
- Do NOT expose the raw injected session_id clause to the user.`;
}

// ── Human-readable tool-call messages ─────────────────────────────────────

function toolCallMessage(toolName: string, toolArgs: Record<string, unknown>): string {
  switch (toolName) {
    case 'get_db_context':
      return '📋 Reading database schema...';
    case 'run_read_query': {
      const reason = typeof toolArgs['reason'] === 'string' ? toolArgs['reason'] : 'Analysing data';
      return `🔍 Running query: ${reason}`;
    }
    default:
      return `⚙️ Calling tool: ${toolName}`;
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface OrchestratorOptions {
  /** The upload session UUID to analyse */
  sessionId: string;
  /** Natural-language question from the analyst */
  userMessage: string;
  /** OpenAI model to use (default: gpt-4o) */
  model?: string;
  /** Max agentic iterations before giving up (default: 10) */
  maxIterations?: number;
  /** Called when a tool is being invoked, with a human-readable description */
  onToolCall?: (message: string) => void;
  /** Called for each streamed text chunk of the final answer */
  onChunk?: (chunk: string) => void;
}

export interface OrchestratorResult {
  /** Complete Markdown answer (all chunks joined) */
  answer: string;
  /** Tools that were called during the run, for debugging / persistence */
  toolCallLog: Array<{ tool: string; args: Record<string, unknown>; result: string }>;
}

// ── Agentic loop ───────────────────────────────────────────────────────────

export async function runAgentLoop(opts: OrchestratorOptions): Promise<OrchestratorResult> {
  const {
    sessionId,
    userMessage,
    model = 'gpt-4o',
    maxIterations = 10,
    onToolCall,
    onChunk,
  } = opts;

  const openai = getOpenAI();
  const toolCallLog: OrchestratorResult['toolCallLog'] = [];

  // 1. Fetch tool definitions from MCP server
  const tools = await listTools();
  console.log(
    `[orchestrator] Loaded ${tools.length} MCP tools: ${tools.map((t) => t.function.name).join(', ')}`
  );

  // 2. Build initial conversation
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: buildSystemPrompt(sessionId) },
    { role: 'user', content: userMessage },
  ];

  let fullAnswer = '';

  // 3. Agentic loop
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    console.log(`[orchestrator] Iteration ${iteration + 1}/${maxIterations}`);

    // Streaming completion — lets us call onChunk for text deltas
    const stream = await openai.chat.completions.create({
      model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      stream: true,
    });

    // Accumulate streamed output
    let iterationContent = '';
    // Map from tool-call index → accumulated fields
    const tcAccumulator = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();
    let finishReason: string | null = null;

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      finishReason = choice.finish_reason ?? finishReason;
      const delta = choice.delta;

      // Text content delta
      if (delta.content) {
        iterationContent += delta.content;
        fullAnswer += delta.content;
        onChunk?.(delta.content);
      }

      // Tool-call deltas — accumulate by index
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const acc = tcAccumulator.get(tc.index) ?? {
            id: '',
            name: '',
            arguments: '',
          };
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.name += tc.function.name;
          if (tc.function?.arguments) acc.arguments += tc.function.arguments;
          tcAccumulator.set(tc.index, acc);
        }
      }
    }

    const toolCalls = [...tcAccumulator.values()];

    // Build the assistant message for history
    const assistantMessage: ChatCompletionMessageParam =
      toolCalls.length > 0
        ? {
            role: 'assistant',
            content: iterationContent || null,
            tool_calls: toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: tc.arguments },
            })),
          }
        : { role: 'assistant', content: iterationContent };
    messages.push(assistantMessage);

    // No tool calls → final answer is done
    if (toolCalls.length === 0 || finishReason === 'stop') {
      console.log(`[orchestrator] Finished after ${iteration + 1} iteration(s).`);
      return { answer: fullAnswer, toolCallLog };
    }

    // Execute each tool call
    for (const tc of toolCalls) {
      let toolArgs: Record<string, unknown> = {};
      try {
        toolArgs = JSON.parse(tc.arguments) as Record<string, unknown>;
      } catch {
        toolArgs = {};
      }

      const humanMsg = toolCallMessage(tc.name, toolArgs);
      console.log(`[orchestrator] ${humanMsg}`);
      onToolCall?.(humanMsg);

      // Always inject session_id server-side
      const argsWithSession: Record<string, unknown> = {
        ...toolArgs,
        session_id: sessionId,
      };

      const toolResult = await callTool(tc.name, argsWithSession);
      toolCallLog.push({ tool: tc.name, args: toolArgs, result: toolResult });

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: toolResult,
      });
    }
  }

  // Max iterations reached
  console.warn(`[orchestrator] Hit maxIterations (${maxIterations}). Returning partial result.`);
  return {
    answer: fullAnswer || 'Analysis incomplete: maximum reasoning steps reached.',
    toolCallLog,
  };
}

/** @deprecated Use runAgentLoop instead */
export const runAnalysis = runAgentLoop;

