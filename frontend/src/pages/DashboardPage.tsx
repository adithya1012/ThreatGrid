import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getStats, getPieChartData, getBarChartData } from "../api/client";
import type { DashboardStats, PieChartData, BarChartData } from "../types";
import InsightCards from "../components/InsightCards";
import SOCTable from "../components/SOCTable";
import AnomalyPieChart from "../components/PieChart";
import TimelineBarChart from "../components/BarChart";
import ChatPanel from "../components/ChatPanel";

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------
interface KpiProps {
  icon: string;
  label: string;
  value: string | number;
  colorClass: string;
}

function KpiCard({ icon, label, value, colorClass }: KpiProps) {
  return (
    <div
      className={`bg-gray-900 border rounded-2xl p-5 flex flex-col gap-1 ${colorClass}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
      </div>
      <p className="text-3xl font-bold text-white mt-1">{value}</p>
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loaders
// ---------------------------------------------------------------------------
function KpiSkeleton() {
  return (
    <div className="bg-gray-900 border border-gray-700/60 rounded-2xl p-5 animate-pulse">
      <div className="h-6 w-6 bg-gray-700 rounded mb-3" />
      <div className="h-8 bg-gray-700 rounded w-3/4 mb-2" />
      <div className="h-4 bg-gray-700 rounded w-1/2" />
    </div>
  );
}

function ChartSkeleton({ height = 300 }: { height?: number }) {
  return (
    <div
      className="bg-gray-900 border border-gray-700/60 rounded-2xl p-6 animate-pulse"
      style={{ height }}
    >
      <div className="h-5 bg-gray-700 rounded w-1/3 mb-4" />
      <div className="flex-1 bg-gray-800 rounded-xl" style={{ height: height - 60 }} />
    </div>
  );
}

function ChartError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="bg-gray-900 border border-red-800/40 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 h-full min-h-[300px]">
      <span className="text-3xl">⚠️</span>
      <p className="text-red-400 text-sm font-medium">Failed to load chart data</p>
      <button
        onClick={onRetry}
        className="px-4 py-1.5 rounded-lg text-xs font-medium bg-gray-800 border border-gray-600 hover:border-gray-400 text-gray-300 hover:text-white transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

function InsightsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 animate-pulse">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="bg-gray-900 border border-gray-700/60 rounded-xl h-28" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard page
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [pieData, setPieData] = useState<PieChartData | null>(null);
  const [barData, setBarData] = useState<BarChartData | null>(null);
  const [error, setError] = useState<string>("");
  const [chartError, setChartError] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const fetchAll = useCallback(() => {
    if (!sessionId) return;
    setLoading(true);
    setError("");
    setChartError("");
    Promise.all([
      getStats(sessionId),
      getPieChartData(sessionId),
      getBarChartData(sessionId),
    ])
      .then(([s, p, b]) => {
        setStats(s);
        setPieData(p);
        setBarData(b);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load dashboard data.";
        setError(msg);
        setChartError(msg);
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  const retryCharts = useCallback(() => {
    if (!sessionId) return;
    setChartError("");
    Promise.all([getPieChartData(sessionId), getBarChartData(sessionId)])
      .then(([p, b]) => {
        setPieData(p);
        setBarData(b);
      })
      .catch((err: unknown) => {
        setChartError(
          err instanceof Error ? err.message : "Failed to load chart data."
        );
      });
  }, [sessionId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-red-400">
        Invalid session.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 px-4 py-6 max-w-screen-2xl mx-auto">
      {/* ── Header bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>🛡️</span> SOC Dashboard
          </h1>
          <p className="text-xs text-gray-500 mt-0.5 font-mono">
            Session: {sessionId}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsChatOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 border border-blue-500 transition-colors"
            aria-label="Open AI Analyst chat"
          >
            <svg
              className="w-4 h-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            Ask AI Analyst
          </button>
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-300 bg-gray-800 border border-gray-700 hover:border-gray-500 hover:text-white transition-colors"
          >
            ← Upload New File
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-950/60 border border-red-700/50 rounded-xl px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {loading || !stats ? (
          <>
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
          </>
        ) : (
          <>
            <KpiCard
              icon="📊"
              label="Total Requests"
              value={stats.totalRequests.toLocaleString()}
              colorClass="border-blue-800/50"
            />
            <KpiCard
              icon="🚨"
              label="Anomalies Found"
              value={stats.anomalyCount.toLocaleString()}
              colorClass="border-red-800/50"
            />
            <KpiCard
              icon="✅"
              label="Legitimate"
              value={stats.legitimateCount.toLocaleString()}
              colorClass="border-green-800/50"
            />
            <KpiCard
              icon="⚠️"
              label="Anomaly Rate"
              value={`${stats.anomalyPercentage}%`}
              colorClass="border-orange-800/50"
            />
          </>
        )}
      </div>

      {/* ── Charts row ── */}
      <div className="flex flex-col lg:flex-row gap-4 mb-8">
        {/* Pie: 35% */}
        <div className="lg:w-[35%]">
          {loading ? (
            <ChartSkeleton height={400} />
          ) : chartError ? (
            <ChartError onRetry={retryCharts} />
          ) : (
            <AnomalyPieChart data={pieData!} />
          )}
        </div>
        {/* Bar: 65% */}
        <div className="lg:w-[65%]">
          {loading ? (
            <ChartSkeleton height={400} />
          ) : chartError ? (
            <ChartError onRetry={retryCharts} />
          ) : (
            <TimelineBarChart data={barData!} />
          )}
        </div>
      </div>

      {/* ── Insight Cards ── */}
      <div className="mb-8">
        <h2 className="text-base font-semibold text-gray-200 mb-4">
          Security Insights
        </h2>
        {loading || !stats ? (
          <InsightsSkeleton />
        ) : (
          <InsightCards stats={stats} />
        )}
      </div>

      {/* ── SOC Table ── */}
      <SOCTable sessionId={sessionId} />

      {/* ── Chat Panel ── */}
      <ChatPanel
        sessionId={sessionId}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
      />

    </div>
  );
}
