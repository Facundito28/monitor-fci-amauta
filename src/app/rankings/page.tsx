/**
 * Rankings de FCIs por rendimiento y categoría.
 *
 * Período seleccionable en URL: ?periodo=1d | 7d | 30d | 1a
 * Top 10 por rendimiento del período elegido dentro de cada categoría.
 */
import Link from "next/link";
import { fmtCompactCurrency, fmtNumber, fmtReturn } from "@/lib/utils/format";
import { fmtDateAr, getMarketSnapshotWithReturns } from "@/lib/cafci/enriched";
import type { EnrichedRow } from "@/lib/cafci/enriched";

const TOP_N = 10;

type Periodo = "1d" | "7d" | "30d" | "1a";

const PERIODOS: { key: Periodo; label: string; field: keyof EnrichedRow }[] = [
  { key: "1d", label: "Diario (1D)", field: "ret1d" },
  { key: "7d", label: "Semanal (7D)", field: "ret7d" },
  { key: "30d", label: "Mensual (30D)", field: "ret30d" },
  { key: "1a", label: "Interanual (1A)", field: "ret1a" },
];

interface SearchParams {
  periodo?: string;
  cat?: string;
}

export const metadata = {
  title: "Rankings · Monitor FCIs · Amauta",
  description:
    "Rankings de Fondos Comunes de Inversión argentinos por rendimiento diario, semanal, mensual e interanual.",
};

export const dynamic = "force-dynamic";

