/**
 * Detalle de un fondo / clase.
 *
 * URL: /fondo/[key]  donde key = encodeURIComponent(displayName)
 *
 * Muestra:
 *  - Header con nombre, gestora, categoría, horizonte
 *  - KPIs: VCP, AUM, cuotapartes
 *  - Tabla de rendimientos: 1D, 7D, 30D, 1A (TNA y % simple)
 *  - Composición de cartera (CAFCI live, si está disponible)
 */
import Link from "next/link";
import {
  fmtDateAr,
  getFondoComposicion,
  getMarketSnapshotWithReturns,
} from "@/lib/cafci/enriched";
import type { CarteraRow, EnrichedRow } from "@/lib/cafci/enriched";
import { fmtCompactCurrency, fmtNumber, fmtReturn } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function FondoDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const displayName = decodeURIComponent(key);

  const snap = await getMarketSnapshotWithReturns().catch(() => null);

  if (!snap) {
    return <ErrorState message="No se pudo conectar con CAFCI." />;
  }

  const fondo = snap.rows.find(
    (r) => r.key === displayName || r.displayName === displayName,
  );

  if (!fondo) {
    return (
      <ErrorState message={`No se encontró el fondo "${displayName}".`} />
    );
  }

  // Fetch composition in parallel (non-blocking — shows placeholder on failure)
  const composicion = await getFondoComposicion(
    fondo.displayName,
    fondo.tipoRentaId,
    fondo.fecha,
  );

  return (
    <div className="bg-amauta-bg-light flex-1">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Breadcrumb */}
        <nav className="mb-4 text-sm text-amauta-text-tertiary">
          <Link href="/fondos" className="hover:text-amauta-bordo">
            Fondos
          </Link>{" "}
          / <span className="text-amauta-text-secondary">{fondo.displayName}</span>
        </nav>

        {/* Header */}
        <div className="bg-amauta-dark text-white rounded-lg p-6 mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap gap-2 mb-2">
                {fondo.categoria && (
                  <span className="inline-block bg-amauta-yellow text-amauta-dark text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded">
                    {fondo.categoria}
                  </span>
                )}
                {fondo.horizonte && (
                  <span className="inline-block border border-white/30 text-white/80 text-xs font-medium px-2 py-0.5 rounded">
                    {fondo.horizonte}
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight">
                {fondo.displayName}
              </h1>
              {fondo.gestora && (
                <p className="mt-1 text-white/70 text-sm">{fondo.gestora}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-white/50 uppercase tracking-wider">Cierre</p>
              <p className="text-lg font-bold text-amauta-yellow">
                {fmtDateAr(fondo.fecha)}
              </p>
            </div>
          </div>

          {/* KPIs */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Kpi label="VCP" value={fmtNumber(fondo.vcp, 4)} />
            <Kpi
              label="Patrimonio (AUM)"
              value={
                fondo.patrimonio
                  ? fmtCompactCurrency(fondo.patrimonio, "ARS")
                  : "—"
              }
            />
            <Kpi
              label="Cuotapartes"
              value={fondo.ccp ? fmtNumber(fondo.ccp, 0) : "—"}
            />
          </div>
        </div>

        {/* Rendimientos */}
        <section className="bg-white rounded-lg border border-amauta-bg-light overflow-hidden mb-6">
          <header className="bg-amauta-dark text-white px-4 py-3">
            <h2 className="font-extrabold text-sm uppercase tracking-wider">
              Rendimientos Históricos
            </h2>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-amauta-bg-light/50 text-amauta-text-tertiary text-xs uppercase">
                <tr>
                  <th className="px-4 py-2 text-left font-bold">Período</th>
                  <th className="px-4 py-2 text-right font-bold">Rendimiento</th>
                  <th className="px-4 py-2 text-right font-bold">TNA equiv.</th>
                </tr>
              </thead>
              <tbody>
                <ReturnRow
                  label="Diario (1D)"
                  ret={fondo.ret1d}
                  tna={fondo.tna1d}
                />
                <ReturnRow label="Semanal (7D)" ret={fondo.ret7d} tna={null} />
                <ReturnRow
                  label="Mensual (30D)"
                  ret={fondo.ret30d}
                  tna={fondo.tna30d}
                />
                <ReturnRow
                  label="Interanual (1A)"
                  ret={fondo.ret1a}
                  tna={fondo.tna1a}
                />
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-xs text-amauta-text-tertiary border-t border-amauta-bg-light bg-amauta-bg-light/30">
            TNA = (rendimiento del período × 365/días) × 100. Fuente: CAFCI.
          </div>
        </section>

        {/* Composición */}
        <ComposicionSection composicion={composicion} />

        {/* Acciones */}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/comparar?fondos=${encodeURIComponent(fondo.key)}`}
            className="inline-flex items-center justify-center px-5 py-2 rounded-md bg-amauta-yellow text-amauta-dark font-bold text-sm hover:bg-amauta-yellow-hover transition-colors"
          >
            Comparar este fondo →
          </Link>
          <Link
            href="/fondos"
            className="inline-flex items-center justify-center px-5 py-2 rounded-md border border-amauta-bg-light text-amauta-text-secondary font-medium text-sm hover:bg-amauta-bg-light transition-colors"
          >
            ← Volver al listado
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-white/60">
        {label}
      </div>
      <div className="text-xl font-extrabold text-amauta-yellow mt-0.5 tabular-nums">
        {value}
      </div>
    </div>
  );
}

function ReturnRow({
  label,
  ret,
  tna,
}: {
  label: string;
  ret: number | null;
  tna: number | null;
}) {
  const retFmt = fmtReturn(ret, 2);
  const tnaFmt = fmtReturn(tna, 2);
  return (
    <tr className="border-t border-amauta-bg-light">
      <td className="px-4 py-3 text-amauta-text-secondary">{label}</td>
      <td className={`px-4 py-3 text-right tabular-nums ${retFmt.colorClass}`}>
        {retFmt.text}
      </td>
      <td className={`px-4 py-3 text-right tabular-nums ${tna != null ? tnaFmt.colorClass : "text-amauta-text-tertiary"}`}>
        {tna != null ? tnaFmt.text : "—"}
      </td>
    </tr>
  );
}

function ComposicionSection({
  composicion,
}: {
  composicion: CarteraRow[] | null;
}) {
  return (
    <section className="bg-white rounded-lg border border-amauta-bg-light overflow-hidden">
      <header className="bg-amauta-dark text-white px-4 py-3 flex items-center justify-between">
        <h2 className="font-extrabold text-sm uppercase tracking-wider">
          Composición de Cartera
        </h2>
        <span className="text-xs text-white/50">CAFCI Live</span>
      </header>

      {composicion == null ? (
        <div className="px-4 py-8 text-center text-amauta-text-tertiary text-sm">
          <div className="text-3xl mb-2">📊</div>
          <p className="font-medium">Composición no disponible</p>
          <p className="mt-1 text-xs">
            La API de CAFCI no expone la cartera detallada para este fondo.
          </p>
        </div>
      ) : (
        <>
          {/* Bar chart visual */}
          <div className="px-4 pt-4 pb-2">
            {composicion.slice(0, 10).map((h, i) => {
              const colors = [
                "bg-amauta-bordo",
                "bg-amauta-yellow",
                "bg-blue-500",
                "bg-emerald-500",
                "bg-purple-500",
                "bg-orange-500",
                "bg-teal-500",
                "bg-pink-500",
                "bg-indigo-500",
                "bg-amber-400",
              ];
              const color = colors[i % colors.length];
              return (
                <div key={i} className="mb-2">
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="font-medium text-amauta-text-secondary truncate max-w-[70%]">
                      {h.nombreActivo}
                    </span>
                    <span className="tabular-nums font-semibold text-amauta-bordo">
                      {fmtNumber(h.porcentaje, 2)}%
                    </span>
                  </div>
                  <div className="h-2 bg-amauta-bg-light rounded-full overflow-hidden">
                    <div
                      className={`h-full ${color} rounded-full`}
                      style={{ width: `${Math.min(h.porcentaje, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Table */}
          <div className="overflow-x-auto border-t border-amauta-bg-light">
            <table className="w-full text-sm">
              <thead className="bg-amauta-bg-light/50 text-amauta-text-tertiary text-xs uppercase">
                <tr>
                  <th className="px-4 py-2 text-left font-bold">Activo</th>
                  <th className="px-4 py-2 text-left font-bold">Tipo</th>
                  <th className="px-4 py-2 text-right font-bold">Peso</th>
                </tr>
              </thead>
              <tbody>
                {composicion.map((h, i) => (
                  <tr
                    key={i}
                    className="border-t border-amauta-bg-light hover:bg-amauta-bg-light/40"
                  >
                    <td className="px-4 py-2 font-medium text-amauta-bordo">
                      {h.nombreActivo}
                    </td>
                    <td className="px-4 py-2 text-amauta-text-tertiary text-xs">
                      {h.tipoActivo ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold text-amauta-text-secondary">
                      {fmtNumber(h.porcentaje, 2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-xs text-amauta-text-tertiary border-t border-amauta-bg-light">
            Datos provistos por CAFCI. Verificar con la fuente oficial.
          </p>
        </>
      )}
    </section>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-amauta-bg-light">
      <div className="bg-white rounded-lg border border-amauta-bg-light p-10 text-center max-w-md">
        <div className="text-6xl mb-3">⚠️</div>
        <h1 className="text-xl font-bold text-amauta-bordo">Error</h1>
        <p className="mt-2 text-sm text-amauta-text-secondary">{message}</p>
        <Link
          href="/fondos"
          className="mt-4 inline-block text-sm text-amauta-bordo underline"
        >
          ← Volver al listado
        </Link>
      </div>
    </div>
  );
}
