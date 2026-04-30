"use client";

/**
 * Global error boundary for the App Router.
 * Catches unhandled errors in any page/layout and shows a friendly message
 * instead of a blank screen or silent navigation failure.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex-1 flex items-center justify-center bg-amauta-bg-light">
      <div className="bg-white rounded-lg border border-amauta-bg-light p-10 text-center max-w-md">
        <div className="text-6xl mb-3">⚠️</div>
        <h1 className="text-xl font-bold text-amauta-bordo">
          Algo salió mal
        </h1>
        <p className="mt-2 text-sm text-amauta-text-secondary">
          {error?.message?.includes("fonditos") || error?.message?.includes("HTTP")
            ? "No pudimos cargar los datos de fondos. Intentá de nuevo en unos minutos."
            : "Ocurrió un error inesperado. Por favor recargá la página."}
        </p>
        <button
          onClick={reset}
          className="mt-5 inline-flex items-center justify-center px-5 py-2 rounded-md bg-amauta-yellow text-amauta-dark font-bold text-sm hover:bg-amauta-yellow-hover transition-colors"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