export default async function RankingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const periodo = (sp.periodo as Periodo) ?? "30d";
  const catFilter = (sp.cat ?? "").trim();

  const validPeriodo = PERIODOS.find((p) => p.key === periodo) ? periodo : "30d";
  const periodoConfig = PERIODOS.find((p) => p.key === validPeriodo) ?? PERIODOS[2];

  const snap = await getMarketSnapshotWithReturns().catch(() => null);

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

  const getReturn = (r: EnrichedRow): number | null =>
    r[periodoConfig.field] as number | null;

  const filteredRows = catFilter
    ? snap.rows.filter((r) => r.categoria === catFilter)
    : snap.rows;

  const byCat = new Map<string, EnrichedRow[]>();
  for (const r of filteredRows) {
    if (!r.categoria) continue;
    const ret = getReturn(r);
    if (ret == null) continue;
    if (!byCat.has(r.categoria)) byCat.set(r.categoria, []);
    byCat.get(r.categoria)!.push(r);
  }

  const groups = Array.from(byCat.entries())
    .map(([cat, rows]) => ({
      categoria: cat,
      total: snap.rows.filter((r) => r.categoria === cat).length,
      aumTotal: snap.rows
        .filter((r) => r.categoria === cat)
        .reduce((s, r) => s + (r.patrimonio ?? 0), 0),
      top: rows
        .sort((a, b) => (getReturn(b) ?? -Infinity) - (getReturn(a) ?? -Infinity))
        .slice(0, TOP_N),
    }))
    .sort((a, b) => b.aumTotal - a.aumTotal);

  const buildPeriodoHref = (p: Periodo) => {
    const params = new URLSearchParams();
    params.set("periodo", p);
    if (catFilter) params.set("cat", catFilter);
    return `/rankings?${params.toString()}`;
  };

  const buildCatHref = (cat: string) => {
    const params = new URLSearchParams();
    params.set("periodo", validPeriodo);
    if (cat) params.set("cat", cat);
    return `/rankings?${params.toString()}`;
  };

  return (
    <div className="bg-amauta-bg-light flex-1">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold text-amauta-bordo">
            Rankings de fondos
          </h1>
          <p className="mt-1 text-sm text-amauta-text-secondary">
            Top {TOP_N} por rendimiento en el período seleccionado · cierre{" "}
            {fmtDateAr(snap.fecha)}
          </p>
        </div>

        {/* Period tabs */}
        <div className="bg-white rounded-lg border border-amauta-bg-light p-3 mb-6 flex flex-wrap gap-2 items-center">
          <span className="text-xs font-bold uppercase tracking-wider text-amauta-text-tertiary mr-1">
            Período:
          </span>
          {PERIODOS.map((p) => (
            <Link
              key={p.key}
              href={buildPeriodoHref(p.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                validPeriodo === p.key
                  ? "bg-amauta-bordo text-white"
                  : "bg-amauta-bg-light text-amauta-text-secondary hover:bg-amauta-yellow/20"
              }`}
            >
              {p.label}
            </Link>
          ))}
          <div className="ml-auto flex flex-wrap gap-1">
            <Link
              href={buildCatHref("")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                !catFilter
                  ? "bg-amauta-dark text-white"
                  : "bg-amauta-bg-light text-amauta-text-secondary hover:bg-amauta-yellow/20"
              }`}
            >
              Todas
            </Link>
            {snap.categorias.map((cat) => (
              <Link
                key={cat}
                href={buildCatHref(cat)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  catFilter === cat
                    ? "bg-amauta-dark text-white"
                    : "bg-amauta-bg-light text-amauta-text-secondary hover:bg-amauta-yellow/20"
                }`}
              >
                {cat}
              </Link>
            ))}
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="bg-white rounded-lg border border-amauta-bg-light p-12 text-center">
            <p className="text-amauta-text-secondary">
              No hay datos de rendimiento disponibles para este período. Los
              datos aparecen el siguiente día hábil.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {groups.map((g) => (
              <CategoryCard
                key={g.categoria}
                group={g}
                getReturn={getReturn}
                periodoLabel={periodoConfig.label}
              />
            ))}
          </div>
        )}

        <p className="mt-6 text-xs text-amauta-text-tertiary">
          Rendimientos calculados sobre VCP (Valor Cuotaparte) de CAFCI.
          Próximamente: ratio de Sharpe, volatilidad, rentabilidad real ajustada por IPC.
        </p>
      </div>
    </div>
  );
}

function CategoryCard({
  group,
  getReturn,
  periodoLabel,
}: {
  group: {
    categoria: string;
    total: number;
    aumTotal: number;
    top: EnrichedRow[];
  };
  getReturn: (r: EnrichedRow) => number | null;
  periodoLabel: string;
}) {
  const catSlug = encodeURIComponent(group.categoria);
  return (
    <article className="bg-white rounded-lg border border-amauta-bg-light overflow-hidden">
      <header className="bg-amauta-dark text-white px-4 py-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-extrabold">{group.categoria}</h2>
          <p className="text-xs text-white/60">
            {group.total.toLocaleString("es-AR")} clases · AUM{" "}
            {fmtCompactCurrency(group.aumTotal, "ARS")}
          </p>
        </div>
        <Link
          href={`/fondos?cat=${catSlug}&sort=patrimonio_desc`}
          className="text-xs font-bold text-amauta-yellow hover:text-white whitespace-nowrap"
        >
          Ver todos →
        </Link>
      </header>
      <table className="w-full text-sm">
        <thead className="bg-amauta-bg-light/50 text-amauta-text-tertiary text-xs uppercase">
          <tr>
            <th className="px-3 py-2 text-left font-bold w-8">#</th>
            <th className="px-3 py-2 text-left font-bold">Fondo / Clase</th>
            <th className="px-3 py-2 text-right font-bold">VCP</th>
            <th className="px-3 py-2 text-right font-bold">{periodoLabel}</th>
          </tr>
        </thead>
        <tbody>
          {group.top.map((r, i) => {
            const ret = getReturn(r);
            const retFmt = fmtReturn(ret, 2);
            return (
              <tr
                key={r.key}
                className="border-t border-amauta-bg-light hover:bg-amauta-bg-light/40"
              >
                <td className="px-3 py-2 text-amauta-text-tertiary tabular-nums">
                  {i + 1}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/fondo/${encodeURIComponent(r.key)}`}
                    className="font-medium text-amauta-bordo hover:underline"
                  >
                    {r.displayName}
                  </Link>
                  {r.gestora && (
                    <div className="text-xs text-amauta-text-tertiary font-normal">
                      {r.gestora}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-amauta-text-secondary">
                  {fmtNumber(r.vcp, 4)}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold ${retFmt.colorClass}`}
                >
                  {retFmt.text}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
  );
}
