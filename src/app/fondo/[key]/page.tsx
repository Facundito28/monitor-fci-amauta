/**
 * Detalle de un fondo (deduplicado por baseName tras BLOQUE 2).
 * URL: /fondo/[key]  donde key = encodeURIComponent(baseName del fondo).
 *
 * Datos: planilla diaria oficial de CAFCI vía getMarketSnapshotWithReturns().
 * Incluye VCP / AUM / retornos pre-calculados (1D/MTD/YTD/13M), honorarios
 * detallados por clase, metadata (benchmark, duration, region, calificación)
 * y composición de cartera más reciente desde fci_cartera.
 *
 * Visual refresh (BLOQUE 5) — tokens de amauta-design:
 *   - Hero strip dark con tagline yellow + título extrabold + badges chips
 *   - KPIs en yellow extrabold sobre fondo dark/5
 *   - Secciones encadenadas con header amauta-dark uppercase tracking
 *   - Tabla "Clases del Fondo" nueva, marca la representativa con borde yellow
 *   - Radios solo rounded-xs (3px) y rounded-sm (5px); shadow-card único
 */
import Link from "next/link";
import {
  fmtDateAr,
  getMarketSnapshotWithReturns,
} from "@/lib/fondos/enriched";
import type { ClaseInfo } from "@/lib/fondos/enriched";
import type { Confianza } from "@/lib/fondos/estrategia";
import { fondoBaseName } from "@/lib/fondos/client";
import { fmtCompactCurrency, fmtNumber, fmtReturn } from "@/lib/utils/format";
import { EstrategiaBadge, ConfianzaPill } from "@/components/EstrategiaBadge";

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

  // El listado dedupea por baseName, así que el key de cada row es el
  // baseName. Tolerar URLs viejas con sufijo "- Clase X" via normalización.
  const baseKey = fondoBaseName(displayName);
  const fondo =
    snap.rows.find((r) => r.key === displayName) ??
    snap.rows.find((r) => r.key === baseKey);

  if (!fondo) {
    return (
      <ErrorState
        message={`No se encontró el fondo "${displayName}". Puede que el nombre haya cambiado.`}
      />
    );
  }

  const hasClases = fondo.clasesDisponibles.length > 0;

  return (
    <div className="bg-amauta-bg-light flex-1">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">

        {/* ── Breadcrumb ─────────────────────────────────────────────── */}
        <nav className="mb-4 text-xs sm:text-sm text-amauta-text-tertiary font-medium">
          <Link href="/fondos" className="hover:text-amauta-bordo transition-colors">
            Fondos
          </Link>
          <span className="mx-2 text-amauta-text-tertiary/50">/</span>
          <span className="text-amauta-text-secondary truncate">
            {fondo.displayName}
          </span>
        </nav>

        {/* ── Hero strip ─────────────────────────────────────────────── */}
        <section className="mb-6 sm:mb-8">
          <div className="bg-amauta-dark text-white rounded-sm overflow-hidden shadow-card">
            <div className="px-6 py-6 sm:px-8 sm:py-7">
              <p className="text-[11px] uppercase tracking-[0.18em] text-amauta-yellow font-extrabold mb-3">
                Ficha del Fondo · Cierre {fmtDateAr(fondo.fecha)}
              </p>

              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold leading-tight">
                {fondo.displayName}
              </h1>

              <div className="mt-2 text-sm text-white/65">
                {fondo.gestora && <span className="font-bold text-white/80">{fondo.gestora}</span>}
                {fondo.depositaria && (
                  <>
                    <span className="mx-2 text-white/30">·</span>
                    <span>Depositaria: {fondo.depositaria}</span>
                  </>
                )}
                {fondo.claseRepresentativa && (
                  <>
                    <span className="mx-2 text-white/30">·</span>
                    <span>Clase mostrada: <strong className="text-white/85">{fondo.claseRepresentativa}</strong></span>
                  </>
                )}
              </div>

              {/* Chips de metadata + confianza */}
              <div className="mt-4 flex flex-wrap gap-2">
                <EstrategiaBadge
                  value={fondo.estrategia}
                  confianza={fondo.estrategiaConfianza}
                />
                <ConfianzaPill confianza={fondo.estrategiaConfianza} />
                {fondo.categoria && fondo.categoria !== fondo.estrategia && (
                  <Chip tone="dark">{fondo.categoria}</Chip>
                )}
                {fondo.horizonte && <Chip>{fondo.horizonte}</Chip>}
                {fondo.region && <Chip>{fondo.region}</Chip>}
                {fondo.benchmark && fondo.benchmark !== "No Registrado" && (
                  <Chip>BM: {fondo.benchmark}</Chip>
                )}
                {fondo.duration && <Chip>{fondo.duration}</Chip>}
                {fondo.calificacion && <Chip>Cal. {fondo.calificacion}</Chip>}
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/10 border-t border-white/10">
              <Kpi label="VCP" value={fmtNumber(fondo.vcp, 4)} />
              <Kpi
                label="Patrimonio del fondo"
                value={
                  fondo.patrimonio
                    ? (fmtCompactCurrency(fondo.patrimonio, "ARS") ?? "—")
                    : "—"
                }
              />
              <Kpi
                label="Cuotapartes"
                value={fondo.ccp ? fmtNumber(fondo.ccp, 0) : "—"}
              />
              <Kpi
                label="Hon. Gerente (Clase rep.)"
                value={
                  fondo.feeGestion != null
                    ? `${fondo.feeGestion.toFixed(2)}%`
                    : "—"
                }
              />
            </div>
          </div>
        </section>

        {/* ── Cómo se clasificó este fondo (transparencia) ─────────────── */}
        <ClasificacionBlock
          estrategia={fondo.estrategia}
          confianza={fondo.estrategiaConfianza}
          razon={fondo.estrategiaRazon}
          codigoCafci={fondo.codigoCafci}
          hasHoldings={fondo.cartera.length > 0}
        />

        {/* ── Composición de Cartera ─────────────────────────────────── */}
        {fondo.cartera.length > 0 && (
          <Section
            title="Composición de Cartera"
            subtitle={`Top ${fondo.cartera.length} activos · semanal · fuente CAFCI`}
          >
            <div className="px-6 py-5 space-y-3">
              {fondo.cartera.map((h) => {
                const tipoStyle = TIPO_BAR_COLOR[h.tipo_activo] ?? "bg-slate-400";
                return (
                  <div key={h.rank} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm mb-1.5">
                        <span className="font-bold text-amauta-text truncate">
                          {h.activo}
                        </span>
                        <span
                          className="inline-block text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-xs text-amauta-text-secondary bg-amauta-bg-light shrink-0"
                          title={`Tipo de activo: ${h.tipo_activo}`}
                        >
                          {h.tipo_activo}
                        </span>
                      </div>
                      <div className="h-2 bg-amauta-bg-light rounded-xs overflow-hidden">
                        <div
                          className={`h-full ${tipoStyle}`}
                          style={{ width: `${Math.min(100, h.share)}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-extrabold tabular-nums text-amauta-bordo whitespace-nowrap w-14 text-right">
                      {h.share.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── Rendimientos ───────────────────────────────────────────── */}
        <Section
          title="Rendimientos Históricos"
          subtitle="Variaciones pre-calculadas por CAFCI · TNA = rendimiento × 365/días"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-amauta-bg-light/50 text-amauta-text-tertiary">
                <tr>
                  <th className="px-6 py-2.5 text-left font-extrabold uppercase tracking-wider text-[11px]">
                    Período
                  </th>
                  <th className="px-6 py-2.5 text-right font-extrabold uppercase tracking-wider text-[11px]">
                    Rendimiento
                  </th>
                  <th className="px-6 py-2.5 text-right font-extrabold uppercase tracking-wider text-[11px]">
                    TNA
                  </th>
                </tr>
              </thead>
              <tbody>
                <ReturnRow label="Diario (1D)" simple={fondo.ret1d} tna={fondo.tna1d} />
                <ReturnRow label="Mensual (MTD)" simple={fondo.retMTD} tna={fondo.tna30d} />
                <ReturnRow label="Año en Curso (YTD)" simple={fondo.ytd} tna={null} />
                <ReturnRow label="Interanual (13M)" simple={fondo.ret13m} tna={fondo.tna1a} />
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── Clases del Fondo ───────────────────────────────────────── */}
        {hasClases && (
          <Section
            title="Clases del Fondo"
            subtitle={`${fondo.clasesDisponibles.length} ${fondo.clasesDisponibles.length === 1 ? "clase disponible" : "clases disponibles"} · honorarios y comisiones por clase`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-amauta-bg-light/50 text-amauta-text-tertiary">
                  <tr>
                    <th className="px-6 py-2.5 text-left font-extrabold uppercase tracking-wider text-[11px]">Clase</th>
                    <th className="px-3 py-2.5 text-right font-extrabold uppercase tracking-wider text-[11px]">Patrimonio</th>
                    <th className="px-3 py-2.5 text-right font-extrabold uppercase tracking-wider text-[11px]">Hon. Gerente</th>
                    <th className="px-3 py-2.5 text-right font-extrabold uppercase tracking-wider text-[11px] hidden md:table-cell">Hon. Depositaria</th>
                    <th className="px-3 py-2.5 text-right font-extrabold uppercase tracking-wider text-[11px] hidden md:table-cell">Com. Ingreso</th>
                    <th className="px-3 py-2.5 text-right font-extrabold uppercase tracking-wider text-[11px]">Com. Rescate</th>
                    <th className="px-3 py-2.5 text-center font-extrabold uppercase tracking-wider text-[11px] hidden lg:table-cell">Plazo</th>
                  </tr>
                </thead>
                <tbody>
                  {fondo.clasesDisponibles.map((c, i) => (
                    <ClaseRow
                      key={c.codigoCafci ?? `${c.letra}-${i}`}
                      clase={c}
                      isRep={c.letra === fondo.claseRepresentativa}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-2.5 text-xs text-amauta-text-tertiary border-t border-amauta-bg-light bg-amauta-bg-light/40 leading-relaxed">
              La fila destacada en <span className="inline-block w-2 h-2 rounded-xs bg-amauta-yellow align-middle mx-1" /> es la <strong className="text-amauta-text-secondary">clase representativa</strong> — la que usamos para los KPIs y rendimientos de arriba. Clase B es el estándar minorista; A suele tener mínimos chicos / honorarios más altos; C-G son típicamente institucionales.
            </div>
          </Section>
        )}

        {/* ── Acciones ───────────────────────────────────────────────── */}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/comparar?fondos=${encodeURIComponent(fondo.key)}`}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-sm bg-amauta-yellow text-amauta-dark font-extrabold uppercase tracking-wider text-xs hover:bg-amauta-yellow-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amauta-yellow/50 focus-visible:ring-offset-2"
          >
            Comparar este fondo →
          </Link>
          <a
            href={`/api/fondo/pdf?key=${encodeURIComponent(fondo.key)}`}
            download
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-sm bg-amauta-bordo text-white font-extrabold uppercase tracking-wider text-xs hover:bg-amauta-bordo-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amauta-bordo/50 focus-visible:ring-offset-2"
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
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-sm border border-amauta-bg-light text-amauta-text-secondary font-bold text-sm hover:bg-amauta-bg-light transition-colors"
          >
            ← Volver al listado
          </Link>
        </div>

        {/* Metadata adicional pequeña abajo */}
        {(fondo.codigoCnv || fondo.codigoCafci || fondo.inicio) && (
          <p className="mt-6 text-xs text-amauta-text-tertiary leading-relaxed">
            {fondo.codigoCnv && <span>CNV #{fondo.codigoCnv}</span>}
            {fondo.codigoCnv && (fondo.codigoCafci || fondo.inicio) && <span className="mx-2 text-amauta-text-tertiary/50">·</span>}
            {fondo.codigoCafci && <span>CAFCI #{fondo.codigoCafci}</span>}
            {fondo.codigoCafci && fondo.inicio && <span className="mx-2 text-amauta-text-tertiary/50">·</span>}
            {fondo.inicio && <span>Inicio: {fmtDateAr(fondo.inicio)}</span>}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ClasificacionBlock({
  estrategia,
  confianza,
  razon,
  codigoCafci,
  hasHoldings,
}: {
  estrategia: string;
  confianza: Confianza;
  razon: string;
  codigoCafci: number | null;
  hasHoldings: boolean;
}) {
  // Estilos del block según nivel — visualmente claro de un vistazo si esta
  // clasificación es indubitable o necesita revisión manual.
  const palette: Record<Confianza, { bg: string; border: string; barFrom: string; barTo: string }> = {
    override: { bg: "bg-blue-50",    border: "border-blue-200",    barFrom: "from-blue-400",    barTo: "to-blue-600" },
    alta:     { bg: "bg-emerald-50", border: "border-emerald-200", barFrom: "from-emerald-400", barTo: "to-emerald-600" },
    media:    { bg: "bg-amber-50",   border: "border-amber-200",   barFrom: "from-amber-400",   barTo: "to-amber-600" },
    baja:     { bg: "bg-orange-50",  border: "border-orange-200",  barFrom: "from-orange-400",  barTo: "to-orange-600" },
    macro:    { bg: "bg-slate-50",   border: "border-slate-200",   barFrom: "from-slate-400",   barTo: "to-slate-600" },
  };
  const p = palette[confianza];
  const showOverrideHint = confianza === "media" || confianza === "baja" || confianza === "macro";
  // Template SQL para que el asesor pegue en Supabase Studio si decide override.
  const sqlTemplate = codigoCafci
    ? `INSERT INTO fci_estrategia_override (codigo_cafci, estrategia, nota)
VALUES (${codigoCafci}, 'CER', 'Override manual Amauta');
-- Estrategias válidas: Money Market, Lecaps, CER, Dólar Linked, Hard USD,
-- Renta Fija ARS, Renta Fija USD, Renta Variable, Renta Mixta, Otros
-- O cualquier string custom`
    : null;

  return (
    <section className={`mb-6 rounded-sm border ${p.border} ${p.bg} shadow-card overflow-hidden`}>
      {/* Barra de color superior — refuerza visualmente el nivel */}
      <div className={`h-[3px] bg-gradient-to-r ${p.barFrom} ${p.barTo}`} aria-hidden />

      <div className="px-6 py-5">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <p className="text-[11px] uppercase tracking-[0.18em] font-extrabold text-amauta-bordo">
            Cómo se clasificó este fondo
          </p>
          <ConfianzaPill confianza={confianza} />
        </div>

        <p className="text-sm text-amauta-text-secondary leading-relaxed">
          <strong className="text-amauta-text">Estrategia: {estrategia}.</strong>{" "}
          {razon}
        </p>

        {!hasHoldings && (
          <p className="mt-2 text-xs text-amauta-text-tertiary italic">
            ⓘ Este fondo no tiene composición publicada en CAFCI (Money Market o cerrado / nuevo). El cron semanal lo marca como sentinel y la clasificación se basa solo en categoría macro + moneda.
          </p>
        )}

        {showOverrideHint && codigoCafci && (
          <details className="mt-3 group">
            <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wider text-amauta-bordo hover:text-amauta-bordo-hover transition-colors inline-flex items-center gap-1.5">
              <span aria-hidden>⚙</span>
              ¿No coincide? Override manual
            </summary>
            <div className="mt-3 space-y-2">
              <p className="text-xs text-amauta-text-secondary leading-relaxed">
                Si la mesa de Amauta conoce la estrategia real, se puede sobrescribir cargando una fila en la tabla <code className="text-[11px] bg-white px-1 py-0.5 rounded-xs border border-amauta-bg-light">fci_estrategia_override</code> de Supabase. La UI lee con TTL de 6h, así que el cambio puede tardar hasta esa ventana en propagarse.
              </p>
              <pre className="text-[11px] bg-amauta-dark text-amauta-yellow/90 rounded-xs p-3 overflow-x-auto font-mono leading-relaxed">
{sqlTemplate}
              </pre>
            </div>
          </details>
        )}
      </div>
    </section>
  );
}

function Chip({
  children,
  tone = "outline",
}: {
  children: React.ReactNode;
  tone?: "outline" | "dark";
}) {
  if (tone === "dark") {
    return (
      <span className="inline-block bg-amauta-yellow text-amauta-dark text-[11px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-xs">
        {children}
      </span>
    );
  }
  return (
    <span className="inline-block border border-white/25 text-white/80 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-xs">
      {children}
    </span>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-6 py-5 sm:px-8 sm:py-6">
      <p className="text-[11px] uppercase tracking-[0.14em] text-white/55 font-bold mb-1">
        {label}
      </p>
      <p className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-amauta-yellow leading-tight tabular-nums">
        {value}
      </p>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-sm border border-amauta-bg-light shadow-card overflow-hidden mb-6">
      <header className="bg-amauta-dark text-white px-6 py-3.5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-extrabold text-sm uppercase tracking-wider">
          {title}
        </h2>
        {subtitle && (
          <p className="text-[11px] text-white/55 font-medium">{subtitle}</p>
        )}
      </header>
      {children}
    </section>
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
      <td className="px-6 py-3.5 text-amauta-text-secondary font-medium">{label}</td>
      <td
        className={`px-6 py-3.5 text-right tabular-nums font-extrabold ${simpleFmt.colorClass}`}
      >
        {simpleFmt.text}
      </td>
      <td
        className={`px-6 py-3.5 text-right tabular-nums text-xs font-bold ${tnaFmt.colorClass}`}
      >
        {tnaFmt.text}
      </td>
    </tr>
  );
}

function ClaseRow({
  clase,
  isRep,
}: {
  clase: ClaseInfo;
  isRep: boolean;
}) {
  // La clase representativa lleva un borde-l yellow + bg sutil amarillo
  // para que el asesor sepa cuál es la "default" del listado.
  const rowCls = isRep
    ? "border-l-[3px] border-l-amauta-yellow bg-amauta-yellow/5"
    : "";
  return (
    <tr className={`border-t border-amauta-bg-light ${rowCls}`}>
      <td className="px-6 py-3 align-top">
        <div className="font-extrabold text-amauta-bordo">
          {clase.letra ? `Clase ${clase.letra}` : clase.claseNombre.split(" - ").slice(-1)[0]}
        </div>
        {isRep && (
          <span className="inline-block mt-1 text-[10px] uppercase tracking-wider font-extrabold text-amauta-bordo bg-amauta-yellow/30 px-1.5 py-0.5 rounded-xs">
            Representativa
          </span>
        )}
      </td>
      <td className="px-3 py-3 text-right tabular-nums font-bold align-top">
        {clase.patrimonio ? fmtCompactCurrency(clase.patrimonio, "ARS") : "—"}
      </td>
      <td className="px-3 py-3 text-right tabular-nums font-medium align-top">
        <FeePct value={clase.feeGestion} />
      </td>
      <td className="px-3 py-3 text-right tabular-nums font-medium hidden md:table-cell align-top">
        <FeePct value={clase.feeDepositaria} />
      </td>
      <td className="px-3 py-3 text-right tabular-nums font-medium hidden md:table-cell align-top">
        <FeePct value={clase.comIngreso} dim />
      </td>
      <td className="px-3 py-3 text-right tabular-nums font-medium align-top">
        <FeePct value={clase.comRescate} dim />
      </td>
      <td className="px-3 py-3 text-center tabular-nums text-xs hidden lg:table-cell align-top text-amauta-text-secondary">
        {clase.plazoRescate != null
          ? `${clase.plazoRescate}d`
          : "—"}
      </td>
    </tr>
  );
}

function FeePct({
  value,
  dim,
}: {
  value: number | null | undefined;
  dim?: boolean;
}) {
  if (value == null) {
    return <span className="text-amauta-text-tertiary/60">—</span>;
  }
  if (value === 0) {
    return <span className="text-amauta-text-tertiary">0%</span>;
  }
  return (
    <span className={dim ? "text-amauta-text-secondary" : "text-amauta-text"}>
      {value.toFixed(2)}%
    </span>
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
    <div className="flex-1 flex items-center justify-center bg-amauta-bg-light p-6">
      <div className="bg-white rounded-sm border border-amauta-bg-light shadow-card p-10 text-center max-w-md">
        <div className="text-6xl mb-3" aria-hidden>⚠️</div>
        <h1 className="text-xl font-extrabold text-amauta-bordo">No se pudo cargar</h1>
        <p className="mt-2 text-sm text-amauta-text-secondary">{message}</p>
        <Link
          href="/fondos"
          className="mt-5 inline-block rounded-sm bg-amauta-yellow text-amauta-dark font-extrabold uppercase tracking-wider text-xs px-5 py-2.5 hover:bg-amauta-yellow-hover transition-colors"
        >
          ← Volver al listado
        </Link>
      </div>
    </div>
  );
}
