import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

// ---------------------------------------------------------------------------
// HuggingFace Inference Endpoint
// ---------------------------------------------------------------------------
const HF_ENDPOINT =
  process.env.HF_ENDPOINT_URL ??
  "https://nqcv1ck753yf6ve0.us-east-1.aws.endpoints.huggingface.cloud";
//   "https://xye656ampc7oko0o.us-east-1.aws.endpoints.huggingface.cloud"
  

// ---------------------------------------------------------------------------
// Request body shape
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
// HuggingFace response shapes (handles common variants)
// ---------------------------------------------------------------------------
interface HFLabelScore {
  label: string;
  score: number;
}

type HFResponse =
  | HFLabelScore[]               // [{ label, score }]
  | HFLabelScore[][]             // [[{ label, score }]]
  | { label: string; score: number } // single object
  | { predictions: HFLabelScore[] };

/**
 * Normalise whatever the HuggingFace model returns into a flat list of
 * { label, score } pairs so the caller doesn't have to care about shape.
 */
function normalizeHFResponse(raw: HFResponse): HFLabelScore[] {
  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];
    // [[{label,score},...]] — nested array
    if (Array.isArray(raw[0])) {
      return (raw as HFLabelScore[][])[0];
    }
    // [{label,score},...] — flat array
    return raw as HFLabelScore[];
  }
  // { predictions: [...] }
  if ("predictions" in raw && Array.isArray(raw.predictions)) {
    return raw.predictions;
  }
  // single { label, score }
  if ("label" in raw && "score" in raw) {
    return [raw as HFLabelScore];
  }
  return [];
}

/**
 * Convert a ZscalerLog object into a natural-language sentence that a
 * text classification model can understand.
 */
function buildNaturalLanguage(log: LogPayload): string {
  const txKb = log.transactionSize
    ? `${(log.transactionSize / 1024).toFixed(1)} KB`
    : "unknown size";

  const parts: string[] = [
    `User ${log.userEmail || "unknown"} from IP ${log.clientIp || "unknown"}`,
    `in department ${log.department || "unknown"}`,
    `sent a ${log.requestMethod || "GET"} request to ${log.url || "unknown URL"}`,
    `via ${log.appName || "unknown app"} (${log.appClass || "unknown class"}).`,
    `Gateway action: ${log.action || "unknown"}.`,
    `Response code: ${log.statusCode || "unknown"}.`,
    `URL category: ${log.urlCategory || "none"}.`,
    `URL class: ${log.urlClass || "none"}.`,
    `Threat name: ${log.threatName || "none"}.`,
    `Threat severity: ${log.threatSeverity || "none"}.`,
    `DLP engine: ${log.dlpEngine || "none"}.`,
    `User agent: ${log.useragent || "unknown"}.`,
    `Transaction size: ${txKb}.`,
    `Location: ${log.location || "unknown"}.`,
  ];

  return parts.join(" ");
}

/**
 * Pick the top-scored label and decide if it signals an anomaly.
 * Returns a normalised result regardless of label naming convention
 * (LABEL_0/LABEL_1, ANOMALY/BENIGN, MALICIOUS/SAFE, etc.)
 */
function interpretResult(labels: HFLabelScore[]): {
  isAnomaly: boolean;
  confidence: number;
  label: string;
  allLabels: HFLabelScore[];
} {
  if (labels.length === 0) {
    return { isAnomaly: false, confidence: 0, label: "unknown", allLabels: [] };
  }

  // Sort by score descending — the top label is the model's prediction
  const sorted = [...labels].sort((a, b) => b.score - a.score);
  const top = sorted[0];

  // Heuristic: treat any label that contains "anomal", "malici", "threat",
  // "attack", "suspicious", "1" (LABEL_1 convention) as positive (anomaly).
  const anomalyKeywords = [
    "anomal", "malici", "threat", "suspicious", "attack",
    "unsafe", "blocked", "risk", "phish", "hack", "label_1",
  ];
  const isAnomaly = anomalyKeywords.some((kw) =>
    top.label.toLowerCase().includes(kw)
  );

  return {
    isAnomaly,
    confidence: parseFloat((top.score * 100).toFixed(6)),
    label: top.label,
    allLabels: sorted,
  };
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

const MLLogPayloadSchema = {
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

export async function mlAnalysisRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/ml/analyze-log
   * Body: { log: LogPayload }
   * Response: { isAnomaly, confidence, label, allLabels, input }
   */
  app.post(
    "/api/ml/analyze-log",
    {
      schema: {
        tags: ['ml'],
        summary: 'Run HuggingFace ML classification on a single log entry',
        security: [{ userId: [] }],
        body: {
          type: 'object',
          required: ['log'],
          properties: {
            log: MLLogPayloadSchema,
          },
        },
        response: {
          200: {
            description: 'ML classification result',
            type: 'object',
            properties: {
              isAnomaly:  { type: 'boolean' },
              confidence: { type: 'number', description: 'Top-label confidence (0–100)' },
              label:      { type: 'string' },
              allLabels: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    score: { type: 'number' },
                  },
                },
              },
              input:      { type: 'string', description: 'Natural language input sent to the model' },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } }, description: 'Missing log payload' },
          502: { type: 'object', properties: { error: { type: 'string' } }, description: 'HuggingFace endpoint error' },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { log: LogPayload } }>,
      reply: FastifyReply
    ) => {
      const log = request.body?.log;
      if (!log) {
        return reply.status(400).send({ error: "Missing log payload" });
      }

      const inputText = buildNaturalLanguage(log);

      // ── Call HuggingFace endpoint ──────────────────────────────────────
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const hfToken = process.env.HF_API_TOKEN;
      if (hfToken) {
        headers["Authorization"] = `Bearer ${hfToken}`;
      }

      let rawResponse: HFResponse;
      try {
        const res = await fetch(HF_ENDPOINT, {
          method: "POST",
          headers,
          body: JSON.stringify({ inputs: inputText }),
        });

        if (!res.ok) {
          const errText = await res.text();
          return reply
            .status(502)
            .send({ error: `HuggingFace endpoint returned ${res.status}: ${errText}` });
        }

        rawResponse = (await res.json()) as HFResponse;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply
          .status(502)
          .send({ error: `Failed to reach HuggingFace endpoint: ${msg}` });
      }

      // ── Normalise + interpret ──────────────────────────────────────────
      const labels = normalizeHFResponse(rawResponse);
      const result = interpretResult(labels);

      return reply.send({
        isAnomaly: result.isAnomaly,
        confidence: result.confidence,
        label: result.label,
        allLabels: result.allLabels,
        input: inputText,
      });
    }
  );
}
