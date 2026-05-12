/**
 * Listado completo de FCIs deduplicado por fondo (clase representativa).
 *
 * UI refresh (BLOQUE 4) basado en tokens de amauta-design:
 *   - Hero strip oscuro con stats agregadas (fondos, AUM total, cierre, fuente)
 *   - Filter card con buscador full-width arriba + 5 dropdowns abajo, labels
 *     uppercase tracking-wider para coherencia con el sitio público
 *   - Tabla con zebra sutil, hover yellow-tint, Fondo+Gestora apilados,
 *     menos columnas duplicadas en mobile
 *   - Top 3 highlight 🥇🥈🥉 cuando hay filtro activo y página 1 — borde
 *     izquierdo coloreado + fondo tintado por posición
 *   - Empty state con CTA "Limpiar filtros"
 */
import Link from "next/link";
import { fmtCompactCurrency, fmtNumber, fmtReturn } from "@/lib/utils/format";
import { fmtDateAr, getMarketSnapshotWithReturns } from "@/lib/fondos/enriched";
import { EstrategiaBadge } from "@/components/EstrategiaBadge";

const PAGE_SIZE = 50;

interface SearchParams {
  q?: string;
  cat?: string;
  estrategia?: string;
  gestora?: string;
  horizonte?: string;
  moneda?: string;
  sort?: string;
  page?: string;
}

export const metadata = {
  title: "Fondos · Monitor FCIs · Amauta",
  description:
    "Listado completo de Fondos Comunes de Inversión argentinos con VCP, patrimonio, rendimiento diario y mensual.",
};

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type SortKey =
  | "nombre"
  | "nombre_desc"
  | "patrimonio_desc" | "patrimonio_asc"
  | "vcp_desc"       | "vcp_asc"
  | "ret1d_desc"     | "ret1d_asc"
  | "ret30d_desc"    | "ret30d_asc"
  | "ret1a_desc"     | "ret1a_asc";

