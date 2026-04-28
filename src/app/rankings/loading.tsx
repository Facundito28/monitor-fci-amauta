/**
 * Loading skeleton for /rankings
 */
export default function RankingsLoading() {
  return (
    <div className="bg-amauta-bg-light flex-1">
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-6">
          <div className="h-9 w-64 bg-amauta-bordo/20 rounded animate-pulse" />
          <div className="mt-2 h-4 w-56 bg-amauta-bg-light rounded animate-pulse" />
        </div>

        {/* Period tabs skeleton */}
        <div className="bg-white rounded-lg border border-amauta-bg-light p-3 mb-6 h-14 animate-pulse" />

        {/* Cards grid skeleton */}
        <div className="grid gap-6 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-lg border border-amauta-bg-light overflow-hidden"
            >
              <div className="bg-amauta-dark h-14 animate-pulse" />
              {Array.from({ length: 8 }).map((_, j) => (
                <div
                  key={j}
                  className="flex gap-3 px-3 py-2 border-t border-amauta-bg-light"
                >
                  <div className="h-4 w-5 bg-amauta-bg-light rounded animate-pulse" />
                  <div className="h-4 flex-1 bg-amauta-bg-light rounded animate-pulse" />
                  <div className="h-4 w-20 bg-amauta-bg-light rounded animate-pulse" />
                  <div className="h-4 w-16 bg-amauta-bg-light rounded animate-pulse" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
