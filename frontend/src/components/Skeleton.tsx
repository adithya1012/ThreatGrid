// ---------------------------------------------------------------------------
// Shared skeleton loading components
// All use: animate-pulse bg-gray-800 rounded (Tailwind)
// ---------------------------------------------------------------------------

// ── SkeletonCard ─────────────────────────────────────────────────────────────
/** Placeholder for a KPI / stat card. */
export function SkeletonCard() {
  return (
    <div className="bg-gray-900 border border-gray-700/40 rounded-2xl p-5 animate-pulse">
      {/* icon placeholder */}
      <div className="h-6 w-6 bg-gray-800 rounded mb-3" />
      {/* large number */}
      <div className="h-8 bg-gray-800 rounded w-3/4 mb-2" />
      {/* label */}
      <div className="h-3 bg-gray-800 rounded w-1/2" />
    </div>
  );
}

// ── SkeletonTable ────────────────────────────────────────────────────────────
/** Placeholder for 10 animated table rows (10 columns each). */
export function SkeletonTable({ rows = 10 }: { rows?: number }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm">
        {/* header */}
        <thead>
          <tr className="border-b border-gray-800">
            {Array.from({ length: 10 }).map((_, i) => (
              <th key={i} className="px-3 py-3 text-left">
                <div className="h-3 bg-gray-800 rounded animate-pulse w-16" />
              </th>
            ))}
          </tr>
        </thead>
        {/* rows */}
        <tbody>
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <tr
              key={rowIdx}
              className={`border-b border-gray-800 last:border-0 animate-pulse ${
                rowIdx % 2 === 0 ? "" : "bg-gray-800/20"
              }`}
            >
              {Array.from({ length: 10 }).map((_, colIdx) => (
                <td key={colIdx} className="px-3 py-3">
                  <div
                    className="h-3 bg-gray-800 rounded"
                    style={{ width: `${50 + ((colIdx * 13 + rowIdx * 7) % 40)}%` }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── SkeletonChart ────────────────────────────────────────────────────────────
/** Placeholder for a chart area. */
export function SkeletonChart({ height = 300 }: { height?: number }) {
  return (
    <div
      className="bg-gray-900 border border-gray-700/40 rounded-2xl p-6 animate-pulse flex flex-col gap-3"
      style={{ minHeight: height }}
    >
      {/* title */}
      <div className="h-4 bg-gray-800 rounded w-1/3" />
      {/* legend dots */}
      <div className="flex gap-4 mt-1">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full bg-gray-700" />
          <div className="h-3 bg-gray-800 rounded w-16" />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full bg-gray-700" />
          <div className="h-3 bg-gray-800 rounded w-16" />
        </div>
      </div>
      {/* chart body */}
      <div
        className="flex-1 bg-gray-800 rounded-xl mt-2"
        style={{ minHeight: height - 80 }}
      >
        {/* faint bar columns for bar chart illusion */}
        <div className="flex items-end h-full gap-1.5 p-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 bg-gray-700/60 rounded-t"
              style={{ height: `${30 + ((i * 17) % 55)}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
