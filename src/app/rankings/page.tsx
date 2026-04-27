/**
 * Rankings de FCIs por categoría — top 10 por patrimonio (AUM).
 * Cuando tengamos serie histórica vamos a sumar TNA día/30d/1a y volatilidad.
 */
import Link from "next/link";
import { fmtCompactCurrency, fmtNumber } from "@/lib/utils/format";
import { fmtDateAr, getMarketSnapshot } from "@/lib/cafci/enriched";
import type { EnrichedRow } from "@/lib/cafci/enriched";

const TOP_N = 10;

export const metadata = {
  title: "Rankings · Monitor FCIs · Amauta",
  description:
    "Rankings de Fondos Comunes de Inversión argentinos por patrimonio (AUM) y categoría.",
};

export const dynamic = "force-dynamic";

export default async function RankingsPage() {
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

  // Group rows by category
  const byCat = new Map<string, EnrichedRow[]>();
  for (const r of snap.rows) {
    if (!r.categoria || r.patrimonio == null) continue;
    if (!byCat.has(r.categoria)) byCat.set(r.categoria, []);
    byCat.get(r.categoria)!.push(r);
  }

  // Sort each group desc by AUM and slice top N
  const groups = Array.from(byCat.entries())
    .map(([cat, rows]) => ({
      categoria: cat,
      total: rows.length,
      aumTotal: rows.reduce((s, r) => s + (r.patrimonio ?? 0), 0),
      top: rows
        .sort((a, b) => (b.patrimonio ?? 0) - (a.patrimonio ?? 0))
        .slice(0, TOP_N),
    }))
    .sort((a, b) => b.aumTotal - a.aumTotal);

  return (
    <div className="bg-amauta-bg-light flex-1">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-amauta-bordo">
            Rankings de fondos
          </h1>
          <p className="mt-1 text-sm text-amauta-text-secondary">
            Top {TOP_N} por patrimonio dentro de cada categoría · cierre {fmtDateAr(snap.fecha)}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {groups.map((g) => (
            <CategoryCard key={g.categoria} group={g} />
          ))}
        </div>

        <p className="mt-6 text-xs text-amauta-text-tertiary">
          Próximamente: ranking por TNA día / 30d / 1a, rentabilidad real ajustada por IPC, ratio de Sharpe.
        </p>
      </div>
    </div>
  );
}

function CategoryCard({
  group,
}: {
  group: {
    categoria: string;
    total: number;
    aumTotal: number;
    top: EnrichedRow[];
  };
}) {
  const catSlug = encodeURIComponent(group.categoria);
  return (
    <article className="bg-white rounded-lg border border-amauta-bg-light overflow-hidden">
      <header className="bg-amauta-dark text-white px-4 py-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-extrabold">{group.categoria}</h2>
          <p className="text-xs text-white/60">
            {group.total.toLocaleString("es-AR")} clases · AUM total{" "}
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
            <th className="px-3 py-2 text-left font-bold">#</th>
            <th className="px-3 py-2 text-left font-bold">Fondo / Clase</th>
            <th className="px-3 py-2 text-right font-bold">VCP</th>
            <th className="px-3 py-2 text-right font-bold">Patrimonio</th>
          </tr>
        </thead>
        <tbody>
          {group.top.map((r, i) => (
            <tr
              key={r.key}
              className="border-t border-amauta-bg-light hover:bg-amauta-bg-light/40"
            >
              <td className="px-3 py-2 text-amauta-text-tertiary tabular-nums w-10">
                {i + 1}
              </td>
              <td className="px-3 py-2 font-medium text-amauta-bordo">
                <div>{r.displayName}</div>
                {r.gestora && (
                  <div className="text-xs text-amauta-text-tertiary font-normal">
                    {r.gestora}
                  </div>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                {fmtNumber(r.vcp, 4)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-medium text-amauta-bordo">
                {r.patrimonio ? fmtCompactCurrency(r.patrimonio, "ARS") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
