import { useCallback, useEffect, useRef, useState } from "react";
import AnomalyBadge from "./AnomalyBadge";
import { AI_MODELS, getAiAnalysis, getLogs, getMlAnalysis } from "../api/client";
import type { AiModelId, MlAnalysisResult } from "../api/client";
import type { ZscalerLog } from "../types";

// ---------------------------------------------------------------------------
// AI analysis per-row state — tracks which model was used
// ---------------------------------------------------------------------------
type AiStatus = "idle" | "loading" | "done" | "error";
interface AiState { status: AiStatus; text: string; usedModel?: string; }

// ---------------------------------------------------------------------------
// ML analysis per-row state
// ---------------------------------------------------------------------------
type MlStatus = "idle" | "loading" | "done" | "error";
interface MlState { status: MlStatus; data: MlAnalysisResult | null; error: string; }

// ---------------------------------------------------------------------------
// Expanded row tabs
// ---------------------------------------------------------------------------
type ExpandedTab = "details" | "ai" | "ml";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtDatetime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function truncate(str: string, max: number): string {
  if (!str) return "—";
  return str.length > max ? str.slice(0, max) + "…" : str;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function Pill({
  value,
  type,
}: {
  value: string;
  type: "action" | "category" | "severity";
}) {
  if (type === "action") {
    const lower = value?.toLowerCase();
    if (lower === "allowed")
      return (
        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-green-900/60 text-green-300 border border-green-700/50">
          Allowed
        </span>
      );
    if (lower === "blocked")
      return (
        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-red-900/60 text-red-300 border border-red-700/50">
          Blocked
        </span>
      );
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-700/60 text-gray-300">
        {value || "—"}
      </span>
    );
  }

  if (type === "category") {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-gray-700/70 text-gray-300 border border-gray-600/50">
        {value || "—"}
      </span>
    );
  }

  // severity
  const sev = value?.toLowerCase();
  if (sev === "critical")
    return <span className="text-red-400 font-semibold text-xs">{value}</span>;
  if (sev === "high")
    return <span className="text-orange-400 font-semibold text-xs">{value}</span>;
  if (sev === "medium")
    return <span className="text-yellow-400 font-semibold text-xs">{value}</span>;
  if (sev === "low")
    return <span className="text-blue-400 text-xs">{value}</span>;
  return <span className="text-gray-500 text-xs">{value || "—"}</span>;
}

function ThreatCell({ name }: { name: string }) {
  const isNone = !name || name.toLowerCase() === "none";
  return (
    <span
      title={!isNone ? name : undefined}
      className={`whitespace-nowrap ${isNone ? "text-gray-600 text-xs" : "text-red-400 text-xs font-semibold inline-block max-w-[10rem] overflow-hidden text-ellipsis align-middle"}`}
    >
      {isNone ? "None" : name}
    </span>
  );
}

