/**
 * Listado completo de FCIs (clases) con VCP, patrimonio y rendimientos.
 *
 * Filtros sincronizados con la URL (permalinks compartibles).
 * Datos: CAFCI live con cálculo de TNA 1D y 30D.
 */
import Link from "next/link";
import { fmtCompactCurrency, fmtNumber, fmtReturn } from "@/lib/utils/format";
import { fmtDateAr, getMarketSnapshotWithReturns } from "@/lib/cafci/enriched";

const PAGE_SIZE = 50;

interface SearchParams {
  q?: string;
  cat?: string;
  gestora?: string;
  horizonte?: string;
  sort?: string;
  page?: string;
}

export const metadata = {
  title: "Fondos · Monitor FCIs · Amauta",
  description:
    "Listado completo de Fondos Comunes de Inversión argentinos con VCP, patrimonio, rendimiento diario y mensual.",
};

export const dynamic = "force-dynamic";

type SortKey = "nombre" | "patrimonio_desc" | "vcp_desc" | "ret1d_desc" | "ret30d_desc" | "ret1a_desc";

export default async function FondosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const catFilter = (sp.cat ?? "").trim();
  const gestoraFilter = (sp.gestora ?? "").trim();
  const horizonteFilter = (sp.horizonte ?? "").trim();
  const sortKey: SortKey = ((sp.sort as SortKey) ?? "patrimonio_desc");
  const page = Math.max(1, Number(sp.page) || 1);

  const snap = await getMarketSnapshotWithReturns().catch(() => null);

  if (!snap) {
    return (
      <ErrorState message="No pudimos contactar a CAFCI. Volvé a intentar en unos minutos." />
    );
  }

  // Filter
  const filtered = snap.rows.filter((r) => {
    if (query && !r.displayName.toLowerCase().includes(query.toLowerCase()))
      return false;
    if (catFilter && r.categoria !== catFilter) return false;
    if (gestoraFilter && r.gestora !== gestoraFilter) return false;
    if (horizonteFilter && r.horizonte !== horizonteFilter) return false;
    return true;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === "patrimonio_desc") return (b.patrimonio ?? 0) - (a.patrimonio ?? 0);
    if (sortKey === "vcp_desc") return (b.vcp ?? 0) - (a.vcp ?? 0);
    if (sortKey === "ret1d_desc") return (b.ret1d ?? -Infinity) - (a.ret1d ?? -Infinity);
    if (sortKey === "ret30d_desc") return (b.ret30d ?? -Infinity) - (a.ret30d ?? -Infinity);
    if (sortKey === "ret1a_desc") return (b.ret1a ?? -Infinity) - (a.ret1a ?? -Infinity);
    return a.displayName.localeCompare(b.displayName, "es-AR");
  });

  // Paginate
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
      gestora: gestoraFilter,
      horizonte: horizonteFilter,
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

  const horizonteOpts = ["Corto Plazo", "Mediano Plazo", "Largo Plazo"];

  return (
    <div className="bg-amauta-bg-light flex-1">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-extrabold text-amauta-bordo">
              Fondos Comunes de Inversión
            </h1>
            <p className="mt-1 text-sm text-amauta-text-secondary">
              {total.toLocaleString("es-AR")} clases · cierre {fmtDateAr(snap.fecha)} · datos en vivo de{" "}
              <a
                href="https://www.cafci.org.ar/"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-amauta-bordo"
              >
                CAFCI
              </a>
            </p>
          </div>
        </div>

        {/* Filtros */}
        <form className="bg-white rounded-lg border border-amauta-bg-light p-4 mb-6 grid gap-3 md:grid-cols-[1fr_auto_auto_auto] items-end">
          <div>
            <label htmlFor="q" className="block text-xs font-bold uppercase tracking-wider text-amauta-text-tertiary mb-1">
              Buscar por nombre
            </label>
            <input
              id="q"
              name="q"
              type="text"
              defaultValue={query}
              placeholder="Ej: Galileo, Premium, Ahorro Pesos…"
              className="w-full rounded-md border border-amauta-bg-light bg-white px-3 py-2 text-sm focus:outline-none focus:border-amauta-yellow focus:ring-2 focus:ring-amauta-yellow/30"
            />
          </div>
          <SelectFilter id="cat" label="Categoría" value={catFilter} options={snap.categorias} />
          <SelectFilter id="gestora" label="Gestora" value={gestoraFilter} options={snap.gestoras} />
          <SelectFilter id="horizonte" label="Horizonte" value={horizonteFilter} options={horizonteOpts} />
          <input type="hidden" name="sort" value={sortKey} />
          <div className="flex gap-2 md:col-span-4">
            <button
              type="submit"
              className="rounded-md bg-amauta-yellow text-amauta-dark font-bold px-5 py-2 text-sm hover:bg-amauta-yellow-hover transition-colors"
            >
              Filtrar
            </button>
            {(query || catFilter || gestoraFilter || horizonteFilter) && (
              <Link
                href="/fondos"
                className="rounded-md border border-amauta-bg-light text-amauta-text-secondary font-medium px-4 py-2 text-sm hover:bg-amauta-bg-light transition-colors"
              >
                Limpiar
              </Link>
            )}
          </div>
        </form>

        {/* Tabla */}
        <div className="bg-white rounded-lg border border-amauta-bg-light overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-amauta-dark text-white">
                <tr>
                  <th className="px-3 py-3 text-left font-bold">#</th>
                  <SortableHeader label="Fondo / Clase" sortKey="nombre" activeSort={sortKey} buildHref={buildHref} align="left" />
                  <th className="px-3 py-3 text-left font-bold">Categoría</th>
                  <th className="px-3 py-3 text-left font-bold">Gestora</th>
                  <SortableHeader label="VCP" sortKey="vcp_desc" activeSort={sortKey} buildHref={buildHref} align="right" />
                  <SortableHeader label="Patrimonio" sortKey="patrimonio_desc" activeSort={sortKey} buildHref={buildHref} align="right" />
                  <SortableHeader label="TNA 1D" sortKey="ret1d_desc" activeSort={sortKey} buildHref={buildHref} align="right" />
                  <SortableHeader label="Rend. 30D" sortKey="ret30d_desc" activeSort={sortKey} buildHref={buildHref} align="right" />
                  <SortableHeader label="Rend. 1A" sortKey="ret1a_desc" activeSort={sortKey} buildHref={buildHref} align="right" />
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-amauta-text-secondary">
                      No se encontraron fondos con esos filtros.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((r, i) => {
                    const tna1d = fmtReturn(r.tna1d, 2);
                    const ret30d = fmtReturn(r.ret30d, 2);
                    const ret1a = fmtReturn(r.ret1a, 2);
                    return (
                      <tr
                        key={r.key}
                        className="border-t border-amauta-bg-light hover:bg-amauta-bg-light/50"
                      >
                        <td className="px-3 py-3 text-amauta-text-tertiary tabular-nums">
                          {start + i + 1}
                        </td>
                        <td className="px-3 py-3 font-medium text-amauta-bordo">
                          <Link
                            href={`/fondo/${encodeURIComponent(r.key)}`}
                            className="hover:underline"
                          >
                            {r.displayName}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-amauta-text-secondary whitespace-nowrap">
                          {r.categoria ?? "—"}
                        </td>
                        <td className="px-3 py-3 text-amauta-text-secondary whitespace-nowrap">
                          {r.gestora ?? "—"}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                          {fmtNumber(r.vcp, 4)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                          {r.patrimonio ? fmtCompactCurrency(r.patrimonio, "ARS") : "—"}
                        </td>
                        <td className={`px-3 py-3 text-right tabular-nums whitespace-nowrap ${tna1d.colorClass}`}>
                          {tna1d.text}
                        </td>
                        <td className={`px-3 py-3 text-right tabular-nums whitespace-nowrap ${ret30d.colorClass}`}>
                          {ret30d.text}
                        </td>
                        <td className={`px-3 py-3 text-right tabular-nums whitespace-nowrap ${ret1a.colorClass}`}>
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
            <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-amauta-bg-light bg-amauta-bg-light/30 text-sm">
              <span className="text-amauta-text-tertiary">
                Página {safePage} de {totalPages}
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

        <p className="mt-4 text-xs text-amauta-text-tertiary">
          TNA 1D = rendimiento diario anualizado. Rend. 30D / 1A = retorno simple del período.
          Próximamente: ventanas custom y exportación CSV.
        </p>
      </div>
    </div>
  );
}

function SelectFilter({
  id, label, value, options,
}: {
  id: string; label: string; value: string; options: string[];
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-bold uppercase tracking-wider text-amauta-text-tertiary mb-1">
        {label}
      </label>
      <select
        id={id}
        name={id}
        defaultValue={value}
        className="rounded-md border border-amauta-bg-light bg-white px-3 py-2 text-sm focus:outline-none focus:border-amauta-yellow focus:ring-2 focus:ring-amauta-yellow/30 min-w-44"
      >
        <option value="">Todas</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function SortableHeader({
  label, sortKey, activeSort, buildHref, align = "left",
}: {
  label: string;
  sortKey: SortKey;
  activeSort: SortKey;
  buildHref: (overrides: Partial<SearchParams>) => string;
  align?: "left" | "right";
}) {
  const isActive = activeSort === sortKey;
  return (
    <th className={`px-3 py-3 ${align === "right" ? "text-right" : "text-left"} font-bold`}>
      <Link
        href={buildHref({ sort: sortKey, page: "1" })}
        className={`inline-flex items-center gap-1 hover:text-amauta-yellow transition-colors ${isActive ? "text-amauta-yellow" : ""}`}
      >
        {label} {isActive ? <span aria-hidden>↓</span> : null}
      </Link>
    </th>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  if (disabled) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-md text-amauta-text-tertiary/40 cursor-not-allowed">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center w-8 h-8 rounded-md text-amauta-text-secondary hover:bg-amauta-yellow hover:text-amauta-dark transition-colors"
    >
      {children}
    </Link>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-amauta-bg-light">
      <div className="bg-white rounded-lg border border-amauta-bg-light p-10 text-center max-w-md">
        <div className="text-6xl mb-3">⚠️</div>
        <h1 className="text-xl font-bold text-amauta-bordo">No se pudo cargar</h1>
        <p className="mt-2 text-sm text-amauta-text-secondary">{message}</p>
      </div>
    </div>
  );
}
