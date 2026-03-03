import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { downloadSampleCsv, getSessions, uploadCSV } from "../api/client";
import type { UploadResponse, UploadSession } from "../types";
import { useAuth } from "../context/AuthContext";

// ---------------------------------------------------------------------------
// Progress steps shown during upload
// ---------------------------------------------------------------------------
const PROGRESS_STEPS = [
  "Parsing CSV…",
  "Running anomaly detection…",
  "Storing results…",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function pct(n: number, total: number) {
  if (total === 0) return "0.00";
  return ((n / total) * 100).toFixed(2);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ShieldIcon() {
  return (
    <svg
      className="w-12 h-12 text-blue-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 2.25L3.75 6v5.25c0 5.25 3.75 9.75 8.25 10.5 4.5-.75 8.25-5.25 8.25-10.5V6L12 2.25z"
      />
    </svg>
  );
}

function CloudUploadIcon() {
  return (
    <svg
      className="w-12 h-12 text-gray-500 mx-auto"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 16.5v-9m0 0l-3 3m3-3l3 3M6.75 19.5a4.5 4.5 0 01-.75-8.942V10.5a5.25 5.25 0 0110.233-1.5H16.5a4.5 4.5 0 010 9H6.75z"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-5 w-5 text-white inline-block mr-2"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v8H4z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------
interface StatCardProps {
  label: string;
  value: string | number;
  colorClass: string;
}

function StatCard({ label, value, colorClass }: StatCardProps) {
  return (
    <div className={`rounded-xl border p-4 text-center ${colorClass}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm mt-1 opacity-80">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function UploadPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [progressIdx, setProgressIdx] = useState(0);
  const [uploadError, setUploadError] = useState<string>("");
  const [result, setResult] = useState<UploadResponse | null>(null);

  // Sessions list
  const [sessions, setSessions] = useState<UploadSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  // Sample CSV generation
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string>("");

  const handleGenerateCsv = async () => {
    setIsGenerating(true);
    setGenerateError("");
    try {
      await downloadSampleCsv(200);
    } catch (err: unknown) {
      setGenerateError(
        err instanceof Error ? err.message : "Failed to generate CSV."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // Load previous sessions on mount
  useEffect(() => {
    getSessions()
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false));
  }, []);

  // ── File selection ─────────────────────────────────────────────────────────
  const validateAndSetFile = useCallback((f: File) => {
    setResult(null);
    setUploadError("");
    if (!f.name.toLowerCase().endsWith(".csv")) {
      setFileError("Only .csv files are supported");
      setFile(null);
    } else {
      setFileError("");
      setFile(f);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) validateAndSetFile(f);
  };

  // ── Drag & drop ────────────────────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) validateAndSetFile(f);
  };

  // ── Progress ticker ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!uploading) return;
    setProgressIdx(0);
    const interval = setInterval(() => {
      setProgressIdx((prev) =>
        prev < PROGRESS_STEPS.length - 1 ? prev + 1 : prev
      );
    }, 1800);
    return () => clearInterval(interval);
  }, [uploading]);

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    setResult(null);
    try {
      const data = await uploadCSV(file);
      setResult(data);
      // Refresh sessions list
      getSessions().then(setSessions).catch(() => {});
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Upload failed. Please try again.";
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center py-12 px-4">
      {/* ── Main card ── */}
      <div className="w-full max-w-2xl bg-gray-900 border border-gray-700/60 rounded-2xl shadow-2xl p-8">

      {/* ── Top action bar ── */}
        <div className="flex items-center justify-between mb-5">
          {/* User info + logout */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">
              Signed in as{" "}
              <span className="text-white font-semibold">{user?.username}</span>
            </span>
            <button
              onClick={() => { logout(); navigate("/login", { replace: true }); }}
              className="
                inline-flex items-center gap-1.5
                px-3 py-1.5 rounded-lg text-xs font-semibold
                bg-gray-800 hover:bg-gray-700
                text-gray-300 hover:text-white
                border border-gray-600/70
                transition-all duration-150
              "
            >
              Sign out
            </button>
          </div>
          {/* Generate sample CSV */}
          <button
            onClick={handleGenerateCsv}
            disabled={isGenerating}
            className="
              inline-flex items-center gap-2
              px-4 py-2 rounded-xl text-sm font-semibold
              bg-indigo-600 hover:bg-indigo-500
              disabled:opacity-50 disabled:cursor-not-allowed
              text-white border border-indigo-500/70
              shadow-md transition-all duration-150
            "
          >
            {isGenerating ? (
              <>
                <Spinner />
                Generating…
              </>
            ) : (
              <>
                <span>📥</span>
                Generate Sample CSV
              </>
            )}
          </button>
        </div>

        {generateError && (
          <p className="mb-4 text-red-400 text-sm text-center">{generateError}</p>
        )}

        {/* Header */}
        <div className="flex flex-col items-center text-center mb-8 gap-3">
          <ShieldIcon />
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Zscaler SOC Dashboard
          </h1>
          <p className="text-gray-400 text-sm max-w-md">
            Upload your Zscaler Web Proxy CSV log file for threat analysis
          </p>
        </div>

        {/* ── Drop zone ── */}
        <div
          className={`
            rounded-xl border-2 border-dashed p-10 flex flex-col items-center gap-3
            cursor-pointer transition-all duration-150
            ${
              isDragging
                ? "border-blue-500 bg-blue-950/40"
                : "border-gray-600 hover:border-blue-500"
            }
          `}
          onClick={() => inputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          aria-label="CSV upload zone"
        >
          <CloudUploadIcon />
          <p className="text-gray-300 font-medium">
            Drag &amp; drop your CSV file here
          </p>
          <p className="text-gray-500 text-sm">
            or click to browse — only .csv files accepted
          </p>
          {/* Hidden file input */}
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* ── File validation feedback ── */}
        <div className="mt-3 min-h-[1.5rem]">
          {fileError && (
            <p className="text-red-400 text-sm flex items-center gap-1">
              ❌ {fileError}
            </p>
          )}
          {!fileError && file && (
            <p className="text-green-400 text-sm flex items-center gap-1">
              ✅ <span className="font-medium">{file.name}</span> ready to upload
            </p>
          )}
        </div>

        {/* ── Upload button ── */}
        <button
          onClick={handleUpload}
          disabled={!file || uploading || !!fileError}
          className="
            mt-5 w-full py-3 rounded-xl font-semibold text-white text-base
            bg-gradient-to-r from-blue-600 to-blue-500
            hover:from-blue-500 hover:to-blue-400
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-all duration-150 flex items-center justify-center
          "
        >
          {uploading ? (
            <>
              <Spinner />
              {PROGRESS_STEPS[progressIdx]}
            </>
          ) : (
            "Analyze Logs"
          )}
        </button>

        {/* ── Upload error ── */}
        {uploadError && (
          <p className="mt-3 text-red-400 text-sm text-center">{uploadError}</p>
        )}

        {/* ── Result summary ── */}
        {result && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold mb-4 text-gray-200">
              Analysis Complete
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="Total Rows"
                value={result.totalRows.toLocaleString()}
                colorClass="bg-blue-950/50 border-blue-700/40 text-blue-300"
              />
              <StatCard
                label="Anomalies Found"
                value={result.anomalyCount.toLocaleString()}
                colorClass="bg-red-950/50 border-red-700/40 text-red-300"
              />
              <StatCard
                label="Legitimate"
                value={result.legitimateCount.toLocaleString()}
                colorClass="bg-green-950/50 border-green-700/40 text-green-300"
              />
              <StatCard
                label="Anomaly Rate"
                value={`${result.anomalyPercentage}%`}
                colorClass="bg-orange-950/50 border-orange-700/40 text-orange-300"
              />
            </div>
            <button
              onClick={() => navigate(`/dashboard/${result.sessionId}`)}
              className="
                mt-5 w-full py-3 rounded-xl font-semibold text-white
                bg-gradient-to-r from-indigo-600 to-purple-600
                hover:from-indigo-500 hover:to-purple-500
                transition-all duration-150
              "
            >
              View Dashboard →
            </button>
          </div>
        )}
      </div>

      {/* ── Previous sessions ── */}
      <div className="w-full max-w-2xl mt-10">
        <h2 className="text-xl font-semibold text-gray-200 mb-4">
          Previous Sessions
        </h2>
        <div className="bg-gray-900 border border-gray-700/60 rounded-2xl overflow-hidden">
          {sessionsLoading ? (
            <p className="text-gray-500 text-sm text-center py-8">
              Loading sessions…
            </p>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="text-4xl select-none">📂</span>
              <p className="text-gray-300 font-medium text-sm">
                No previous uploads.
              </p>
              <p className="text-gray-500 text-xs">
                Upload your first log file above to get started.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-gray-700/60 text-gray-400 uppercase text-xs tracking-wider">
                    <th className="text-left px-4 py-3 whitespace-nowrap">Filename</th>
                    <th className="text-left px-4 py-3 whitespace-nowrap">Date</th>
                    <th className="text-right px-4 py-3 whitespace-nowrap">Rows</th>
                    <th className="text-right px-4 py-3 whitespace-nowrap">Anomalies</th>
                    <th className="text-left px-4 py-3 whitespace-nowrap">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s, i) => (
                    <tr
                      key={s.id}
                      className={`
                        border-b border-gray-800 last:border-0
                        ${i % 2 === 0 ? "" : "bg-gray-800/30"}
                        hover:bg-gray-800/50 transition-colors
                      `}
                    >
                      <td className="px-4 py-3 text-gray-200 font-medium max-w-[12rem] truncate">
                        {s.filename}
                      </td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                        {formatDate(s.uploadedAt)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300 whitespace-nowrap">
                        {s.totalRows?.toLocaleString() ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span
                          className={
                            (s.anomalyCount ?? 0) > 0
                              ? "text-red-400 font-semibold"
                              : "text-green-400"
                          }
                        >
                          {s.anomalyCount != null
                            ? `${s.anomalyCount.toLocaleString()} (${pct(
                                s.anomalyCount,
                                s.totalRows ?? 0
                              )}%)`
                            : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => navigate(`/dashboard/${s.id}`)}
                          disabled={s.status !== "completed"}
                          className="
                            px-3 py-1.5 rounded-lg text-xs font-medium
                            bg-blue-700 hover:bg-blue-600 text-white
                            disabled:opacity-30 disabled:cursor-not-allowed
                            transition-colors
                          "
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge helper
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-green-900/50 text-green-300 border-green-700/50",
    processing: "bg-blue-900/50 text-blue-300 border-blue-700/50",
    failed: "bg-red-900/50 text-red-300 border-red-700/50",
  };
  const cls = map[status] ?? "bg-gray-700/50 text-gray-300 border-gray-600/50";
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border capitalize ${cls}`}
    >
      {status}
    </span>
  );
}