function TipCell({ value, max = 40 }: { value: string; max?: number }) {
  const truncated = truncate(value, max);
  const isTrunc = value && value.length > max;
  return (
    <span className={isTrunc ? "relative group cursor-default" : ""}>
      <span className="font-mono text-xs text-gray-300 whitespace-nowrap">{truncated}</span>
      {isTrunc && (
        <span className="pointer-events-none absolute z-50 bottom-full left-0 mb-1 w-max max-w-xs px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-600 text-gray-200 text-xs shadow-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-pre-wrap break-all">
          {value}
        </span>
      )}
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-800 animate-pulse">
      {Array.from({ length: 11 }).map((_, i) => (
        <td key={i} className="px-3 py-3">
          <div className="h-3 bg-gray-700 rounded w-full" />
        </td>
      ))}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Expanded row detail panel — tabbed
// ---------------------------------------------------------------------------
function ExpandedRow({
  log,
  ai,
  onAnalyze,
  ml,
  onMlAnalyze,
  aiModel,
  onAiModelChange,
}: {
  log: ZscalerLog;
  ai: AiState;
  onAnalyze: () => void;
  ml: MlState;
  onMlAnalyze: () => void;
  aiModel: AiModelId;
  onAiModelChange: (m: AiModelId) => void;
}) {
  const [activeTab, setActiveTab] = useState<ExpandedTab>("details");

  const fields: [string, string | number | boolean][] = [
    ["ID", log.id],
    ["Datetime", log.datetime],
    ["User Email", log.userEmail],
    ["Client IP", log.clientIp],
    ["URL", log.url],
    ["Action", log.action],
    ["URL Category", log.urlCategory],
    ["URL Class", log.urlClass],
    ["Threat Name", log.threatName],
    ["Threat Severity", log.threatSeverity],
    ["Department", log.department],
    ["Transaction Size", log.transactionSize],
    ["Request Method", log.requestMethod],
    ["Status Code", log.statusCode],
    ["DLP Engine", log.dlpEngine],
    ["User Agent", log.useragent],
    ["Location", log.location],
    ["App Name", log.appName],
    ["App Class", log.appClass],
    ["Is Anomaly", String(log.isAnomaly)],
    ["Anomaly Confidence", `${log.anomalyConfidence}%`],
    ["Anomaly Reason", log.anomalyReason],
  ];

  const tabs: { id: ExpandedTab; label: string; icon: string }[] = [
    { id: "details", label: "Log Details", icon: "📋" },
    { id: "ai",      label: "AI Analysis", icon: "✨" },
    { id: "ml",      label: "ML Anomaly",  icon: "🤖" },
  ];

  return (
    <tr className="bg-gray-800/60 border-b border-gray-700">
      <td colSpan={11} className="px-6 py-4">

        {/* ── Tab bar ── */}
        <div className="flex gap-1 mb-4 border-b border-gray-700/60 pb-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={(e) => { e.stopPropagation(); setActiveTab(tab.id); }}
              className={`
                px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors
                ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-300 bg-blue-950/30"
                    : "border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-700/40"
                }
              `}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Log Details ── */}
        {activeTab === "details" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
            {fields.map(([key, val]) => (
              <div key={key} className="flex gap-2 min-w-0">
                <span className="text-gray-500 shrink-0">{key}:</span>
                <span className="text-gray-200 truncate">{String(val ?? "—")}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Tab: AI Analysis ── */}
        {activeTab === "ai" && (
          <div className="rounded-xl border border-indigo-700/40 bg-indigo-950/30 px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-indigo-300">
                ✨ GPT SOC Analysis
              </span>
              <div className="flex items-center gap-2">
                {/* Model selector */}
                <select
                  value={aiModel}
                  onChange={(e) => onAiModelChange(e.target.value as AiModelId)}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-gray-800 border border-gray-600 text-gray-300 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  {AI_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
                {ai.status !== "loading" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onAnalyze(); }}
                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/60 transition-colors"
                  >
                    {ai.status === "idle" ? "✨ Analyze" : "↻ Re-analyze"}
                  </button>
                )}
              </div>
            </div>
            {ai.status === "idle" && (
              <p className="text-gray-500 text-xs">
                Select a model and click "Analyze" to get a 2-sentence SOC assessment of this log entry.
              </p>
            )}
            {ai.status === "loading" && (
              <div className="flex items-center gap-2 text-indigo-300 text-xs">
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Analyzing with {AI_MODELS.find((m) => m.id === aiModel)?.label ?? aiModel}…
              </div>
            )}
            {ai.status === "done" && (
              <div>
                {ai.usedModel && (
                  <p className="text-indigo-500 text-xs mb-1.5">
                    Analyzed with{" "}
                    <span className="font-medium text-indigo-400">
                      {AI_MODELS.find((m) => m.id === ai.usedModel)?.label ?? ai.usedModel}
                    </span>
                  </p>
                )}
                <p className="text-gray-100 text-sm leading-relaxed">{ai.text}</p>
              </div>
            )}
            {ai.status === "error" && (
              <p className="text-red-400 text-xs">{ai.text}</p>
            )}
          </div>
        )}

        {/* ── Tab: ML Anomaly ── */}
        {activeTab === "ml" && (
          <div className="rounded-xl border border-emerald-700/40 bg-emerald-950/20 px-4 py-3">
            {/* ── Disclaimer note ── */}
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-yellow-950/40 border border-yellow-700/40 px-3 py-2.5">
              <span className="text-yellow-400 text-base mt-0.5 shrink-0">⚠️</span>
              <p className="text-yellow-300 text-xs leading-relaxed">
                <span className="font-semibold">Note:</span> This model is not fully accurate and needs further training on Zscaler-specific data.{" "}
                <a
                  href="https://huggingface.co/EgilKarlsen/DistilRoBERTa_Thunderbird-Anomaly_Baseline"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="underline text-yellow-400 hover:text-yellow-200 transition-colors"
                >
                  View model on HuggingFace ↗
                </a>
              </p>
            </div>

            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-emerald-300">
                🤖 ML Anomaly Detection
              </span>
              {ml.status !== "loading" && (
                <button
                  onClick={(e) => { e.stopPropagation(); onMlAnalyze(); }}
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-600/60 transition-colors"
                >
                  {ml.status === "idle" ? "🤖 Run ML Analysis" : "↻ Re-run"}
                </button>
              )}
            </div>

            {ml.status === "idle" && (
              <p className="text-gray-500 text-xs">
                Click "Run ML Analysis" to classify this log entry using the HuggingFace inference model.
              </p>
            )}

            {ml.status === "loading" && (
              <div className="flex items-center gap-2 text-emerald-300 text-xs">
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Running ML classification…
              </div>
            )}

            {ml.status === "done" && ml.data && (
              <div className="space-y-3">
                {/* Verdict banner */}
                <div
                  className={`flex items-center gap-3 rounded-lg px-4 py-3 border ${
                    ml.data.isAnomaly
                      ? "bg-red-950/40 border-red-700/50"
                      : "bg-green-950/40 border-green-700/50"
                  }`}
                >
                  <span className="text-2xl">
                    {ml.data.isAnomaly ? "🚨" : "✅"}
                  </span>
                  <div>
                    <p
                      className={`text-sm font-bold ${
                        ml.data.isAnomaly ? "text-red-300" : "text-green-300"
                      }`}
                    >
                      {ml.data.isAnomaly ? "ANOMALY DETECTED" : "LEGITIMATE TRAFFIC"}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Model label:{" "}
                      <span className="font-mono text-gray-200">{ml.data.label}</span>
                      {" · "}
                      Confidence:{" "}
                      <span className="font-semibold text-white">{ml.data.confidence.toFixed(4)}%</span>
                    </p>
                  </div>
                </div>

                {/* All label scores */}
                {ml.data.allLabels.length > 1 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5 font-medium">All scores:</p>
                    <div className="space-y-1.5">
                      {ml.data.allLabels.map((lbl) => (
                        <div key={lbl.label} className="flex items-center gap-2">
                          <span className="text-xs font-mono text-gray-400 w-28 shrink-0">{lbl.label}</span>
                          <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full bg-emerald-500"
                              style={{ width: `${(lbl.score * 100).toFixed(2)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-300 w-16 text-right">
                            {(lbl.score * 100).toFixed(4)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input text */}
                <details className="text-xs">
                  <summary className="cursor-pointer text-gray-500 hover:text-gray-300 select-none">
                    Show model input
                  </summary>
                  <p className="mt-1.5 text-gray-400 bg-gray-800 rounded-lg p-2 leading-relaxed break-all">
                    {ml.data.input}
                  </p>
                </details>
              </div>
            )}

            {ml.status === "error" && (
              <p className="text-red-400 text-xs">{ml.error}</p>
            )}
          </div>
        )}

      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Sort state
// ---------------------------------------------------------------------------
type SortCol = "datetime" | "action" | "threatSeverity" | null;
type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
interface SOCTableProps {
  sessionId: string;
}

export default function SOCTable({ sessionId }: SOCTableProps) {
  const [logs, setLogs] = useState<ZscalerLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [anomalyOnly, setAnomalyOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<SortCol>("datetime");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // AI model selection (persists across rows)
  const [aiModel, setAiModel] = useState<AiModelId>("gpt-4o-mini");
  const aiModelRef = useRef<AiModelId>(aiModel);
  aiModelRef.current = aiModel;

  // AI analysis state keyed by log id
  const [aiMap, setAiMap] = useState<Map<string, AiState>>(new Map());

  // ML analysis state keyed by log id
  const [mlMap, setMlMap] = useState<Map<string, MlState>>(new Map());

  const getAi = (id: string): AiState =>
    aiMap.get(id) ?? { status: "idle", text: "" };

  const getMl = (id: string): MlState =>
    mlMap.get(id) ?? { status: "idle", data: null, error: "" };

  const triggerAiAnalysis = useCallback(
    async (log: ZscalerLog) => {
      const id = log.id;
      const model = aiModelRef.current;
      // Always expand the row so the panel is visible
      setExpandedId(id);
      // Set loading
      setAiMap((prev) => new Map(prev).set(id, { status: "loading", text: "" }));
      try {
        const { analysis, model: usedModel } = await getAiAnalysis(log, model);
        setAiMap((prev) =>
          new Map(prev).set(id, { status: "done", text: analysis, usedModel })
        );
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "AI analysis failed.";
        setAiMap((prev) =>
          new Map(prev).set(id, { status: "error", text: msg })
        );
      }
    },
    []
  );

  const triggerMlAnalysis = useCallback(
    async (log: ZscalerLog) => {
      const id = log.id;
      setExpandedId(id);
      setMlMap((prev) => new Map(prev).set(id, { status: "loading", data: null, error: "" }));
      try {
        const result = await getMlAnalysis(log);
        setMlMap((prev) =>
          new Map(prev).set(id, { status: "done", data: result, error: "" })
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "ML analysis failed.";
        setMlMap((prev) =>
          new Map(prev).set(id, { status: "error", data: null, error: msg })
        );
      }
    },
    []
  );

  const LIMIT = 20;
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getLogs(sessionId, {
        page,
        limit: LIMIT,
        filter_anomaly: anomalyOnly || undefined,
        search: search || undefined,
      });
      setLogs(res.logs);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [sessionId, page, anomalyOnly, search]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // debounce search input
  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(val);
      setPage(1);
    }, 400);
  };

  const handleToggleAnomaly = () => {
    setAnomalyOnly((prev) => !prev);
    setPage(1);
  };

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  // Client-side sort on current page — server already returns by datetime DESC,
  // allow re-sort within the page for action/severity columns.
  const sorted = [...logs].sort((a, b) => {
    if (!sortCol) return 0;
    let av: string | number = "";
    let bv: string | number = "";
    if (sortCol === "datetime") {
      av = new Date(a.datetime).getTime();
      bv = new Date(b.datetime).getTime();
    } else if (sortCol === "action") {
      av = a.action ?? "";
      bv = b.action ?? "";
    } else if (sortCol === "threatSeverity") {
      const order: Record<string, number> = {
        Critical: 4, High: 3, Medium: 2, Low: 1,
      };
      av = order[a.threatSeverity] ?? 0;
      bv = order[b.threatSeverity] ?? 0;
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) return <span className="ml-1 text-gray-600">↕</span>;
    return (
      <span className="ml-1 text-blue-400">
        {sortDir === "asc" ? "↑" : "↓"}
      </span>
    );
  };

  const from = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const to = Math.min(page * LIMIT, total);

  // Page window
  const pageNumbers: (number | "…")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
  } else {
    pageNumbers.push(1);
    if (page > 3) pageNumbers.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++)
      pageNumbers.push(i);
    if (page < totalPages - 2) pageNumbers.push("…");
    pageNumbers.push(totalPages);
  }

  return (
    <div className="bg-gray-900 border border-gray-700/60 rounded-2xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-gray-700/60">
        <h2 className="text-base font-semibold text-gray-100 mr-auto">
          Log Entries
        </h2>
        {/* Search */}
        <input
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search user or URL…"
          className="w-56 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
        {/* Anomaly toggle */}
        <button
          onClick={handleToggleAnomaly}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            anomalyOnly
              ? "bg-red-700 border-red-600 text-white"
              : "bg-gray-800 border-gray-600 text-gray-300 hover:border-red-500"
          }`}
        >
          {anomalyOnly ? "Show All" : "Show Anomalies Only"}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[1260px]">
          <thead className="sticky top-0 z-10 bg-gray-900 border-b border-gray-700/60">
            <tr className="text-xs text-gray-400 uppercase tracking-wider">
              {(
                [
                  ["Timestamp", "datetime"],
                  ["User", null],
                  ["Source IP", null],
                  ["Destination URL", null],
                  ["Action", "action"],
                  ["URL Category", null],
                  ["Threat Name", null],
                  ["Severity", "threatSeverity"],
                  ["Department", null],
                  ["Anomaly", null],
                  ["AI Analysis", null],
                ] as [string, SortCol][]
              ).map(([label, col]) => (
                <th
                  key={label}
                  onClick={col ? () => handleSort(col) : undefined}
                  className={`text-left px-3 py-3 whitespace-nowrap ${
                    col ? "cursor-pointer hover:text-gray-200 select-none" : ""
                  }`}
                >
                  {label}
                  {col && <SortIcon col={col} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              : sorted.map((log, idx) => (
                  <>
                    <tr
                      key={log.id}
                      onClick={() =>
                        setExpandedId((prev) => (prev === log.id ? null : log.id))
                      }
                      className={`
                        border-b border-gray-800 cursor-pointer transition-colors
                        ${idx % 2 === 0 ? "bg-gray-900" : "bg-gray-800/40"}
                        hover:bg-blue-950/30
                        ${expandedId === log.id ? "bg-blue-950/20" : ""}
                      `}
                    >
                      <td className="px-3 py-2.5 text-gray-400 text-xs whitespace-nowrap">
                        {fmtDatetime(log.datetime)}
                      </td>
                      <td className="px-3 py-2.5 max-w-[10rem]">
                        <TipCell value={log.userEmail} max={22} />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="font-mono text-xs text-gray-300">
                          {log.clientIp || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 max-w-[14rem]">
                        <TipCell value={log.url} max={40} />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <Pill value={log.action} type="action" />
                      </td>
                      <td className="px-3 py-2.5 max-w-[9rem]">
                        <Pill value={log.urlCategory} type="category" />
                      </td>
                      <td className="px-3 py-2.5">
                        <ThreatCell name={log.threatName} />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <Pill value={log.threatSeverity} type="severity" />
                      </td>
                      <td className="px-3 py-2.5 text-gray-300 text-xs">
                        <div className="max-w-[8rem] overflow-hidden text-ellipsis whitespace-nowrap" title={log.department || undefined}>
                          {log.department || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {log.isAnomaly ? (
                          <AnomalyBadge
                            confidence={log.anomalyConfidence}
                            reason={log.anomalyReason}
                          />
                        ) : (
                          <span className="text-gray-600 text-xs">—</span>
                        )}
                      </td>
                      {/* ── AI Analysis column ── */}
                      <td
                        className="px-3 py-2.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(() => {
                          const ai = getAi(log.id);
                          if (ai.status === "loading") {
                            return (
                              <span className="inline-flex items-center gap-1 text-indigo-300 text-xs">
                                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                </svg>
                                Analyzing…
                              </span>
                            );
                          }
                          if (ai.status === "done") {
                            return (
                              <button
                                onClick={() => triggerAiAnalysis(log)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-indigo-900/60 text-indigo-300 border border-indigo-700/50 hover:bg-indigo-800/60 transition-colors"
                              >
                                ✨ View
                              </button>
                            );
                          }
                          return (
                            <button
                              onClick={() => triggerAiAnalysis(log)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/60 transition-colors"
                            >
                              ✨ Analyze
                            </button>
                          );
                        })()}
                      </td>
                    </tr>
                    {expandedId === log.id && (
                      <ExpandedRow
                        key={`exp-${log.id}`}
                        log={log}
                        ai={getAi(log.id)}
                        onAnalyze={() => triggerAiAnalysis(log)}
                        ml={getMl(log.id)}
                        onMlAnalyze={() => triggerMlAnalysis(log)}
                        aiModel={aiModel}
                        onAiModelChange={setAiModel}
                      />
                    )}
                  </>
                ))}
            {!loading && sorted.length === 0 && (
              <tr>
                <td colSpan={11} className="py-16">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <span className="text-5xl select-none opacity-40">📋</span>
                    <p className="text-gray-300 font-medium text-sm">
                      {anomalyOnly
                        ? "No anomalies found for this session."
                        : search
                        ? `No results matching "${search}".`
                        : "No log entries for this session."}
                    </p>
                    <p className="text-gray-600 text-xs">
                      {anomalyOnly
                        ? "Toggle off \"Show Anomalies Only\" to see all traffic."
                        : search
                        ? "Try a different search term."
                        : "Upload a CSV file to populate the log table."}
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-gray-700/60">
        <p className="text-xs text-gray-400">
          {total === 0
            ? "No results"
            : `Showing ${from}–${to} of ${total.toLocaleString()} results`}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="px-3 py-1 rounded-lg text-xs text-gray-300 bg-gray-800 border border-gray-700 hover:border-gray-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          {pageNumbers.map((pn, i) =>
            pn === "…" ? (
              <span key={`ellipsis-${i}`} className="px-2 text-gray-500 text-xs">
                …
              </span>
            ) : (
              <button
                key={pn}
                onClick={() => setPage(pn as number)}
                className={`w-8 h-7 rounded-lg text-xs font-medium border transition-colors ${
                  pn === page
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500"
                }`}
              >
                {pn}
              </button>
            )
          )}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
            className="px-3 py-1 rounded-lg text-xs text-gray-300 bg-gray-800 border border-gray-700 hover:border-gray-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
