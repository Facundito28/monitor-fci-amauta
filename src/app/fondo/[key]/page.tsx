/**
 * Detalle de un fondo / clase.
 * URL: /fondo/[key]  donde key = encodeURIComponent(displayName de CAFCI)
 *
 * Datos: GET /fondo/{fondoId}/clase/{claseId}/ficha (CAFCI oficial)
 *   - Rendimientos: day.tna, month.tna, yearToDate.tna, oneYear.tna
 *   - Composicion: .info.semanal.carteras[] { nombreActivo, share, tipoActivo }
 *   - Honorarios: honorariosAdministracionGerente, comisionIngreso, comisionRescate
 */
import Link from "next/link";
import {
  fmtDateAr,
  getFondoFichaData,
  getFundVcpOnDate,
  getMarketSnapshotWithReturns,
} from "@/lib/cafci/enriched";
import type { CartHolding, FichaData } from "@/lib/cafci/enriched";
import { fmtCompactCurrency, fmtNumber, fmtReturn } from "@/lib/utils/format";

export const revalidate = 600;
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
    return <ErrorState message="No se pudo conectar con CAFCI." />;
  }

  const fondo = snap.rows.find((r) => r.key === displayName);

  if (!fondo) {
    return (
      <ErrorState
        message={`No se encontró el fondo "${displayName}". Puede que el nombre haya cambiado.`}
      />
    );
  }

  // Fetch official CAFCI ficha (rendimientos + cartera + honorarios)
  const ficha = await getFondoFichaData(fondo.fondoId, fondo.claseId);

  const rend = ficha?.info?.diaria?.rendimientos;
  const carteras =
    ficha?.info?.semanal?.carteras
      ?.filter((c) => c.nombreActivo && c.share > 0)
      .sort((a, b) => b.share - a.share) ?? null;
  const honorarios = ficha?.info?.mensual?.honorariosComisiones;

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
      const [vcpDesdeData, vcpHastaData] = await Promise.all([
        getFundVcpOnDate(fondo.tipoRentaId, fondo.key, desde).catch(() => null),
        getFundVcpOnDate(fondo.tipoRentaId, fondo.key, hasta).catch(() => null),
      ]);
      if (!vcpDesdeData) {
        customError = `No hay datos para la fecha inicio (${fmtDateAr(desde)}). Probá con otro día hábil.`;
      } else if (!vcpHastaData) {
        customError = `No hay datos para la fecha fin (${fmtDateAr(hasta)}). Probá con otro día hábil.`;
      } else {
        const ret = ((vcpHastaData.vcp / vcpDesdeData.vcp) - 1) * 100;
        const dias = Math.round(
          (new Date(vcpHastaData.date + "T12:00:00Z").getTime() -
            new Date(vcpDesdeData.date + "T12:00:00Z").getTime()) /
            (1000 * 60 * 60 * 24),
        );
        const tna = dias > 0 ? ret * (365 / dias) : 0;
        customResult = {
          vcpDesde: vcpDesdeData.vcp,
          dateDesde: vcpDesdeData.date,
          vcpHasta: vcpHastaData.vcp,
          dateHasta: vcpHastaData.date,
          ret,
          dias,
          tna,
        };
      }
    }
  }

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
                honorarios?.honorariosAdministracionGerente
                  ? `${parseFloat(honorarios.honorariosAdministracionGerente).toFixed(2)}%`
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
                {/*
                  "Rendimiento" = simple % (igual a lo que muestra CAFCI: "Del día", "Del mes", etc.)
                  "TNA" = tasa nominal anual desde CAFCI /ficha, o calculado como simple × (365/días)
                */}
                <ReturnRowFicha
                  label="Del día (1D)"
                  simple={fondo.ret1d}
                  tna={rend?.day?.tna ?? fondo.tna1d}
                />
                <ReturnRowFicha
                  label="Semanal (7D)"
                  simple={fondo.ret7d}
                  tna={rend?.week?.tna ?? null}
                />
                <ReturnRowFicha
                  label="Del mes (30D)"
                  simple={fondo.ret30d}
                  tna={rend?.month?.tna ?? fondo.tna30d}
                />
                <ReturnRowFicha
                  label="Del año (YTD)"
                  simple={null}
                  tna={rend?.yearToDate?.tna ?? null}
                />
                <ReturnRowFicha
                  label="Interanual (1A)"
                  simple={fondo.ret1a}
                  tna={rend?.oneYear?.tna ?? fondo.tna1a}
                />
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-xs text-amauta-text-tertiary border-t border-amauta-bg-light bg-amauta-bg-light/30">
            Rendimiento simple calculado sobre VCP de CAFCI ·
            TNA = tasa nominal anual {ficha ? "oficial de CAFCI (/ficha)" : "estimada (rendimiento × 365/días)"}
          </div>
        </section>

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
                        TNA estimada (simple × 365/días)
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

        {/* ── Composición de Cartera ── */}
        <ComposicionSection carteras={carteras} hasFicha={ficha != null} />

        {/* ── Honorarios ── */}
        {honorarios && (
          <section className="bg-white rounded-lg border border-amauta-bg-light overflow-hidden mb-6">
            <header className="bg-amauta-dark text-white px-4 py-3">
              <h2 className="font-extrabold text-sm uppercase tracking-wider">
                Honorarios y Comisiones
              </h2>
            </header>
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-amauta-bg-light">
              <HonorarioCell
                label="Hon. Gerente"
                value={honorarios.honorariosAdministracionGerente}
              />
              <HonorarioCell
                label="Hon. Depositaria"
                value={honorarios.honorariosAdministracionDepositaria}
              />
              <HonorarioCell
                label="Com. Ingreso"
                value={honorarios.comisionIngreso}
              />
              <HonorarioCell
                label="Com. Rescate"
                value={honorarios.comisionRescate}
              />
            </div>
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
          {/* PDF download — plain <a> triggers browser download, no JS needed */}
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

/** Row: Rendimiento simple primero (igual a CAFCI web), TNA como dato secundario. */
function ReturnRowFicha({
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
      {/* Rendimiento simple — misma unidad que CAFCI muestra en su web */}
      <td
        className={`px-4 py-3 text-right tabular-nums font-semibold ${simpleFmt.colorClass}`}
      >
        {simpleFmt.text}
      </td>
      {/* TNA — referencia anualizada estándar argentina */}
      <td
        className={`px-4 py-3 text-right tabular-nums text-xs ${tnaFmt.colorClass}`}
      >
        {tnaFmt.text}
      </td>
    </tr>
  );
}

function HonorarioCell({ label, value }: { label: string; value?: string }) {
  const num = value ? parseFloat(value) : null;
  return (
    <div className="px-4 py-3 text-center">
      <p className="text-xs text-amauta-text-tertiary uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="font-bold text-amauta-bordo tabular-nums">
        {num != null && !isNaN(num) ? `${num.toFixed(2)}%` : "—"}
      </p>
    </div>
  );
}

function ComposicionSection({
  carteras,
  hasFicha,
}: {
  carteras: CartHolding[] | null;
  hasFicha: boolean;
}) {
  const COLORS = [
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

  return (
    <section className="bg-white rounded-lg border border-amauta-bg-light overflow-hidden mb-6">
      <header className="bg-amauta-dark text-white px-4 py-3 flex items-center justify-between">
        <h2 className="font-extrabold text-sm uppercase tracking-wider">
          Composición de Cartera
        </h2>
        <span className="text-xs text-white/50">CAFCI Live</span>
      </header>

      {!hasFicha ? (
        <div className="px-4 py-8 text-center text-amauta-text-tertiary text-sm">
          <div className="text-3xl mb-2">📊</div>
          <p className="font-medium">Ficha no disponible</p>
          <p className="mt-1 text-xs">
            No se pudo resolver el fondoId/claseId para este fondo.
          </p>
        </div>
      ) : !carteras || carteras.length === 0 ? (
        <div className="px-4 py-8 text-center text-amauta-text-tertiary text-sm">
          <div className="text-3xl mb-2">📊</div>
          <p className="font-medium">Composición no disponible</p>
          <p className="mt-1 text-xs">
            CAFCI no publicó la cartera semanal para este fondo aún.
          </p>
        </div>
      ) : (
        <>
          {/* Horizontal bar chart — top 10 holdings */}
          <div className="px-4 pt-4 pb-4">
            {carteras.slice(0, 10).map((h, i) => (
              <div key={i} className="mb-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-amauta-text-secondary truncate max-w-[72%]">
                    {h.nombreActivo}
                    {h.tipoActivo && (
                      <span className="ml-2 px-1.5 py-0.5 rounded bg-amauta-bg-light text-amauta-text-tertiary font-normal">
                        {h.tipoActivo}
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums font-bold text-amauta-bordo">
                    {fmtNumber(h.share, 2)}%
                  </span>
                </div>
                <div className="h-2 bg-amauta-bg-light rounded-full overflow-hidden">
                  <div
                    className={`h-full ${COLORS[i % COLORS.length]} rounded-full`}
                    style={{ width: `${Math.min(h.share, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="px-4 pb-3 text-xs text-amauta-text-tertiary border-t border-amauta-bg-light pt-2">
            Composición semanal · Fuente: CAFCI. Verificar con la fuente oficial.
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
