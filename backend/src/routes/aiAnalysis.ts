import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import OpenAI from "openai";

// ---------------------------------------------------------------------------
// OpenAI client — instantiated lazily so the key is read after dotenv loads
// ---------------------------------------------------------------------------
let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const key = process.env.OPENAI_API_KEY;
    if (!key || key === "your_openai_api_key_here") {
      throw new Error(
        "OPENAI_API_KEY is not configured. Set it in backend/.env"
      );
    }
    _client = new OpenAI({ apiKey: key });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Request body shape (mirrors ZscalerLog on the frontend)
// ---------------------------------------------------------------------------
interface LogPayload {
  id: string;
  datetime: string;
  userEmail: string;
  clientIp: string;
  url: string;
  action: string;
  urlCategory: string;
  urlClass: string;
  threatName: string;
  threatSeverity: string;
  department: string;
  transactionSize: number;
  requestMethod: string;
  statusCode: string;
  dlpEngine: string;
  useragent: string;
  location: string;
  appName: string;
  appClass: string;
  isAnomaly: boolean;
  anomalyConfidence: number;
  anomalyReason: string;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------
function buildPrompt(log: LogPayload): string {
  const txKb = log.transactionSize
    ? `${(log.transactionSize / 1024).toFixed(1)} KB`
    : "unknown";

  const anomalyLine = log.isAnomaly
    ? `Yes — Rule triggered: "${log.anomalyReason}" (confidence ${log.anomalyConfidence}%)`
    : "No anomaly detected by rule engine";

  return `You are a senior SOC analyst reviewing a single Zscaler web proxy log entry. \
Provide a concise, professional, 2-sentence security analysis: the first sentence must \
summarise the threat/risk present (or confirm the request is benign), and the second must \
state the recommended SOC action or next step. Be factual, specific, and use the exact \
values from the log data. Do not add bullet points, markdown formatting, or extra sentences.

LOG DETAILS:
  Timestamp      : ${log.datetime}
  User           : ${log.userEmail}
  Department     : ${log.department || "unknown"}
  Source IP      : ${log.clientIp}
  Destination URL: ${log.url}
  HTTP Method    : ${log.requestMethod}
  Response Code  : ${log.statusCode}
  Gateway Action : ${log.action}
  URL Category   : ${log.urlCategory}
  URL Class      : ${log.urlClass}
  App Name       : ${log.appName} (${log.appClass})
  Threat Name    : ${log.threatName || "None"}
  Threat Severity: ${log.threatSeverity || "None"}
  DLP Engine     : ${log.dlpEngine || "None triggered"}
  Transaction    : ${txKb}
  User Agent     : ${log.useragent || "unknown"}
  Location       : ${log.location || "unknown"}
  Anomaly Flag   : ${anomalyLine}`;
}

// Allowed GPT models
const ALLOWED_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-3.5-turbo",
  "gpt-4-turbo",
] as const;
type AllowedModel = (typeof ALLOWED_MODELS)[number];

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

const LogPayloadSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id:                 { type: 'string' },
    datetime:           { type: 'string' },
    userEmail:          { type: 'string' },
    clientIp:           { type: 'string' },
    url:                { type: 'string' },
    action:             { type: 'string' },
    urlCategory:        { type: 'string' },
    urlClass:           { type: 'string' },
    threatName:         { type: 'string' },
    threatSeverity:     { type: 'string' },
    department:         { type: 'string' },
    transactionSize:    { type: 'number' },
    requestMethod:      { type: 'string' },
    statusCode:         { type: 'string' },
    dlpEngine:          { type: 'string' },
    useragent:          { type: 'string' },
    location:           { type: 'string' },
    appName:            { type: 'string' },
    appClass:           { type: 'string' },
    isAnomaly:          { type: 'boolean' },
    anomalyConfidence:  { type: 'number' },
    anomalyReason:      { type: 'string' },
  },
} as const;

export async function aiAnalysisRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/ai/analyze-log
   * Body: { log: LogPayload, model?: string }
   * Response: { analysis: string, model: string }
   */
  app.post(
    "/api/ai/analyze-log",
    {
      schema: {
        tags: ['ai'],
        summary: 'Run GPT analysis on a single log entry',
        security: [{ userId: [] }],
        body: {
          type: 'object',
          required: ['log'],
          properties: {
            log:   LogPayloadSchema,
            model: {
              type: 'string',
              enum: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo', 'gpt-4-turbo'],
              default: 'gpt-4o-mini',
              description: 'OpenAI model to use',
            },
          },
        },
        response: {
          200: {
            description: 'AI analysis result',
            type: 'object',
            properties: {
              analysis: { type: 'string', description: '2-sentence SOC analysis' },
              model:    { type: 'string' },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } }, description: 'Missing log payload' },
          502: { type: 'object', properties: { error: { type: 'string' } }, description: 'AI service unavailable' },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { log: LogPayload; model?: string } }>,
      reply: FastifyReply
    ) => {
      const { log, model: requestedModel } = request.body;

      if (!log || !log.id) {
        return reply.status(400).send({ error: "Missing log payload" });
      }

      // Validate or fall back to default model
      const model: AllowedModel =
        ALLOWED_MODELS.includes(requestedModel as AllowedModel)
          ? (requestedModel as AllowedModel)
          : "gpt-4o-mini";

      try {
        const client = getClient();

        const completion = await client.chat.completions.create({
          model,
          temperature: 0.2,
          max_tokens: 160,
          messages: [
            {
              role: "user",
              content: buildPrompt(log),
            },
          ],
        });

        const analysis =
          completion.choices[0]?.message?.content?.trim() ??
          "Unable to generate analysis.";

        return reply.send({ analysis, model });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "AI analysis failed";
        console.error("[ai/analyze-log]", message);

        // Surface a friendly error — don't leak stack traces
        return reply.status(502).send({
          error:
            message.includes("OPENAI_API_KEY")
              ? message
              : "AI analysis service is unavailable. Check your OPENAI_API_KEY.",
        });
      }
    }
  );
}
