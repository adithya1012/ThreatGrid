import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { BarChartData } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hourLabel(raw: string): string {
  // raw: "2024-05-06 10:00" — return "10:00"
  return raw?.slice(-5) ?? raw;
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------
interface TooltipPayload {
  name: string;
  value: number;
  color: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const legit = payload.find((p) => p.name === "Legitimate")?.value ?? 0;
  const anom = payload.find((p) => p.name === "Anomalies")?.value ?? 0;
  const total = legit + anom;

  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 shadow-xl text-xs space-y-1 min-w-[160px]">
      <p className="font-semibold text-gray-300 border-b border-gray-700 pb-1 mb-1">
        Hour: {label ? hourLabel(label) : ""}
      </p>
      <p className="flex justify-between gap-4">
        <span className="text-blue-400">Legitimate</span>
        <span className="font-bold text-gray-100">{legit.toLocaleString()}</span>
      </p>
      <p className="flex justify-between gap-4">
        <span className="text-red-400">Anomalies</span>
        <span className="font-bold text-gray-100">{anom.toLocaleString()}</span>
      </p>
      <p className="flex justify-between gap-4 border-t border-gray-700 pt-1 mt-1">
        <span className="text-gray-400">Total</span>
        <span className="font-bold text-gray-100">{total.toLocaleString()}</span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom X-axis tick (shows only HH:MM, angled)
// ---------------------------------------------------------------------------
function HourTick(props: {
  x?: number;
  y?: number;
  payload?: { value: string };
}) {
  const { x = 0, y = 0, payload } = props;
  const short = hourLabel(payload?.value ?? "");
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={14}
        textAnchor="end"
        fill="#6b7280"
        fontSize={10}
        transform="rotate(-40)"
      >
        {short}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Custom legend (above chart)
// ---------------------------------------------------------------------------
function CustomLegend() {
  const items = [
    { label: "Legitimate", color: "#3b82f6" },
    { label: "Anomalies", color: "#ef4444" },
  ];
  return (
    <div className="flex gap-5 mb-3 flex-wrap">
      {items.map(({ label, color }) => (
        <div key={label} className="flex items-center gap-1.5 text-xs text-gray-400">
          <span
            className="inline-block w-3 h-3 rounded-sm shrink-0"
            style={{ background: color }}
          />
          {label}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------
interface Props {
  data: BarChartData;
}

export default function TimelineBarChart({ data }: Props) {
  const isEmpty = !data.data.length;

  return (
    <div className="bg-gray-900 border border-gray-700/60 rounded-xl p-6 h-full flex flex-col">
      {/* Header */}
      <div className="mb-3">
        <h2 className="text-base font-semibold text-gray-100">
          📊 Hourly Activity Timeline
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Legitimate vs Anomalous requests per hour
        </p>
      </div>

      {/* Legend above chart */}
      <CustomLegend />

      {/* Chart */}
      {isEmpty ? (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          No timeline data available
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height={350}>
            <BarChart
              data={data.data}
              margin={{ top: 4, right: 8, left: -10, bottom: 40 }}
              barSize={10}
              barCategoryGap="25%"
              barGap={2}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#374151"
                vertical={false}
              />
              <XAxis
                dataKey="hour"
                tick={HourTick as never}
                axisLine={{ stroke: "#4b5563" }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "#6b7280", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "#ffffff0a" }} />
              <Legend content={() => null} /> {/* custom legend above */}
              <Bar
                dataKey="legitimate"
                name="Legitimate"
                fill="#3b82f6"
                radius={[3, 3, 0, 0]}
                isAnimationActive
                animationBegin={0}
                animationDuration={800}
              />
              <Bar
                dataKey="anomalies"
                name="Anomalies"
                fill="#ef4444"
                radius={[3, 3, 0, 0]}
                isAnimationActive
                animationBegin={100}
                animationDuration={800}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
