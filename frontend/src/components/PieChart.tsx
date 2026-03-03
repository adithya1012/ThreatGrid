import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";
import type { PieChartData } from "../types";

const COLORS: Record<string, string> = {
  Legitimate: "#22c55e",
  Anomaly: "#ef4444",
};
const FALLBACK_COLORS = ["#22c55e", "#ef4444"];

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------
interface TooltipPayload {
  name: string;
  value: number;
  payload: { name: string; value: number; percentage: number };
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length) return null;
  const { name, value, percentage } = payload[0].payload;
  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="font-semibold text-gray-100">
        {name}:{" "}
        <span className="font-bold">
          {percentage}% ({value.toLocaleString()} requests)
        </span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom label rendered inside each segment
// ---------------------------------------------------------------------------
const RADIAN = Math.PI / 180;

function InsideLabel(props: PieLabelRenderProps) {
  const {
    cx, cy, midAngle, innerRadius, outerRadius, payload,
  } = props;
  const pct =
    (payload as { percentage?: number } | undefined)?.percentage ?? 0;
  if (pct < 5) return null;
  const cxN = Number(cx ?? 0);
  const cyN = Number(cy ?? 0);
  const midA = Number(midAngle ?? 0);
  const inner = Number(innerRadius ?? 0);
  const outer = Number(outerRadius ?? 0);
  const radius = inner + (outer - inner) * 0.55;
  const x = cxN + radius * Math.cos(-midA * RADIAN);
  const y = cyN + radius * Math.sin(-midA * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={13}
      fontWeight={700}
    >
      {pct}%
    </text>
  );
}

// ---------------------------------------------------------------------------
// Custom legend
// ---------------------------------------------------------------------------
interface LegendItem {
  name: string;
  value: number;
  percentage: number;
}

function CustomLegend({ items }: { items: LegendItem[] }) {
  return (
    <div className="flex justify-center gap-6 mt-4 flex-wrap">
      {items.map((item) => (
        <div key={item.name} className="flex items-center gap-2 text-sm">
          <span
            className="inline-block w-3 h-3 rounded-full shrink-0"
            style={{ background: COLORS[item.name] ?? "#6b7280" }}
          />
          <span className="text-gray-300 font-medium">{item.name}</span>
          <span className="text-gray-500 text-xs">
            {item.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------
interface Props {
  data: PieChartData;
}

export default function AnomalyPieChart({ data }: Props) {
  const total = data.data.reduce((s, d) => s + d.value, 0);

  // Empty state — no data rows yet
  if (total === 0) {
    return (
      <div className="bg-gray-900 border border-gray-700/60 rounded-xl p-6 h-full flex flex-col items-center justify-center min-h-[300px] gap-3">
        <span className="text-4xl select-none opacity-40">🥧</span>
        <p className="text-gray-400 text-sm font-medium">No request data yet</p>
        <p className="text-gray-600 text-xs">Upload a CSV file to see the classification chart.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-700/60 rounded-xl p-6 h-full flex flex-col">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-100">
          🥧 Request Classification
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Legitimate vs Anomalous traffic
        </p>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data.data.map((d) => ({
                ...d,
                percentage: Math.round((d.value / total) * 100),
              }))}
              cx="50%"
              cy="45%"
              innerRadius={70}
              outerRadius={115}
              dataKey="value"
              nameKey="name"
              paddingAngle={3}
              isAnimationActive
              animationBegin={0}
              animationDuration={800}
              labelLine={false}
              label={InsideLabel}
            >
              {data.data.map((entry, i) => (
                <Cell
                  key={entry.name}
                  fill={COLORS[entry.name] ?? FALLBACK_COLORS[i % 2]}
                  stroke="transparent"
                />
              ))}
              {/* Center label rendered as a custom label on the innermost point */}
            </Pie>
            {/* Overlay the center text by re-using the Pie label trick */}
            <Tooltip content={<CustomTooltip />} />
            <Legend content={() => null} /> {/* we render our own below */}
          </PieChart>
        </ResponsiveContainer>
        {/* Manual center label overlay — positioned absolutely over the donut hole */}
      </div>

      {/* Center total — rendered outside chart as an overlay approach via SVG-foreign trick */}
      {/* We use a separate absolutely-positioned div trick */}
      <div
        style={{
          position: "relative",
          marginTop: -300,
          pointerEvents: "none",
          height: 300,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{ marginBottom: "12%" }}
          className="text-center pointer-events-none select-none"
        >
          <p className="text-2xl font-bold text-white leading-none">
            {total.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">Total Requests</p>
        </div>
      </div>

      {/* Custom legend */}
      <CustomLegend items={data.data} />
    </div>
  );
}
