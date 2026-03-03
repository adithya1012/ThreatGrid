import type { DashboardStats } from "../types";

interface InsightCardProps {
  emoji: string;
  label: string;
  value: string | number;
  sub?: string;
  confidence: number;
  accentClass: string;
}

function InsightCard({ emoji, label, value, sub, confidence, accentClass }: InsightCardProps) {
  const confColor =
    confidence >= 90
      ? "text-red-400"
      : confidence >= 70
      ? "text-orange-400"
      : confidence >= 40
      ? "text-yellow-400"
      : "text-gray-400";

  return (
    <div
      className={`
        bg-gray-900 border rounded-xl p-4 flex flex-col gap-2
        hover:border-gray-500 transition-colors
        ${accentClass}
      `}
    >
      <div className="flex items-center justify-between">
        <span className="text-2xl leading-none">{emoji}</span>
        <span className={`text-xs font-semibold ${confColor}`}>
          {confidence}% conf.
        </span>
      </div>
      <p className="text-xs text-gray-400 leading-tight">{label}</p>
      <p className="text-lg font-bold text-white leading-tight truncate" title={String(value)}>
        {value || "—"}
      </p>
      {sub && (
        <p className="text-xs text-gray-500 truncate" title={sub}>
          {sub}
        </p>
      )}
    </div>
  );
}

interface Props {
  stats: DashboardStats;
}

export default function InsightCards({ stats }: Props) {
  const blockRate =
    stats.totalRequests > 0
      ? ((stats.blockedCount / stats.totalRequests) * 100).toFixed(1)
      : "0.0";

  const topRiskyUser = stats.topRiskyUsers?.[0];
  const topThreat = stats.topThreats?.[0];
  const topDept = stats.topDepartments?.[0];

  const cards: InsightCardProps[] = [
    {
      emoji: "🔴",
      label: "Total Threats Detected",
      value: topThreat ? topThreat.count.toLocaleString() : "0",
      sub: topThreat ? topThreat.threatName : "No active threats",
      confidence: 95,
      accentClass: "border-red-900/50",
    },
    {
      emoji: "🟠",
      label: "Block Rate",
      value: `${blockRate}%`,
      sub: `${stats.blockedCount.toLocaleString()} blocked of ${stats.totalRequests.toLocaleString()}`,
      confidence: 99,
      accentClass: "border-orange-900/50",
    },
    {
      emoji: "🟠",
      label: "Top Risky User",
      value: topRiskyUser?.user ?? "N/A",
      sub: topRiskyUser
        ? `${topRiskyUser.anomalyCount} anomalies`
        : "No risky users",
      confidence: 80,
      accentClass: "border-orange-900/50",
    },
    {
      emoji: "🟠",
      label: "Top Blocked Category",
      value: topThreat?.threatName ?? "—",
      sub: `${stats.topThreats?.[0]?.count ?? 0} incidents`,
      confidence: 82,
      accentClass: "border-orange-900/50",
    },
    {
      emoji: "🟠",
      label: "DLP Violations",
      value: stats.anomalyCount.toLocaleString(),
      sub: "Logged anomaly events",
      confidence: 85,
      accentClass: "border-orange-900/50",
    },
    {
      emoji: "🟡",
      label: "SSL Bypass Events",
      value: stats.topThreats?.filter((t) =>
        t.threatName?.toLowerCase().includes("bypass")
      ).length ?? 0,
      sub: "URL category contains 'Bypass'",
      confidence: 90,
      accentClass: "border-yellow-900/50",
    },
    {
      emoji: "🟡",
      label: "Unscannable Transfers",
      value: "—",
      sub: "unscannabletype != None",
      confidence: 72,
      accentClass: "border-yellow-900/50",
    },
    {
      emoji: "🟡",
      label: "Road Warrior Activity",
      value: "—",
      sub: "location = 'Road Warrior'",
      confidence: 88,
      accentClass: "border-yellow-900/50",
    },
    {
      emoji: "🟢",
      label: "Largest Transaction",
      value: topRiskyUser?.user ?? "—",
      sub: "Top data transfer user",
      confidence: 96,
      accentClass: "border-green-900/50",
    },
    {
      emoji: "🟢",
      label: "Most Active Department",
      value: topDept?.department ?? "—",
      sub: topDept ? `${topDept.count.toLocaleString()} requests` : "No data",
      confidence: 78,
      accentClass: "border-green-900/50",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((card) => (
        <InsightCard key={card.label} {...card} />
      ))}
    </div>
  );
}
