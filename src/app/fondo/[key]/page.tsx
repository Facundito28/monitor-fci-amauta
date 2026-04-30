/**
 * Detalle de un fondo / clase.
 * URL: /fondo/[key]  donde key = encodeURIComponent(displayName del fondo).
 *
 * Datos:
 *   - Bulk snapshot (`getMarketSnapshotWithReturns`) → encontrar la fila.
 *   - Detalle (`getFondoDetalle`) → volatilidad, sharpe, rend 7d / 90d.
 *   - Rendimiento por período (`getReturnInRange`) → cálculo server-side.
 */
import Link from "next/link";
import {
  fmtDateAr,
  getFondoDetalle,
  getMarketSnapshotWithReturns,
  getReturnInRange,
} from "@/lib/fondos/enriched";
import { fmtCompactCurrency, fmtNumber, fmtReturn } from "@/lib/utils/format";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export default async function FondoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const [{ key }, sp] = await Promise.all([params, searchParams]);
  const displayName = decodeURIComponent(key);
  const desde = sp.desde?.trim() ?? "";
  const hasta = sp.hasta?.trim() ?? "";

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

  // Detail call (vol, sharpe, 7d / 90d) — non-blocking-ish; tolerate failure.
  const detalle = await getFondoDetalle(fondo.displayName).catch(() => null);

  // ── Custom date range query ────────────────────────────────────────────────
  type CustomResult = {
    vcpDesde: number;
    dateDesde: string;
    vcpHasta: number;
    dateHasta: string;
    ret: number;
    dias: number;
    tna: number;
  };
  let customResult: CustomResult | null = null;
  let customError: string | null = null;

  if (desde && hasta) {
    if (desde >= hasta) {
      customError = "La fecha inicio debe ser anterior a la fecha fin.";
    } else {
      const r = await getReturnInRange(fondo.displayName, desde, hasta).catch(
        () => null,
      );
      if (!r) {
        customError =
          "No pudimos calcular el rendimiento para ese rango. Probá con días hábiles dentro del histórico disponible.";
      } else {
        customResult = {
          vcpDesde: r.vcpFrom,
          dateDesde: r.fechaFrom,
          vcpHasta: r.vcpTo,
          dateHasta: r.fechaTo,
          ret: r.retPct,
          dias: r.dias,
          tna: r.tnaPct,
        };
      }
    }
  }

  const ret7d = detalle?.rend7d ?? null;
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
                {fondo.calificacion && (
                  <span className="inline-block border border-white/30 text-white/80 text-xs font-medium px-2 py-0.5 rounded">
                    {fondo.calificacion}
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
                  label="Del día (1D)"
                  simple={fondo.ret1d}
                  tna={fondo.tna1d}
                />
                <ReturnRow
                  label="Semanal (7D)"
                  simple={ret7d}
                  tna={ret7d != null ? ret7d * (365 / 7) : null}
                />
                <ReturnRow
                  label="Del mes (30D)"
                  simple={fondo.ret30d}
                  tna={fondo.tna30d}
                />
                <ReturnRow
                  label="Del año (YTD)"
                  simple={fondo.ytd}
                  tna={null}
                />
                <ReturnRow
                  label="Interanual (1A)"
                  simple={fondo.ret1a}
                  tna={fondo.tna1a}
                />
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-xs text-amauta-text-tertiary border-t border-amauta-bg-light bg-amauta-bg-light/30">
            Rendimiento simple sobre VCP diario · TNA = rendimiento × 365/días
          </div>
        </section>

        {/* ── Estadísticas (vol / sharpe) — solo si tenemos detalle ── */}
        {detalle && (detalle.volatilidad != null || detalle.sharpe != null) && (
          <section className="bg-white rounded-lg border border-amauta-bg-light overflow-hidden mb-6">
            <header className="bg-amauta-dark text-white px-4 py-3">
              <h2 className="font-extrabold text-sm uppercase tracking-wider">
                Estadísticas de riesgo
              </h2>
            </header>
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-amauta-bg-light">
              <StatCell
                label="Volatilidad"
                value={
                  detalle.volatilidad != null
                    ? `${(detalle.volatilidad * 100).toFixed(2)}%`
                    : "—"
                }
              />
              <StatCell
                label="Sharpe"
                value={
                  detalle.sharpe != null ? detalle.sharpe.toFixed(2) : "—"
                }
              />
              <StatCell
                label="Días de histórico"
                value={
                  detalle.diasHistorico != null
                    ? detalle.diasHistorico.toString()
                    : "—"
                }
              />
              <StatCell
                label="Inicio histórico"
                value={
                  detalle.fechaInicio ? fmtDateAr(detalle.fechaInicio) : "—"
                }
              />
            </div>
          </section>
        )}

        {/* ── Período Custom ── */}
        <section className="bg-white rounded-lg border border-amauta-bg-light overflow-hidden mb-6">
          <header className="bg-amauta-dark text-white px-4 py-3">
            <h2 className="font-extrabold text-sm uppercase tracking-wider">
              Rendimiento por período custom
            </h2>
          </header>
          <form method="GET" className="px-4 py-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label
                  htmlFor="desde"
                  className="block text-xs font-bold text-amauta-text-tertiary uppercase tracking-wider mb-1"
                >
                  Fecha inicio
                </label>
                <input
                  id="desde"
                  type="date"
                  name="desde"
                  defaultValue={desde}
                  max={fondo.fecha}
                  className="rounded-md border border-amauta-bg-light bg-white px-3 py-2 text-sm focus:outline-none focus:border-amauta-yellow focus:ring-2 focus:ring-amauta-yellow/30"
                />
              </div>
              <div>
                <label
                  htmlFor="hasta"
                  className="block text-xs font-bold text-amauta-text-tertiary uppercase tracking-wider mb-1"
                >
                  Fecha fin
                </label>
                <input
                  id="hasta"
                  type="date"
                  name="hasta"
                  defaultValue={hasta}
                  max={fondo.fecha}
                  className="rounded-md border border-amauta-bg-light bg-white px-3 py-2 text-sm focus:outline-none focus:border-amauta-yellow focus:ring-2 focus:ring-amauta-yellow/30"
                />
              </div>
              <button
                type="submit"
                className="rounded-md bg-amauta-yellow text-amauta-dark font-bold px-5 py-2 text-sm hover:bg-amauta-yellow-hover transition-colors"
              >
                Consultar
              </button>
            </div>
            <p className="mt-2 text-xs text-amauta-text-tertiary">
              Ingresá dos días hábiles · la fecha máxima es el último cierre ({fmtDateAr(fondo.fecha)})
            </p>
          </form>

          {customError && (
            <div className="mx-4 mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {customError}
            </div>
          )}

          {customResult && (
            <div className="border-t border-amauta-bg-light">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-amauta-bg-light/50 text-amauta-text-tertiary text-xs uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left font-bold">Concepto</th>
                      <th className="px-4 py-2 text-right font-bold">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-amauta-bg-light">
                      <td className="px-4 py-2 text-amauta-text-secondary">
                        VCP al {fmtDateAr(customResult.dateDesde)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold text-amauta-text-secondary">
                        {fmtNumber(customResult.vcpDesde, 4)}
                      </td>
                    </tr>
                    <tr className="border-t border-amauta-bg-light">
                      <td className="px-4 py-2 text-amauta-text-secondary">
                        VCP al {fmtDateAr(customResult.dateHasta)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold text-amauta-text-secondary">
                        {fmtNumber(customResult.vcpHasta, 4)}
                      </td>
                    </tr>
                    <tr className="border-t border-amauta-bg-light bg-amauta-yellow/5">
                      <td className="px-4 py-3 font-bold text-amauta-bordo">
                        Rendimiento del período ({customResult.dias} días)
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums text-lg font-extrabold ${
                          fmtReturn(customResult.ret, 2).colorClass
                        }`}
                      >
                        {fmtReturn(customResult.ret, 2).text}
                      </td>
                    </tr>
                    <tr className="border-t border-amauta-bg-light">
                      <td className="px-4 py-2 text-amauta-text-secondary">
                        TNA (simple × 365/días)
                      </td>
                      <td
                        className={`px-4 py-2 text-right tabular-nums font-semibold text-xs ${
                          fmtReturn(customResult.tna, 2).colorClass
                        }`}
                      >
                        {fmtReturn(customResult.tna, 2).text}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

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
                    · Plazo de rescate: {fondo.plazoRescate}{" "}
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

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3 text-center">
      <p className="text-xs text-amauta-text-tertiary uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="font-bold text-amauta-bordo tabular-nums">{value}</p>
    </div>
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
