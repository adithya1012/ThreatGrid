import axios from "axios";
import type {
  UploadResponse,
  DashboardStats,
  LogQueryParams,
  LogsResponse,
  PieChartData,
  BarChartData,
  UploadSession,
  InsightItem,
  ZscalerLog,
  AuthUser,
} from "../types";

const STORAGE_KEY = "soc_user";

const http = axios.create({
  // In Docker: empty base → nginx serves frontend and proxies /api/* to backend.
  // In local dev: set VITE_API_BASE_URL=http://localhost:3001 in frontend/.env.local
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "",
});

// Attach x-user-id header from localStorage on every request
http.interceptors.request.use((config) => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const user = JSON.parse(raw) as AuthUser;
      if (user?.id) config.headers["x-user-id"] = user.id;
    }
  } catch {
    // ignore
  }
  return config;
});

/** Sign up — returns the new user on success. */
export function signupUser(
  username: string,
  password: string
): Promise<AuthUser> {
  return http
    .post<AuthUser>("/api/auth/signup", { username, password })
    .then((r) => r.data);
}

/** Log in — returns user on success. */
export function loginUser(
  username: string,
  password: string
): Promise<AuthUser> {
  return http
    .post<AuthUser>("/api/auth/login", { username, password })
    .then((r) => r.data);
}

/** Upload a CSV file and trigger the full parse + anomaly pipeline. */
export function uploadCSV(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  return http
    .post<UploadResponse>("/api/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);
}

/** Aggregated stats for a session. */
export function getStats(sessionId: string): Promise<DashboardStats> {
  return http
    .get<DashboardStats>(`/api/dashboard/${sessionId}/stats`)
    .then((r) => r.data);
}

/** Paginated log rows, with optional anomaly filter and search. */
export function getLogs(
  sessionId: string,
  params: LogQueryParams
): Promise<LogsResponse> {
  return http
    .get<LogsResponse>(`/api/dashboard/${sessionId}/logs`, { params })
    .then((r) => r.data);
}

/** Pie chart — Legitimate vs Anomaly. */
export function getPieChartData(sessionId: string): Promise<PieChartData> {
  return http
    .get<PieChartData>(`/api/dashboard/${sessionId}/piechart`)
    .then((r) => r.data);
}

/** Bar chart — hourly traffic breakdown. */
export function getBarChartData(sessionId: string): Promise<BarChartData> {
  return http
    .get<BarChartData>(`/api/dashboard/${sessionId}/barchart`)
    .then((r) => r.data);
}

/** All upload sessions ordered newest-first. */
export function getSessions(): Promise<UploadSession[]> {
  return http.get<UploadSession[]>("/api/sessions").then((r) => r.data);
}

/** Pre-computed security insights for a session. */
export function getInsights(sessionId: string): Promise<InsightItem[]> {
  return http
    .get<InsightItem[]>(`/api/dashboard/${sessionId}/insights`)
    .then((r) => r.data);
}

export const AI_MODELS = [
  { id: "gpt-4o-mini",   label: "GPT-4o mini" },
  { id: "gpt-4o",        label: "GPT-4o" },
  { id: "gpt-4-turbo",   label: "GPT-4 Turbo" },
  { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
] as const;

export type AiModelId = (typeof AI_MODELS)[number]["id"];

/** Request a 2-sentence AI analysis of a single log row. */
export function getAiAnalysis(
  log: ZscalerLog,
  model: AiModelId = "gpt-4o-mini"
): Promise<{ analysis: string; model: string }> {
  return http
    .post<{ analysis: string; model: string }>("/api/ai/analyze-log", { log, model })
    .then((r) => r.data);
}

export interface MlLabelScore {
  label: string;
  score: number;
}

export interface MlAnalysisResult {
  isAnomaly: boolean;
  confidence: number;
  label: string;
  allLabels: MlLabelScore[];
  input: string;
}

/** Run ML anomaly classification via the HuggingFace inference endpoint. */
export function getMlAnalysis(log: ZscalerLog): Promise<MlAnalysisResult> {
  return http
    .post<MlAnalysisResult>("/api/ml/analyze-log", { log })
    .then((r) => r.data);
}

/**
 * Trigger a browser download of a freshly generated Zscaler sample CSV.
 * Uses a direct fetch so we can create a Blob URL for the download.
 */
export async function downloadSampleCsv(rows = 200): Promise<void> {
  const base = import.meta.env.VITE_API_BASE_URL ?? "";
  const res = await fetch(
    `${base}/api/generate-sample-csv?rows=${rows}`
  );
  if (!res.ok) throw new Error(`Server returned ${res.status}`);

  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="?([^";\s]+)"?/);
  const filename = match?.[1] ?? "zscaler_sample.csv";

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
