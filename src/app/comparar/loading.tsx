/**
 * Loading skeleton for /comparar
 */
export default function CompararLoading() {
  return (
    <div className="bg-amauta-bg-light flex-1">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="h-9 w-64 bg-amauta-bordo/20 rounded animate-pulse mb-2" />
        <div className="h-4 w-80 bg-amauta-bg-light rounded animate-pulse mb-8" />
        <div className="bg-white rounded-lg border border-amauta-bg-light h-40 animate-pulse mb-6" />
        <div className="bg-white rounded-lg border border-amauta-bg-light h-64 animate-pulse" />
      </div>
    </div>
  );
}
