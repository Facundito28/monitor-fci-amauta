import Link from "next/link";
import { fmtCompactCurrency } from "@/lib/utils/format";
import { fmtDateAr, getMarketSnapshot } from "@/lib/fondos/enriched";

export const dynamic = "force-dynamic";

export default async function Home() {
  const snap = await getMarketSnapshot().catch(() => null);

  const kpiFondos = snap?.rows.length ?? null;
  const kpiCats = snap?.categorias.length ?? null;
  const kpiFecha = snap?.fecha ? fmtDateAr(snap.fecha) : null;
  const kpiAum = snap?.aumTotal ?? null;

  return (
    <div className="flex-1 flex flex-col">
      {/* Hero */}
      <section className="bg-amauta-dark text-white">
        <div className="max-w-7xl mx-auto px-6 py-20 sm:py-28 grid gap-10 lg:grid-cols-2 items-center">
          <div>
            <span className="inline-block bg-amauta-yellow text-amauta-dark text-xs font-bold uppercase tracking-wider px-3 py-1 rounded">
              Beta · Datos diarios
            </span>
            <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold leading-tight tracking-tight">
              Monitor de Fondos Comunes de Inversión
            </h1>
            <p className="mt-5 text-lg text-white/80 max-w-xl leading-relaxed">
              Consultá, compará y analizá los FCIs argentinos con datos
              actualizados todos los días. Rendimiento real, TIR diaria y
              benchmarks del mercado local en una sola vista.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/fondos"
                className="inline-flex items-center justify-center px-6 py-3 rounded-md bg-amauta-yellow text-amauta-dark font-bold hover:bg-amauta-yellow-hover transition-colors"
              >
                Ver fondos
              </Link>
              <Link
                href="/comparar"
                className="inline-flex items-center justify-center px-6 py-3 rounded-md border border-white/30 text-white font-bold hover:bg-white/10 transition-colors"
              >
                Comparar fondos
              </Link>
            </div>
          </div>

          {/* KPI panel */}
          <div className="lg:justify-self-end w-full max-w-md">
            <div className="relative aspect-square rounded-2xl bg-gradient-to-br from-amauta-bordo to-amauta-dark p-8 border border-white/10 shadow-2xl">
              <div className="absolute top-6 right-6 text-amauta-yellow text-7xl font-extrabold leading-none">
                ✦
              </div>
              <div className="space-y-3 mt-12 relative">
                <Kpi
                  label="Clases monitoreadas"
                  value={kpiFondos != null ? kpiFondos.toLocaleString("es-AR") : "—"}
                />
                <Kpi
                  label="Categorías"
                  value={kpiCats != null ? kpiCats.toString() : "—"}
                />
                <Kpi
                  label="Patrimonio agregado (AUM)"
                  value={kpiAum != null ? fmtCompactCurrency(kpiAum, "ARS") : "—"}
                />
                <Kpi
                  label="Última actualización"
                  value={kpiFecha ?? "—"}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-white">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-amauta-bordo">
            Lo que vas a poder hacer
          </h2>
          <p className="mt-2 text-amauta-text-secondary max-w-2xl">
            Construido para asesores y mesa, con foco en lo que se mira a
            diario.
          </p>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Feature
              title="Listado completo"
              body="Todas las clases activas con VCP, patrimonio y categoría — actualizado todos los días post-cierre."
              href="/fondos"
            />
            <Feature
              title="Rendimiento por período"
              body="Elegí fecha inicio y fecha fin en cualquier fondo y calculá el rendimiento real del período con TNA estimada."
              href="/fondos"
            />
            <Feature
              title="Comparar hasta 4 fondos"
              body="Selector con buscador y tabla lado a lado: VCP, AUM, gestora, categoría, rendimientos. Permalink para compartir."
              href="/comparar"
            />
            <Feature
              title="Rankings por AUM y categoría"
              body="Top fondos por patrimonio en cada categoría. Filtrá por horizonte para encontrar el mix que necesitás."
              href="/rankings"
            />
            <Feature
              title="Ficha completa de cada fondo"
              body="VCP, AUM, honorarios, rendimientos históricos y volatilidad — todo lo que mirás antes de recomendar un fondo."
              href="/fondos"
            />
            <Feature
              title="Permalinks compartibles"
              body="Cada filtro y comparación queda en la URL. Copiás, pegás y tu compañero ve lo mismo."
              href="/comparar"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-3 backdrop-blur-sm">
      <div className="text-[11px] uppercase tracking-wider text-white/60">
        {label}
      </div>
      <div className="text-2xl font-extrabold text-amauta-yellow mt-0.5 tabular-nums">
        {value}
      </div>
    </div>
  );
}

function Feature({
  title,
  body,
  href,
}: {
  title: string;
  body: string;
  href?: string;
}) {
  const inner = (
    <>
      <h3 className="font-bold text-amauta-bordo group-hover:text-amauta-bordo">
        {title}
      </h3>
      <p className="mt-2 text-sm text-amauta-text-secondary leading-relaxed">
        {body}
      </p>
      {href && (
        <span className="mt-3 inline-block text-xs font-bold text-amauta-yellow opacity-0 group-hover:opacity-100 transition-opacity">
          Ver →
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group block rounded-lg border border-amauta-bg-light p-6 hover:border-amauta-yellow hover:shadow-sm transition-all cursor-pointer"
      >
        {inner}
      </Link>
    );
  }

  return (
    <article className="rounded-lg border border-amauta-bg-light p-6">
      {inner}
    </article>
  );
}
