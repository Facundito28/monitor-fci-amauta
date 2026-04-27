/**
 * Listado de FCIs argentinos.
 *
 * Datos: API pública CAFCI (server-side fetch con revalidate). Próxima fase
 * migra a Supabase para soportar histórico, métricas y permalinks de filtros.
 *
 * Filtros sincronizados con la URL (permalinks compartibles).
 */
import Link from "next/link";
import {
  getFondosActivos,
  getGestoraMap,
  getTiposRenta,
} from "@/lib/cafci/client";

const PAGE_SIZE = 50;

interface SearchParams {
  q?: string;
  cat?: string;
  page?: string;
}

export const metadata = {
  title: "Fondos · Monitor FCIs · Amauta",
  description:
    "Listado completo de Fondos Comunes de Inversión argentinos con filtros por categoría y sociedad gerente.",
};

export default async function FondosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const catId = (sp.cat ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);

  const [fondos, categorias, gestoras] = await Promise.all([
    getFondosActivos().catch((e) => {
      console.error("[fondos page] getFondosActivos failed:", e);
      return [];
    }),
    getTiposRenta().catch((e) => {
      console.error("[fondos page] getTiposRenta failed:", e);
      return [];
    }),
    getGestoraMap().catch((e) => {
      console.error("[fondos page] getGestoraMap failed:", e);
      return new Map<string, string>();
    }),
  ]);

  // Index categorias for fast lookup
  const catMap = new Map(categorias.map((c) => [String(c.id), c.nombre]));

  // Filtrar
  const filtered = fondos.filter((f) => {
    if (catId && String(f.tipoRentaId) !== catId) return false;
    if (query && !f.nombre?.toLowerCase().includes(query.toLowerCase()))
      return false;
    return true;
  });

  // Paginar
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);

  const buildHref = (overrides: Partial<SearchParams>) => {
    const params = new URLSearchParams();
    const merged = { q: query, cat: catId, page: String(safePage), ...overrides };
    if (merged.q) params.set("q", merged.q);
    if (merged.cat) params.set("cat", merged.cat);
    if (merged.page && merged.page !== "1") params.set("page", merged.page);
    const qs = params.toString();
    return qs ? `/fondos?${qs}` : "/fondos";
  };

  return (
    <div className="bg-amauta-bg-light flex-1">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-extrabold text-amauta-bordo">
              Fondos Comunes de Inversión
            </h1>
            <p className="mt-1 text-sm text-amauta-text-secondary">
              {total.toLocaleString("es-AR")} fondos activos · datos en vivo de
              CAFCI
            </p>
          </div>
        </div>

        {/* Filtros */}
        <form className="bg-white rounded-lg border border-amauta-bg-light p-4 mb-6 grid gap-3 sm:grid-cols-[1fr_auto_auto] items-end">
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
          <div>
            <label htmlFor="cat" className="block text-xs font-bold uppercase tracking-wider text-amauta-text-tertiary mb-1">
              Categoría
            </label>
            <select
              id="cat"
              name="cat"
              defaultValue={catId}
              className="rounded-md border border-amauta-bg-light bg-white px-3 py-2 text-sm focus:outline-none focus:border-amauta-yellow focus:ring-2 focus:ring-amauta-yellow/30 min-w-48"
            >
              <option value="">Todas</option>
              {categorias
                .filter((c) => c.nombre && c.nombre !== "<Sin Asignar>")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-md bg-amauta-yellow text-amauta-dark font-bold px-5 py-2 text-sm hover:bg-amauta-yellow-hover transition-colors"
            >
              Filtrar
            </button>
            {(query || catId) && (
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
                  <th className="px-4 py-3 text-left font-bold">#</th>
                  <th className="px-4 py-3 text-left font-bold">Fondo</th>
                  <th className="px-4 py-3 text-left font-bold">Categoría</th>
                  <th className="px-4 py-3 text-left font-bold">Gestora</th>
                  <th className="px-4 py-3 text-left font-bold">Horizonte</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-amauta-text-secondary">
                      No se encontraron fondos con esos filtros.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((f, i) => {
                    const cat =
                      f.tipoRenta?.nombre ?? catMap.get(String(f.tipoRentaId)) ?? f.clasificacionVieja ?? "—";
                    const gestora =
                      gestoras.get(String(f.sociedadGerenteId)) ?? "—";
                    return (
                      <tr
                        key={f.id}
                        className="border-t border-amauta-bg-light hover:bg-amauta-bg-light/50"
                      >
                        <td className="px-4 py-3 text-amauta-text-tertiary tabular-nums">
                          {start + i + 1}
                        </td>
                        <td className="px-4 py-3 font-medium text-amauta-bordo">
                          {f.nombre}
                        </td>
                        <td className="px-4 py-3 text-amauta-text-secondary">{cat}</td>
                        <td className="px-4 py-3 text-amauta-text-secondary">{gestora}</td>
                        <td className="px-4 py-3 text-amauta-text-secondary">
                          {f.horizonteViejo ?? "—"}
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
                <PageLink href={buildHref({ page: "1" })} disabled={safePage === 1}>
                  «
                </PageLink>
                <PageLink
                  href={buildHref({ page: String(safePage - 1) })}
                  disabled={safePage === 1}
                >
                  ‹
                </PageLink>
                <PageLink
                  href={buildHref({ page: String(safePage + 1) })}
                  disabled={safePage === totalPages}
                >
                  ›
                </PageLink>
                <PageLink
                  href={buildHref({ page: String(totalPages) })}
                  disabled={safePage === totalPages}
                >
                  »
                </PageLink>
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-amauta-text-tertiary">
          Próximamente: rendimiento por períodos, TIR del día y comparador entre fondos.
        </p>
      </div>
    </div>
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
