/**
 * Detalle de un fondo / clase.
 * URL: /fondo/[key]  donde key = encodeURIComponent(displayName del fondo).
 *
 * Datos: planilla diaria oficial de CAFCI vía getMarketSnapshotWithReturns().
 * Ya viene con VCP, AUM, retornos pre-calculados (1D/MTD/YTD/13M),
 * honorarios completos y calificación.
 */
import Link from "next/link";
import {
  fmtDateAr,
  getMarketSnapshotWithReturns,
} from "@/lib/fondos/enriched";
import { fmtCompactCurrency, fmtNumber, fmtReturn } from "@/lib/utils/format";
import { EstrategiaBadge } from "@/components/EstrategiaBadge";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export default async function FondoDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const displayName = decodeURIComponent(key);

  const snap = await getMarketSnapshotWithReturns().catch(() => null);

  if (!snap) {
    return <ErrorState message="No pudimos cargar los datos de fondos." />;
  }

  const fondo = snap.rows.find((r) => r.key === displayName);

  if (!fondo) {
    return (
      <ErrorState
        message={`No se encontró el fondo "${displayName}". Puede que el nombre haya cambiado.`}
      />
    );
  }

  const tienHonorarios =
    fondo.feeGestion != null ||
    fondo.feeDepositaria != null ||
    fondo.comIngreso != null ||
    fondo.comRescate != null;

  return (
    <div className="bg-amauta-bg-light flex-1">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Breadcrumb */}
        <nav className="mb-4 text-sm text-amauta-text-tertiary">
          <Link href="/fondos" className="hover:text-amauta-bordo">
            Fondos
          </Link>{" "}
          /{" "}
          <span className="text-amauta-text-secondary truncate">
            {fondo.displayName}
          </span>
        </nav>

        {/* ── Header ── */}
        <div className="bg-amauta-dark text-white rounded-lg p-6 mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap gap-2 mb-2">
                <EstrategiaBadge value={fondo.estrategia} />
                {fondo.categoria && fondo.categoria !== fondo.estrategia && (
                  <span className="inline-block bg-amauta-yellow text-amauta-dark text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded">
                    {fondo.categoria}
                  </span>
                )}
                {fondo.horizonte && (
                  <span className="inline-block border border-white/30 text-white/80 text-xs font-medium px-2 py-0.5 rounded">
                    {fondo.horizonte}
                  </span>
                )}
                {fondo.region && (
                  <span className="inline-block border border-white/30 text-white/80 text-xs font-medium px-2 py-0.5 rounded">
                    {fondo.region}
                  </span>
                )}
                {fondo.calificacion && (
                  <span className="inline-block border border-white/30 text-white/80 text-xs font-medium px-2 py-0.5 rounded">
                    Cal. {fondo.calificacion}
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight">
                {fondo.displayName}
              </h1>
              {fondo.gestora && (
                <p className="mt-1 text-white/70 text-sm">{fondo.gestora}</p>
              )}
              {fondo.depositaria && (
                <p className="mt-0.5 text-white/50 text-xs">
                  Depositaria: {fondo.depositaria}
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-white/50 uppercase tracking-wider">
                Cierre
              </p>
              <p className="text-lg font-bold text-amauta-yellow">
                {fmtDateAr(fondo.fecha)}
              </p>
            </div>
          </div>

          {/* KPIs */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
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
            <Kpi
              label="Hon. Gerente"
              value={
                fondo.feeGestion != null
                  ? `${fondo.feeGestion.toFixed(2)}%`
                  : "—"
              }
            />
          </div>
        </div>

        {/* ── Rendimientos ── */}
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
                  <th className="px-4 py-2 text-right font-bold">
                    Rendimiento
                  </th>
                  <th className="px-4 py-2 text-right font-bold">
                    TNA (anual)
                  </th>
                </tr>
              </thead>
              <tbody>
                <ReturnRow
                  label="Diario (1D)"
                  simple={fondo.ret1d}
                  tna={fondo.tna1d}
                />
                <ReturnRow
                  label="Mensual"
                  simple={fondo.retMTD}
                  tna={fondo.tna30d}
                />
                <ReturnRow
                  label="Año en Curso (YTD)"
                  simple={fondo.ytd}
                  tna={null}
                />
                <ReturnRow
                  label="Interanual"
                  simple={fondo.ret13m}
                  tna={fondo.tna1a}
                />
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-xs text-amauta-text-tertiary border-t border-amauta-bg-light bg-amauta-bg-light/30">
            Variaciones pre-calculadas por CAFCI · Mensual = desde fin de mes anterior · Interanual = vs misma fecha del año anterior · TNA = rendimiento × 365/días
          </div>
        </section>

        {/* ── Composición de Cartera ── */}
        {fondo.cartera.length > 0 && (
          <section className="bg-white rounded-lg border border-amauta-bg-light overflow-hidden mb-6">
            <header className="bg-amauta-dark text-white px-4 py-3 flex items-center justify-between gap-3">
              <h2 className="font-extrabold text-sm uppercase tracking-wider">
                Composición de Cartera
              </h2>
              <span className="text-xs text-white/50 font-medium">
                Top {fondo.cartera.length} activos
              </span>
            </header>
            <div className="px-4 py-4 space-y-2">
              {fondo.cartera.map((h) => {
                const tipoStyle = TIPO_BAR_COLOR[h.tipo_activo] ?? "bg-slate-400";
                return (
                  <div key={h.rank} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm mb-1">
                        <span className="font-medium text-amauta-text truncate">
                          {h.activo}
                        </span>
                        <span
                          className="inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-amauta-text-secondary bg-amauta-bg-light shrink-0"
                          title={`Tipo de activo: ${h.tipo_activo}`}
                        >
                          {h.tipo_activo}
                        </span>
                      </div>
                      <div className="h-2 bg-amauta-bg-light rounded-full overflow-hidden">
                        <div
                          className={`h-full ${tipoStyle}`}
                          style={{ width: `${Math.min(100, h.share)}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-amauta-bordo whitespace-nowrap w-14 text-right">
                      {h.share.toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-amauta-bg-light bg-amauta-bg-light/30 px-4 py-2 text-xs text-amauta-text-tertiary">
              Composición semanal · Fuente: <a href="https://www.cafci.org.ar/" target="_blank" rel="noreferrer" className="underline hover:text-amauta-bordo">CAFCI</a>
            </div>
          </section>
        )}

        {/* ── Honorarios ── */}
        {tienHonorarios && (
          <section className="bg-white rounded-lg border border-amauta-bg-light overflow-hidden mb-6">
            <header className="bg-amauta-dark text-white px-4 py-3">
              <h2 className="font-extrabold text-sm uppercase tracking-wider">
                Honorarios y Comisiones
              </h2>
            </header>
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-amauta-bg-light">
              <HonorarioCell label="Hon. Gerente" value={fondo.feeGestion} />
              <HonorarioCell
                label="Hon. Depositaria"
                value={fondo.feeDepositaria}
              />
              <HonorarioCell label="Com. Ingreso" value={fondo.comIngreso} />
              <HonorarioCell label="Com. Rescate" value={fondo.comRescate} />
            </div>
            {(fondo.honExito === "S" || fondo.plazoRescate != null) && (
              <div className="border-t border-amauta-bg-light px-4 py-2 text-xs text-amauta-text-tertiary flex flex-wrap gap-x-6 gap-y-1">
                {fondo.honExito === "S" && (
                  <span>· Cobra honorario de éxito</span>
                )}
                {fondo.plazoRescate != null && (
                  <span>
                    · Plazo de liquidación: {fondo.plazoRescate}{" "}
                    {fondo.plazoRescate === 1 ? "día hábil" : "días hábiles"}
                  </span>
                )}
              </div>
            )}
          </section>
        )}

        {/* ── Acciones ── */}
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={`/comparar?fondos=${encodeURIComponent(fondo.key)}`}
            className="inline-flex items-center justify-center px-5 py-2 rounded-md bg-amauta-yellow text-amauta-dark font-bold text-sm hover:bg-amauta-yellow-hover transition-colors"
          >
            Comparar este fondo →
          </Link>
          <a
            href={`/api/fondo/pdf?key=${encodeURIComponent(fondo.key)}`}
            download
            className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-md bg-amauta-bordo text-white font-bold text-sm hover:opacity-90 transition-opacity"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
              aria-hidden="true"
            >
              <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
              <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
            </svg>
            Descargar PDF
          </a>
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
  simple,
  tna,
}: {
  label: string;
  simple: number | null | undefined;
  tna: number | null | undefined;
}) {
  const simpleFmt = fmtReturn(simple ?? null, 2);
  const tnaFmt = fmtReturn(tna ?? null, 2);
  return (
    <tr className="border-t border-amauta-bg-light">
      <td className="px-4 py-3 text-amauta-text-secondary">{label}</td>
      <td
        className={`px-4 py-3 text-right tabular-nums font-semibold ${simpleFmt.colorClass}`}
      >
        {simpleFmt.text}
      </td>
      <td
        className={`px-4 py-3 text-right tabular-nums text-xs ${tnaFmt.colorClass}`}
      >
        {tnaFmt.text}
      </td>
    </tr>
  );
}

function HonorarioCell({
  label,
  value,
}: {
  label: string;
  value: number | null | undefined;
}) {
  return (
    <div className="px-4 py-3 text-center">
      <p className="text-xs text-amauta-text-tertiary uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="font-bold text-amauta-bordo tabular-nums">
        {value != null ? `${value.toFixed(2)}%` : "—"}
      </p>
    </div>
  );
}

/**
 * Colores Tailwind para las barras de la composición de cartera, agrupadas
 * por tipo_activo (output de cartera-client.ts:classifyActivo).
 *
 * Mapeo intuitivo: liquidez = verdes, ARS soberano = azules/violetas, USD =
 * cian/índigo, equity = naranja, otros = grises.
 */
const TIPO_BAR_COLOR: Record<string, string> = {
  // Cash equivalents — tonos verdes
  "Plazo Fijo":   "bg-emerald-400",
  "Cta Cte":      "bg-emerald-300",
  "Caución":      "bg-teal-400",
  "Cheque":       "bg-teal-300",
  // Soberano ARS tasa fija — azules
  "Lecap":        "bg-blue-500",
  "Bonte":        "bg-blue-400",
  // Soberano ARS CER — violetas
  "Lecer":        "bg-purple-500",
  "Boncer":       "bg-purple-400",
  // ARS atado al USD — ámbar
  "Dólar Linked": "bg-amber-400",
  // USD — cian / índigo
  "Hard USD":     "bg-cyan-500",
  "ON":           "bg-indigo-400",
  // Equity / FCI / agregado / otros — grises y naranjas
  "Acciones":     "bg-orange-400",
  "FCI":          "bg-pink-300",
  "Resto":        "bg-slate-300",
  "Otros":        "bg-slate-400",
};

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
