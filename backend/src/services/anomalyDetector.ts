import { ParsedRow } from "./csvParser";

export interface AnomalyResult {
  isAnomaly: boolean;
  anomalyConfidence: number;
  anomalyReason: string;
}

/** Internal shape returned by each individual rule. */
interface RuleHit {
  confidence: number;
  reason: string;
}

// ---------------------------------------------------------------------------
// Helper predicates
// ---------------------------------------------------------------------------

function isPresent(value: string | null | undefined): boolean {
  return (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    value.toLowerCase() !== "none"
  );
}

// ---------------------------------------------------------------------------
// Rule implementations
// ---------------------------------------------------------------------------

/** RULE 1 — Threat Name Present */
function rule01ThreatNamePresent(row: ParsedRow): RuleHit | null {
  if (isPresent(row.threat_name)) {
    return {
      confidence: 95,
      reason: `Active threat detected: ${row.threat_name}`,
    };
  }
  return null;
}

/** RULE 2 — Critical/High/Medium Threat Severity */
function rule02ThreatSeverity(row: ParsedRow): RuleHit | null {
  const severityMap: Record<string, number> = {
    Critical: 95,
    High: 85,
    Medium: 65,
  };
  const confidence = severityMap[row.threat_severity];
  if (confidence !== undefined) {
    return {
      confidence,
      reason: `Threat severity: ${row.threat_severity}`,
    };
  }
  return null;
}

/** RULE 3 — Allowed + Threat Present (WORST CASE) */
function rule03AllowedWithThreat(row: ParsedRow): RuleHit | null {
  if (
    row.action?.toLowerCase() === "allowed" &&
    isPresent(row.threat_name)
  ) {
    return {
      confidence: 97,
      reason: `CRITICAL: Threat allowed through - ${row.threat_name}`,
    };
  }
  return null;
}

/** RULE 4 — Malicious URL Category */
function rule04MaliciousUrlCategory(row: ParsedRow): RuleHit | null {
  const categoryMap: Record<string, number> = {
    "Malware Sites": 92,
    Phishing: 94,
    Hacking: 90,
    "Spyware/Adware": 88,
    "Newly Registered Domains": 72,
    "Parked Domains": 68,
    "Peer-to-Peer": 70,
  };
  const confidence = categoryMap[row.url_category];
  if (confidence !== undefined) {
    return {
      confidence,
      reason: `Risky URL category: ${row.url_category}`,
    };
  }
  return null;
}

/** RULE 5 — Security Risk URL Class */
function rule05SecurityRiskUrlClass(row: ParsedRow): RuleHit | null {
  const classMap: Record<string, number> = {
    "Security Risk": 88,
    "Malicious Content": 93,
    "Data Loss": 90,
  };
  const confidence = classMap[row.url_class];
  if (confidence !== undefined) {
    return {
      confidence,
      reason: `Dangerous URL class: ${row.url_class}`,
    };
  }
  return null;
}

/** RULE 6 — DLP Engine Triggered */
function rule06DlpTriggered(row: ParsedRow): RuleHit | null {
  if (isPresent(row.dlp_engine)) {
    return {
      confidence: 85,
      reason: `DLP violation detected: ${row.dlp_engine}`,
    };
  }
  return null;
}

/** RULE 7 — Suspicious User Agent */
function rule07SuspiciousUserAgent(row: ParsedRow): RuleHit | null {
  const suspiciousPatterns = [
    "curl",
    "wget",
    "python",
    "bot",
    "crawler",
    "scrapy",
  ];
  const ua = (row.useragent ?? "").toLowerCase();
  const matched = suspiciousPatterns.find((p) => ua.includes(p));
  if (matched) {
    return {
      confidence: 70,
      reason: `Suspicious user agent: ${row.useragent}`,
    };
  }
  return null;
}

/** RULE 8 — CONNECT Method to Unknown */
function rule08ConnectMethod(row: ParsedRow): RuleHit | null {
  if (
    row.request_method?.toUpperCase() === "CONNECT" &&
    row.action?.toLowerCase() === "allowed"
  ) {
    return {
      confidence: 60,
      reason: "SSL tunnel established via CONNECT method",
    };
  }
  return null;
}

/** RULE 9 — Large Transaction Size */
function rule09LargeTransaction(row: ParsedRow): RuleHit | null {
  const size = row.transaction_size;
  if (size > 500_000) {
    return { confidence: 88, reason: `Large data transfer: ${size} bytes` };
  }
  if (size > 100_000) {
    return { confidence: 78, reason: `Large data transfer: ${size} bytes` };
  }
  if (size > 50_000) {
    return { confidence: 65, reason: `Large data transfer: ${size} bytes` };
  }
  return null;
}

/** RULE 10 — SSL Bypass */
function rule10SslBypass(row: ParsedRow): RuleHit | null {
  const cat = row.url_category ?? "";
  if (cat.includes("Bypass") || cat.includes("DNI")) {
    return {
      confidence: 55,
      reason: "SSL inspection bypassed",
    };
  }
  return null;
}

/** RULE 11 — HTTP 403 Status */
function rule11Http403(row: ParsedRow): RuleHit | null {
  if (row.status_code === "403") {
    return {
      confidence: 40,
      reason: "Forbidden request (403)",
    };
  }
  return null;
}

/** RULE 12 — Blocked Security Risk */
function rule12BlockedSecurityRisk(row: ParsedRow): RuleHit | null {
  if (
    row.action?.toLowerCase() === "blocked" &&
    row.url_class === "Security Risk"
  ) {
    return {
      confidence: 88,
      reason: "Security risk blocked",
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// All rules in evaluation order
// ---------------------------------------------------------------------------

const ALL_RULES: Array<(row: ParsedRow) => RuleHit | null> = [
  rule01ThreatNamePresent,
  rule02ThreatSeverity,
  rule03AllowedWithThreat,
  rule04MaliciousUrlCategory,
  rule05SecurityRiskUrlClass,
  rule06DlpTriggered,
  rule07SuspiciousUserAgent,
  rule08ConnectMethod,
  rule09LargeTransaction,
  rule10SslBypass,
  rule11Http403,
  rule12BlockedSecurityRisk,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all 12 anomaly detection rules against a single parsed row.
 *
 * Scoring strategy:
 *   - isAnomaly  = true  if at least one rule triggered
 *   - confidence = MAX confidence among all triggered rules
 *   - reason     = reason from the highest-confidence triggered rule
 */
export function detectAnomaly(row: ParsedRow): AnomalyResult {
  const hits: RuleHit[] = [];

  for (const rule of ALL_RULES) {
    const hit = rule(row);
    if (hit !== null) {
      hits.push(hit);
    }
  }

  if (hits.length === 0) {
    return { isAnomaly: false, anomalyConfidence: 0, anomalyReason: "" };
  }

  // Pick the hit with the highest confidence
  const topHit = hits.reduce((best, current) =>
    current.confidence > best.confidence ? current : best
  );

  return {
    isAnomaly: true,
    anomalyConfidence: topHit.confidence,
    anomalyReason: topHit.reason,
  };
}
