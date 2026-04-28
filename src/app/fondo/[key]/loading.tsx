/**
 * Loading skeleton for /fondo/[key]
 */
export default function FondoLoading() {
  return (
    <div className="bg-amauta-bg-light flex-1">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Breadcrumb */}
        <div className="h-4 w-48 bg-amauta-bg-light rounded animate-pulse mb-4" />

        {/* Header card */}
        <div className="bg-amauta-dark rounded-lg p-6 mb-6 animate-pulse">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex gap-2 mb-2">
                <div className="h-5 w-24 bg-white/20 rounded" />
                <div className="h-5 w-20 bg-white/10 rounded" />
              </div>
              <div className="h-8 w-96 bg-white/20 rounded" />
              <div className="mt-2 h-4 w-40 bg-white/10 rounded" />
            </div>
          </div>
          {/* KPIs */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white/5 rounded-lg px-4 py-3 h-16" />
            ))}
          </div>
        </div>

        {/* Rendimientos table */}
        <div className="bg-white rounded-lg border border-amauta-bg-light overflow-hidden mb-6">
          <div className="bg-amauta-dark h-10" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3 border-t border-amauta-bg-light">
              <div className="h-4 w-32 bg-amauta-bg-light rounded animate-pulse" />
              <div className="ml-auto h-4 w-20 bg-amauta-bg-light rounded animate-pulse" />
              <div className="h-4 w-20 bg-amauta-bg-light rounded animate-pulse" />
            </div>
          ))}
        </div>

        {/* Composición */}
        <div className="bg-white rounded-lg border border-amauta-bg-light overflow-hidden mb-6">
          <div className="bg-amauta-dark h-10" />
          <div className="p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="mb-3">
                <div className="h-3 w-48 bg-amauta-bg-light rounded animate-pulse mb-1" />
                <div className="h-2 bg-amauta-bg-light rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amauta-bordo/30 rounded-full animate-pulse"
                    style={{ width: `${80 - i * 10}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
