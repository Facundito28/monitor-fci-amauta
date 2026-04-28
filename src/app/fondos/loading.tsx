/**
 * Loading skeleton for /fondos — shown instantly on click while the page
 * fetches data from CAFCI (Next.js App Router streaming).
 */
export default function FondosLoading() {
  return (
    <div className="bg-amauta-bg-light flex-1">
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Header skeleton */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <div className="h-9 w-80 bg-amauta-bordo/20 rounded animate-pulse" />
            <div className="mt-2 h-4 w-64 bg-amauta-bg-light rounded animate-pulse" />
          </div>
        </div>

        {/* Filter bar skeleton */}
        <div className="bg-white rounded-lg border border-amauta-bg-light p-4 mb-6 h-20 animate-pulse" />

        {/* Table skeleton */}
        <div className="bg-white rounded-lg border border-amauta-bg-light overflow-hidden">
          <div className="bg-amauta-dark h-12" />
          {Array.from({ length: 15 }).map((_, i) => (
            <div
              key={i}
              className="flex gap-3 px-3 py-3 border-t border-amauta-bg-light"
            >
              <div className="h-4 w-6 bg-amauta-bg-light rounded animate-pulse" />
              <div className="h-4 flex-1 bg-amauta-bg-light rounded animate-pulse" />
              <div className="h-4 w-24 bg-amauta-bg-light rounded animate-pulse" />
              <div className="h-4 w-28 bg-amauta-bg-light rounded animate-pulse" />
              <div className="h-4 w-20 bg-amauta-bg-light rounded animate-pulse" />
              <div className="h-4 w-24 bg-amauta-bg-light rounded animate-pulse" />
              <div className="h-4 w-16 bg-amauta-bg-light rounded animate-pulse" />
              <div className="h-4 w-16 bg-amauta-bg-light rounded animate-pulse" />
              <div className="h-4 w-16 bg-amauta-bg-light rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
