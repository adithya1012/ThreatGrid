export interface ZscalerLog {
  id: string;
  datetime: string;
  userEmail: string;
  clientIp: string;
  url: string;
  action: string;
  urlCategory: string;
  threatName: string;
  threatSeverity: string;
  department: string;
  transactionSize: number;
  requestMethod: string;
  statusCode: string;
  urlClass: string;
  dlpEngine: string;
  useragent: string;
  location: string;
  appName: string;
  appClass: string;
  isAnomaly: boolean;
  anomalyConfidence: number;
  anomalyReason: string;
}

export interface UploadSession {
  id: string;
  filename: string;
  uploadedAt: string;
  totalRows: number;
  anomalyCount: number;
  status: string;
}

export interface DashboardStats {
  totalRequests: number;
  anomalyCount: number;
  legitimateCount: number;
  anomalyPercentage: number;
  blockedCount: number;
  allowedCount: number;
  topThreats: { threatName: string; count: number }[];
  topRiskyUsers: { user: string; anomalyCount: number }[];
  topDepartments: { department: string; count: number }[];
}

export interface UploadResponse {
  sessionId: string;
  filename: string;
  totalRows: number;
  anomalyCount: number;
  legitimateCount: number;
  anomalyPercentage: number;
}

export interface LogQueryParams {
  page?: number;
  limit?: number;
  filter_anomaly?: boolean;
  search?: string;
}

export interface LogsResponse {
  logs: ZscalerLog[];
  total: number;
  page: number;
  totalPages: number;
}

export interface PieChartData {
  data: { name: string; value: number; percentage: number }[];
}

export interface BarChartData {
  data: { hour: string; legitimate: number; anomalies: number; total: number }[];
}

export interface InsightItem {
  id: number;
  label: string;
  value: number | string;
  confidence: number;
  severity: "critical" | "high" | "medium" | "low";
}

export interface AuthUser {
  id: string;
  username: string;
}

// ── Chat types ───────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming: boolean;
  toolsUsed: string[];
  createdAt: string;
}

export type SSEEvent =
  | { type: "text"; chunk: string }
  | { type: "tool_call"; message: string }
  | { type: "done"; message: string }
  | { type: "error"; message: string };
