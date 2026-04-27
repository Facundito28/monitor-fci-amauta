/**
 * Comparador de fondos: hasta 4 clases lado a lado.
 *
 * Estado en URL: /comparar?fondos=key1|key2|key3 (encoded display names).
 * Permalink compartible con compañeros.
 */
import Link from "next/link";
import { fmtCompactCurrency, fmtNumber } from "@/lib/utils/format";
import { fmtDateAr, getMarketSnapshot } from "@/lib/cafci/enriched";
import type { EnrichedRow } from "@/lib/cafci/enriched";

const MAX_FONDOS = 4;

interface SearchParams {
  fondos?: string;
  q?: string;
}

export const metadata = {
  title: "Comparar fondos · Monitor FCIs · Amauta",
  description:
    "Compará hasta 4 Fondos Comunes de Inversión argentinos lado a lado. Permalink compartible.",
};

export const dynamic = "force-dynamic";

export default async function CompararPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const selectedKeys = (sp.fondos ?? "")
    .split("|")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, MAX_FONDOS);
  const query = (sp.q ?? "").trim();

  const snap = await getMarketSnapshot().catch(() => null);

  if (!snap) {
    return (
      <div className="flex-1 flex items-center justify-center bg-amauta-bg-light">
        <div className="bg-white rounded-lg p-8 text-center">
          <p className="text-amauta-text-secondary">
            No se pudo conectar con CAFCI. Volvé a intentar en unos minutos.
          </p>
        </div>
      </div>
    );
  }

  // Resolve selected rows
  const byKey = new Map<string, EnrichedRow>();
  for (const r of snap.rows) byKey.set(r.key, r);
  const selected = selectedKeys
    .map((k) => byKey.get(k))
    .filter((r): r is EnrichedRow => Boolean(r));

  // Build search results (limit to 30 most relevant by AUM)
  const searchResults = query
    ? snap.rows
        .filter((r) =>
          r.displayName.toLowerCase().includes(query.toLowerCase()),
        )
        .sort((a, b) => (b.patrimonio ?? 0) - (a.patrimonio ?? 0))
        .slice(0, 30)
    : [];

  const buildAddHref = (key: string) => {
    const next = [...selectedKeys, key].slice(0, MAX_FONDOS).join("|");
    return `/comparar?fondos=${encodeURIComponent(next)}`;
  };
  const buildRemoveHref = (key: string) => {
    const next = selectedKeys.filter((k) => k !== key).join("|");
    if (!next) return "/comparar";
    return `/comparar?fondos=${encodeURIComponent(next)}`;
  };

  return (
    <div className="bg-amauta-bg-light flex-1">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold text-amauta-bordo">
            Comparador de fondos
          </h1>
          <p className="mt-1 text-sm text-amauta-text-secondary">
            Hasta {MAX_FONDOS} clases lado a lado · cierre {fmtDateAr(snap.fecha)} · permalink
            compartible
          </p>
        </div>

        {/* Search box to add fondos */}
        <form className="bg-white rounded-lg border border-amauta-bg-light p-4 mb-6">
          {/* Preserve selected keys when submitting search */}
          {selectedKeys.length > 0 && (
            <input
              type="hidden"
              name="fondos"
              value={selectedKeys.join("|")}
            />
          )}
          <label
            htmlFor="q"
            className="block text-xs font-bold uppercase tracking-wider text-amauta-text-tertiary mb-1"
          >
            Agregar fondos {selected.length > 0 && `(${selected.length}/${MAX_FONDOS})`}
          </label>
          <div className="flex gap-2">
            <input
              id="q"
              name="q"
              type="text"
              defaultValue={query}
              placeholder="Ej: Galileo Premium, Pellegrini Renta…"
              className="flex-1 rounded-md border border-amauta-bg-light bg-white px-3 py-2 text-sm focus:outline-none focus:border-amauta-yellow focus:ring-2 focus:ring-amauta-yellow/30"
              disabled={selectedKeys.length >= MAX_FONDOS}
            />
            <button
              type="submit"
              className="rounded-md bg-amauta-yellow text-amauta-dark font-bold px-5 py-2 text-sm hover:bg-amauta-yellow-hover transition-colors disabled:opacity-50"
              disabled={selectedKeys.length >= MAX_FONDOS}
            >
              Buscar
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="mt-3 max-h-64 overflow-y-auto border border-amauta-bg-light rounded-md">
              {searchResults.map((r) => {
                const already = selectedKeys.includes(r.key);
                return (
                  <Link
                    key={r.key}
                    href={already ? "#" : buildAddHref(r.key)}
                    className={`flex items-center justify-between px-3 py-2 text-sm border-b border-amauta-bg-light last:border-0 ${
                      already
                        ? "opacity-50 pointer-events-none"
                        : "hover:bg-amauta-bg-light/50"
                    }`}
                  >
                    <span>
                      <span className="font-medium text-amauta-bordo">
                        {r.displayName}
                      </span>
                      <span className="ml-2 text-xs text-amauta-text-tertiary">
                        {r.categoria ?? "—"} · {r.gestora ?? "—"}
                      </span>
                    </span>
                    <span className="text-xs text-amauta-text-secondary tabular-nums whitespace-nowrap">
                      {r.patrimonio ? fmtCompactCurrency(r.patrimonio, "ARS") : "—"}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
          {query && searchResults.length === 0 && (
            <p className="mt-3 text-sm text-amauta-text-tertiary">
              Sin resultados para "{query}".
            </p>
          )}
        </form>

        {/* Comparison table */}
        {selected.length === 0 ? (
          <div className="bg-white rounded-lg border border-amauta-bg-light p-12 text-center">
            <h2 className="text-xl font-bold text-amauta-bordo">
              Empezá agregando hasta {MAX_FONDOS} fondos
            </h2>
            <p className="mt-2 text-sm text-amauta-text-secondary">
              Usá el buscador de arriba para sumar clases. La URL se actualiza
              sola — copiala para compartirla con tus compañeros.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-amauta-bg-light overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-amauta-dark text-white">
                    <th className="px-3 py-3 text-left font-bold w-44">
                      Métrica
                    </th>
                    {selected.map((r) => (
                      <th
                        key={r.key}
                        className="px-3 py-3 text-left font-bold min-w-48"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span>{r.displayName}</span>
                          <Link
                            href={buildRemoveHref(r.key)}
                            className="text-amauta-yellow hover:text-white text-lg leading-none"
                            aria-label={`Quitar ${r.displayName}`}
                          >
                            ×
                          </Link>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <ComparisonRow label="Categoría" rows={selected} get={(r) => r.categoria ?? "—"} />
                  <ComparisonRow label="Gestora" rows={selected} get={(r) => r.gestora ?? "—"} />
                  <ComparisonRow label="Horizonte" rows={selected} get={(r) => r.horizonte ?? "—"} />
                  <ComparisonRow
                    label="VCP"
                    rows={selected}
                    align="right"
                    get={(r) => fmtNumber(r.vcp, 4)}
                  />
                  <ComparisonRow
                    label="Patrimonio (AUM)"
                    rows={selected}
                    align="right"
                    get={(r) =>
                      r.patrimonio
                        ? fmtCompactCurrency(r.patrimonio, "ARS")
                        : "—"
                    }
                  />
                  <ComparisonRow
                    label="Cuotapartes"
                    rows={selected}
                    align="right"
                    get={(r) => (r.ccp ? fmtNumber(r.ccp, 0) : "—")}
                  />
                  <ComparisonRow
                    label="Última fecha"
                    rows={selected}
                    get={(r) => fmtDateAr(r.fecha)}
                  />
                </tbody>
              </table>
            </div>
            <div className="border-t border-amauta-bg-light bg-amauta-bg-light/30 px-4 py-3 text-xs text-amauta-text-tertiary">
              Próximamente: gráfico cuotaparte base 100, TNA por ventanas y
              overlay de benchmarks (BADLAR, MEP, CCL, Merval).
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ComparisonRow({
  label,
  rows,
  get,
  align = "left",
}: {
  label: string;
  rows: EnrichedRow[];
  get: (r: EnrichedRow) => string;
  align?: "left" | "right";
}) {
  return (
    <tr className="border-t border-amauta-bg-light">
      <td className="px-3 py-2 font-bold text-amauta-text-tertiary uppercase text-xs">
        {label}
      </td>
      {rows.map((r) => (
        <td
          key={r.key}
          className={`px-3 py-2 ${align === "right" ? "text-right tabular-nums" : ""} text-amauta-text-secondary`}
        >
          {get(r)}
        </td>
      ))}
    </tr>
  );
}
