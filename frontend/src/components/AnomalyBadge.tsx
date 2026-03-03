interface Props {
  confidence: number;
  reason: string;
}

export default function AnomalyBadge({ confidence, reason }: Props) {
  let emoji: string;
  let label: string;
  let colorClasses: string;

  if (confidence >= 90) {
    emoji = "🔴";
    label = "CRITICAL";
    colorClasses =
      "bg-red-900/50 text-red-300 border border-red-700/60";
  } else if (confidence >= 70) {
    emoji = "🟠";
    label = "HIGH";
    colorClasses =
      "bg-orange-900/50 text-orange-300 border border-orange-700/60";
  } else if (confidence >= 40) {
    emoji = "🟡";
    label = "MEDIUM";
    colorClasses =
      "bg-yellow-900/50 text-yellow-300 border border-yellow-700/60";
  } else {
    emoji = "⚪";
    label = "LOW";
    colorClasses =
      "bg-gray-700/50 text-gray-300 border border-gray-600/60";
  }

  return (
    <span
      title={reason}
      className={`
        relative group inline-flex items-center gap-1
        px-2 py-0.5 rounded-full text-xs font-semibold
        cursor-default select-none
        ${colorClasses}
      `}
    >
      {emoji} {label} {confidence}%
      {/* Tooltip */}
      {reason && (
        <span
          className="
            pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2
            w-max max-w-xs px-3 py-2 rounded-lg
            bg-gray-800 text-gray-100 text-xs font-normal
            border border-gray-600 shadow-lg
            opacity-0 group-hover:opacity-100 transition-opacity duration-150
            whitespace-pre-wrap z-50
          "
        >
          {reason}
          {/* Tooltip arrow */}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-600" />
        </span>
      )}
    </span>
  );
}