export default async function FondosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const catFilter = (sp.cat ?? "").trim();
  const estrategiaFilter = (sp.estrategia ?? "").trim();
  const gestoraFilter = (sp.gestora ?? "").trim();
  const horizonteFilter = (sp.horizonte ?? "").trim();
  const monedaFilter = (sp.moneda ?? "").trim();
  const sortKey: SortKey = (sp.sort as SortKey) ?? "patrimonio_desc";
  const page = Math.max(1, Number(sp.page) || 1);

  const snap = await getMarketSnapshotWithReturns().catch(() => null);

  if (!snap) {
    return (
      <ErrorState message="No pudimos cargar los datos de fondos. Volvé a intentar en unos minutos." />
    );
  }

  // ── Filter ──
  const filtered = snap.rows.filter((r) => {
    if (query && !r.displayName.toLowerCase().includes(query.toLowerCase()))
      return false;
    if (catFilter && r.categoria !== catFilter) return false;
    if (estrategiaFilter && r.estrategia !== estrategiaFilter) return false;
    if (gestoraFilter && r.gestora !== gestoraFilter) return false;
    if (horizonteFilter && r.horizonte !== horizonteFilter) return false;
    if (monedaFilter && r.moneda !== monedaFilter) return false;
    return true;
  });

  // ── Sort ──
  // For _desc: nulls go to bottom (treated as -Infinity).
  // For _asc:  nulls go to bottom (treated as +Infinity).
  const sorted = [...filtered].sort((a, b) => {
    switch (sortKey) {
      case "patrimonio_desc": return (b.patrimonio ?? 0)         - (a.patrimonio ?? 0);
      case "patrimonio_asc":  return (a.patrimonio ?? Infinity)  - (b.patrimonio ?? Infinity);
      case "vcp_desc":        return (b.vcp ?? 0)                - (a.vcp ?? 0);
      case "vcp_asc":         return (a.vcp ?? Infinity)         - (b.vcp ?? Infinity);
      case "ret1d_desc":      return (b.ret1d ?? -Infinity)      - (a.ret1d ?? -Infinity);
      case "ret1d_asc":       return (a.ret1d ?? Infinity)       - (b.ret1d ?? Infinity);
      case "ret30d_desc":     return (b.ret30d ?? -Infinity)     - (a.ret30d ?? -Infinity);
      case "ret30d_asc":      return (a.ret30d ?? Infinity)      - (b.ret30d ?? Infinity);
      case "ret1a_desc":      return (b.ret1a ?? -Infinity)      - (a.ret1a ?? -Infinity);
      case "ret1a_asc":       return (a.ret1a ?? Infinity)       - (b.ret1a ?? Infinity);
      case "nombre_desc":     return b.displayName.localeCompare(a.displayName, "es-AR");
      default:                return a.displayName.localeCompare(b.displayName, "es-AR");
    }
  });

  // ── Paginate ──
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(start, start + PAGE_SIZE);

  const buildHref = (overrides: Partial<SearchParams>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      q: query,
      cat: catFilter,
      estrategia: estrategiaFilter,
      gestora: gestoraFilter,
      horizonte: horizonteFilter,
      moneda: monedaFilter,
      sort: sortKey,
      page: String(safePage),
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, v);
    }
    if (!params.get("page") || params.get("page") === "1") params.delete("page");
    if (params.get("sort") === "patrimonio_desc") params.delete("sort");
    const qs = params.toString();
    return qs ? `/fondos?${qs}` : "/fondos";
  };

  const anyFilter = !!(query || catFilter || estrategiaFilter || gestoraFilter || horizonteFilter || monedaFilter);
  // El podium solo aparece en página 1 cuando hay filtro activo — "Top 3"
  // sin contexto (sin filtros) sería simplemente los 3 fondos más grandes
  // por AUM y eso no aporta señal sobre nada en particular.
  const showPodium = anyFilter && safePage === 1;
  const horizonteOpts = ["Corto Plazo", "Mediano Plazo", "Largo Plazo"];

  return (
    <div className="bg-amauta-bg-light flex-1">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">

        {/* ── Hero strip ──────────────────────────────────────────────── */}
        <section className="mb-6 sm:mb-8">
          <div className="bg-amauta-dark text-white rounded-sm overflow-hidden shadow-card">
            <div className="px-6 py-6 sm:px-8 sm:py-7 border-b border-white/10">
              <p className="text-[11px] uppercase tracking-[0.18em] text-amauta-yellow font-extrabold mb-2">
                Mercado argentino · Datos oficiales CAFCI
              </p>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold leading-tight">
                Fondos Comunes de Inversión
              </h1>
              <p className="mt-2 text-sm text-white/60 max-w-2xl">
                Actualización diaria post-cierre. Una fila por fondo (clase representativa B con fallback A → primera disponible).
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/10">
              <HeroStat label="Fondos" value={snap.rows.length.toLocaleString("es-AR")} />
              <HeroStat label="Patrimonio total" value={fmtCompactCurrency(snap.aumTotal, "ARS") ?? "—"} />
              <HeroStat label="Último cierre" value={fmtDateAr(snap.fecha)} />
              <HeroStat label="Fuente" value="CAFCI ↗" href="https://www.cafci.org.ar/" />
            </div>
          </div>
        </section>

        {/* ── Filtros ─────────────────────────────────────────────────── */}
        <form className="bg-white rounded-sm border border-amauta-bg-light shadow-card mb-6 sm:mb-8">
          <div className="px-6 py-4 border-b border-amauta-bg-light flex items-center justify-between gap-4">
            <p className="text-[11px] uppercase tracking-[0.18em] font-extrabold text-amauta-bordo">
              Filtros
            </p>
            {anyFilter && (
              <Link
                href="/fondos"
                className="text-xs font-bold text-amauta-text-tertiary hover:text-amauta-bordo transition-colors"
              >
                Limpiar todo
              </Link>
            )}
          </div>
          <div className="p-6 space-y-5">
            <div>
              <label
                htmlFor="q"
                className="block text-[11px] font-extrabold uppercase tracking-[0.14em] text-amauta-text-tertiary mb-1.5"
              >
                Buscar por nombre
              </label>
              <input
                id="q"
                name="q"
                type="text"
                defaultValue={query}
                placeholder="Ej: Galileo CER, Compass Renta Fija, Premium…"
                className="w-full rounded-sm border border-amauta-bg-light bg-white px-3.5 py-2.5 text-sm font-medium placeholder:text-amauta-text-tertiary/60 focus:outline-none focus:border-amauta-yellow focus:ring-2 focus:ring-amauta-yellow/30 transition-colors"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <SelectFilter id="estrategia" label="Estrategia" value={estrategiaFilter} options={snap.estrategias} />
              <SelectFilter id="cat" label="Categoría" value={catFilter} options={snap.categorias} />
              <SelectFilter id="gestora" label="Gestora" value={gestoraFilter} options={snap.gestoras} />
              <SelectFilter id="horizonte" label="Horizonte" value={horizonteFilter} options={horizonteOpts} />
              <SelectFilter id="moneda" label="Moneda" value={monedaFilter} options={snap.monedas} />
            </div>

            <input type="hidden" name="sort" value={sortKey} />
            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                className="rounded-sm bg-amauta-yellow text-amauta-dark font-extrabold uppercase tracking-wider text-xs px-6 py-3 hover:bg-amauta-yellow-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amauta-yellow/50 focus-visible:ring-offset-2"
              >
                Aplicar filtros
              </button>
            </div>
          </div>
        </form>

        {/* ── Resultados ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-sm border border-amauta-bg-light shadow-card overflow-hidden">
          {/* Banner de contexto cuando hay podium */}
          {showPodium && pageRows.length >= 3 && (
            <div className="px-6 py-2.5 text-xs font-medium border-b border-amauta-bg-light bg-amauta-yellow/10 text-amauta-bordo flex items-center gap-2">
              <span aria-hidden>🏆</span>
              <span>
                <strong className="font-extrabold">Top 3 destacado</strong> según el orden actual dentro del filtro aplicado.
              </span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-amauta-dark text-white">
                <tr>
                  <th className="px-3 py-3.5 text-left font-extrabold uppercase tracking-wider text-[11px] w-14">#</th>
                  <SortableHeader label="Fondo" baseKey="nombre" activeSort={sortKey} buildHref={buildHref} align="left" />
                  <th className="px-3 py-3.5 text-left font-extrabold uppercase tracking-wider text-[11px]">Estrategia</th>
                  <th className="px-3 py-3.5 text-left font-extrabold uppercase tracking-wider text-[11px] hidden md:table-cell">Moneda</th>
                  <SortableHeader label="VCP" baseKey="vcp" activeSort={sortKey} buildHref={buildHref} align="right" />
                  <SortableHeader label="Patrimonio" baseKey="patrimonio" activeSort={sortKey} buildHref={buildHref} align="right" />
                  <SortableHeader label="1D" baseKey="ret1d" activeSort={sortKey} buildHref={buildHref} align="right" />
                  <SortableHeader label="Mensual" baseKey="ret30d" activeSort={sortKey} buildHref={buildHref} align="right" />
                  <SortableHeader label="Interanual" baseKey="ret1a" activeSort={sortKey} buildHref={buildHref} align="right" />
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <EmptyRow anyFilter={anyFilter} />
                ) : (
                  pageRows.map((r, i) => {
                    const globalIdx = start + i;
                    const podiumRank = showPodium && globalIdx < 3 ? globalIdx + 1 : 0;
                    const ret1d  = fmtReturn(r.ret1d,  2, 5);
                    const ret30d = fmtReturn(r.ret30d, 2, 35);
                    const ret1a  = fmtReturn(r.ret1a,  2, 150);
                    const isUsd = r.moneda === "USD";

                    // Color tokens por posición de podio. Borde izquierdo 3px
                    // + tint sutil de fondo. Sin podium → zebra alternada.
                    const rowBg =
                      podiumRank === 1 ? "bg-amauta-yellow/10 border-l-[3px] border-l-amauta-yellow"
                    : podiumRank === 2 ? "bg-slate-100/70 border-l-[3px] border-l-slate-400"
                    : podiumRank === 3 ? "bg-amber-50 border-l-[3px] border-l-amber-700"
                    : i % 2 === 0 ? "" : "bg-amauta-bg-light/35";

                    return (
                      <tr
                        key={r.key}
                        className={`border-t border-amauta-bg-light hover:bg-amauta-yellow/5 transition-colors ${rowBg}`}
                      >
                        <td className="px-3 py-3.5 align-top">
                          {podiumRank > 0 ? (
                            <span
                              className="inline-flex items-center justify-center w-8 h-8 rounded-xs text-base"
                              aria-label={`Top ${podiumRank}`}
                            >
                              {podiumRank === 1 ? "🥇" : podiumRank === 2 ? "🥈" : "🥉"}
                            </span>
                          ) : (
                            <span className="tabular-nums text-amauta-text-tertiary text-xs">
                              {globalIdx + 1}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3.5 max-w-[28rem]">
                          <Link
                            href={`/fondo/${encodeURIComponent(r.key)}`}
                            className="block font-extrabold text-amauta-bordo hover:underline leading-snug"
                          >
                            {r.displayName}
                          </Link>
                          <div className="mt-0.5 text-xs text-amauta-text-tertiary truncate">
                            {r.gestora ?? "—"}
                            {r.claseRepresentativa ? (
                              <span className="text-amauta-text-tertiary/70">
                                {" · Clase "}{r.claseRepresentativa}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-3.5 whitespace-nowrap align-top">
                          <EstrategiaBadge value={r.estrategia} confianza={r.estrategiaConfianza} />
                        </td>
                        <td className="px-3 py-3.5 whitespace-nowrap hidden md:table-cell align-top">
                          {r.moneda ? (
                            <span
                              className={`inline-block text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-xs ${
                                isUsd ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                              }`}
                            >
                              {r.moneda}
                            </span>
                          ) : (
                            <span className="text-amauta-text-tertiary">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3.5 text-right tabular-nums whitespace-nowrap font-medium align-top">
                          {fmtNumber(r.vcp, 4)}
                        </td>
                        <td className="px-3 py-3.5 text-right tabular-nums whitespace-nowrap font-medium align-top">
                          {r.patrimonio ? fmtCompactCurrency(r.patrimonio, "ARS") : "—"}
                        </td>
                        <td
                          className={`px-3 py-3.5 text-right tabular-nums whitespace-nowrap font-bold align-top ${ret1d.colorClass}`}
                          title={ret1d.isOutlier ? "Posible artefacto de datos (corrección de VCP o distribución). Verificar con la fuente oficial." : undefined}
                        >
                          {ret1d.text}
                        </td>
                        <td
                          className={`px-3 py-3.5 text-right tabular-nums whitespace-nowrap font-bold align-top ${ret30d.colorClass}`}
                          title={ret30d.isOutlier ? "Posible artefacto de datos (corrección de VCP o distribución). Verificar con la fuente oficial." : undefined}
                        >
                          {ret30d.text}
                        </td>
                        <td
                          className={`px-3 py-3.5 text-right tabular-nums whitespace-nowrap font-bold align-top ${ret1a.colorClass}`}
                          title={ret1a.isOutlier ? "Posible artefacto de datos (corrección de VCP o distribución). Verificar con la fuente oficial." : undefined}
                        >
                          {ret1a.text}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-4 px-4 sm:px-6 py-3.5 border-t border-amauta-bg-light bg-amauta-bg-light/40 text-sm">
              <span className="text-amauta-text-tertiary text-xs sm:text-sm">
                Página <strong className="text-amauta-text">{safePage}</strong> de {totalPages}
                <span className="hidden sm:inline">
                  {" · "}{total.toLocaleString("es-AR")} resultados
                </span>
              </span>
              <div className="flex gap-1">
                <PageLink href={buildHref({ page: "1" })} disabled={safePage === 1}>«</PageLink>
                <PageLink href={buildHref({ page: String(safePage - 1) })} disabled={safePage === 1}>‹</PageLink>
                <PageLink href={buildHref({ page: String(safePage + 1) })} disabled={safePage === totalPages}>›</PageLink>
                <PageLink href={buildHref({ page: String(totalPages) })} disabled={safePage === totalPages}>»</PageLink>
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-amauta-text-tertiary leading-relaxed max-w-3xl">
          <strong className="text-amauta-text-secondary">Mensual:</strong> desde fin de mes anterior · <strong className="text-amauta-text-secondary">Interanual:</strong> vs misma fecha del año anterior · Hacé click en{" "}
          <span aria-hidden>↕</span> para ordenar · click en el nombre para la ficha completa ·{" "}
          <span className="text-amber-500 font-extrabold">⚠</span> indica posible artefacto de datos (corrección de VCP o distribución), verificar con la fuente oficial.
        </p>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HeroStat({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <>
      <p className="text-[11px] uppercase tracking-[0.14em] text-white/55 font-bold mb-1">
        {label}
      </p>
      <p className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-amauta-yellow leading-tight">
        {value}
      </p>
    </>
  );
  const baseCls = "px-6 py-5 sm:px-8 sm:py-6 block";
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={`${baseCls} hover:bg-white/5 transition-colors`}
      >
        {content}
      </a>
    );
  }
  return <div className={baseCls}>{content}</div>;
}

function SelectFilter({
  id,
  label,
  value,
  options,
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[11px] font-extrabold uppercase tracking-[0.14em] text-amauta-text-tertiary mb-1.5"
      >
        {label}
      </label>
      <select
        id={id}
        name={id}
        defaultValue={value}
        className="w-full rounded-sm border border-amauta-bg-light bg-white px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:border-amauta-yellow focus:ring-2 focus:ring-amauta-yellow/30 transition-colors"
      >
        <option value="">Todas</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function SortableHeader({
  label,
  baseKey,
  activeSort,
  buildHref,
  align = "left",
}: {
  label: string;
  /** Column base name, e.g. "ret1d" — the component appends _desc / _asc */
  baseKey: string;
  activeSort: SortKey;
  buildHref: (overrides: Partial<SearchParams>) => string;
  align?: "left" | "right";
}) {
  const isDesc = activeSort === `${baseKey}_desc`;
  const isAsc  = activeSort === `${baseKey}_asc` || activeSort === baseKey;
  const isActive = isDesc || isAsc;

  // Toggle: inactive or asc → desc first click; desc → asc second click
  const nextSort = isDesc
    ? (`${baseKey}_asc` as SortKey)
    : (`${baseKey}_desc` as SortKey);

  return (
    <th
      className={`px-3 py-3.5 ${align === "right" ? "text-right" : "text-left"} font-extrabold uppercase tracking-wider text-[11px] whitespace-nowrap`}
    >
      <Link
        href={buildHref({ sort: nextSort, page: "1" })}
        className={`inline-flex items-center gap-1 hover:text-amauta-yellow transition-colors ${
          isActive ? "text-amauta-yellow" : ""
        }`}
      >
        {label}
        {isDesc && <span aria-hidden>↓</span>}
        {isAsc  && <span aria-hidden>↑</span>}
        {!isActive && <span aria-hidden className="opacity-30 text-xs">↕</span>}
      </Link>
    </th>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-xs text-amauta-text-tertiary/40 cursor-not-allowed">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center w-9 h-9 rounded-xs font-bold text-amauta-text-secondary hover:bg-amauta-yellow hover:text-amauta-dark transition-colors"
    >
      {children}
    </Link>
  );
}

function EmptyRow({ anyFilter }: { anyFilter: boolean }) {
  return (
    <tr>
      <td colSpan={9} className="px-4 py-16 text-center">
        <div className="inline-flex flex-col items-center max-w-md mx-auto">
          <div className="text-5xl mb-3" aria-hidden>📊</div>
          <p className="text-base font-extrabold text-amauta-bordo mb-1">
            Sin resultados con esos filtros
          </p>
          <p className="text-sm text-amauta-text-secondary max-w-xs">
            Probá ampliar el rango o limpiar los filtros para ver todo el mercado.
          </p>
          {anyFilter && (
            <Link
              href="/fondos"
              className="mt-5 inline-block rounded-sm bg-amauta-yellow text-amauta-dark font-extrabold uppercase tracking-wider text-xs px-5 py-2.5 hover:bg-amauta-yellow-hover transition-colors"
            >
              Limpiar filtros
            </Link>
          )}
        </div>
      </td>
    </tr>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-amauta-bg-light">
      <div className="bg-white rounded-sm border border-amauta-bg-light shadow-card p-10 text-center max-w-md">
        <div className="text-6xl mb-3">⚠️</div>
        <h1 className="text-xl font-extrabold text-amauta-bordo">No se pudo cargar</h1>
        <p className="mt-2 text-sm text-amauta-text-secondary">{message}</p>
      </div>
    </div>
  );
}
