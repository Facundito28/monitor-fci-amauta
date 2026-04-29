import Link from "next/link";
import { fmtCompactCurrency } from "@/lib/utils/format";
import { fmtDateAr, getMarketSnapshot } from "@/lib/cafci/enriched";

// ISR — page revalidates every 10 min. CAFCI publishes daily post-cierre,
// so this keeps KPIs fresh during trading hours while making cached visits instant.
export const revalidate = 600;

export default async function Home() {
  const snap = await getMarketSnapshot().catch(() => null);

  const kpiFondos = snap?.rows.length ?? null;
  const kpiCats = snap?.categorias.length ?? null;
  const kpiFecha = snap?.fecha ? fmtDateAr(snap.fecha) : null;
  const kpiAum = snap?.aumTotal ?? null;

  return (
    <div className="flex-1 flex flex-col">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-amauta-dark text-white">
        {/* Decorative bordo glow — subtle radial in top-left */}
        <div
          className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, #621044 0%, transparent 70%)" }}
          aria-hidden
        />
        {/* Decorative yellow glow — subtle radial in bottom-right */}
        <div
          className="absolute -bottom-40 -right-40 w-[520px] h-[520px] rounded-full opacity-15 blur-3xl"
          style={{ background: "radial-gradient(circle, #f3cf11 0%, transparent 70%)" }}
          aria-hidden
        />

        <div className="relative max-w-7xl mx-auto px-6 py-20 sm:py-28 grid gap-12 lg:grid-cols-2 items-center">
          <div>
            <span className="inline-flex items-center gap-2 bg-amauta-yellow text-amauta-dark text-[11px] font-bold uppercase tracking-[0.18em] px-3 py-1.5 rounded-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-amauta-dark animate-pulse" />
              Beta · CAFCI Live Data
            </span>

            <h1 className="mt-6 text-4xl sm:text-5xl font-extrabold leading-[1.05] tracking-tight">
              Monitor de
              <br />
              <span className="text-amauta-yellow">Fondos Comunes</span>
              <br />
              de Inversión
            </h1>

            <span className="amauta-rule mt-6" />

            <p className="mt-6 text-lg text-white/80 max-w-xl leading-relaxed">
              Consultá, compará y analizá los FCIs argentinos con datos
              actualizados todos los días. Rendimiento real, TIR diaria y
              benchmarks del mercado local en una sola vista.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/fondos"
                className="inline-flex items-center justify-center px-6 py-3 rounded-sm bg-amauta-yellow text-amauta-dark font-bold hover:bg-amauta-yellow-hover transition-colors shadow-card"
              >
                Ver fondos
                <span className="ml-2">→</span>
              </Link>
              <Link
                href="/comparar"
                className="inline-flex items-center justify-center px-6 py-3 rounded-sm border border-white/30 text-white font-bold hover:bg-white/10 hover:border-white/60 transition-colors"
              >
                Comparar fondos
              </Link>
            </div>
          </div>

          {/* ── KPI panel ──────────────────────────────────────────────── */}
          <div className="lg:justify-self-end w-full max-w-md">
            <div className="relative rounded-lg bg-gradient-to-br from-amauta-bordo to-amauta-dark p-8 border border-white/10 shadow-card">
              <div className="flex items-center justify-between mb-6">
                <span className="text-[11px] uppercase tracking-[0.18em] text-white/60 font-bold">
                  Mercado en vivo
                </span>
                <span className="text-amauta-yellow text-3xl font-extrabold leading-none">
                  ✦
                </span>
              </div>

              <div className="space-y-3">
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

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="bg-white">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="max-w-2xl">
            <span className="text-[11px] uppercase tracking-[0.18em] text-amauta-bordo font-bold">
              Plataforma
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold text-amauta-text leading-tight">
              Lo que vas a poder hacer
            </h2>
            <span className="amauta-rule mt-4" />
            <p className="mt-5 text-amauta-text-secondary leading-relaxed">
              Construido para asesores y mesa, con foco en lo que se mira a
              diario.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Feature
              n="01"
              title="Listado completo"
              body="Todas las clases activas con VCP, patrimonio y categoría — actualizado todos los días post-cierre."
              href="/fondos"
            />
            <Feature
              n="02"
              title="Rendimiento por período"
              body="Elegí fecha inicio y fecha fin en cualquier fondo y calculá el rendimiento real del período con TNA estimada."
              href="/fondos"
            />
            <Feature
              n="03"
              title="Comparar hasta 4 fondos"
              body="Selector con buscador y tabla lado a lado: VCP, AUM, gestora, categoría, rendimientos. Permalink para compartir."
              href="/comparar"
            />
            <Feature
              n="04"
              title="Rankings por AUM y categoría"
              body="Top fondos por patrimonio en cada categoría. Filtrá por horizonte para encontrar el mix que necesitás."
              href="/rankings"
            />
            <Feature
              n="05"
              title="Ficha completa de cada fondo"
              body="VCP, composición de cartera semanal, honorarios y rendimientos oficiales de CAFCI en una sola vista."
              href="/fondos"
            />
            <Feature
              n="06"
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
    <div className="rounded-sm bg-white/5 border border-white/10 px-4 py-3 backdrop-blur-sm">
      <div className="text-[11px] uppercase tracking-[0.18em] text-white/60 font-bold">
        {label}
      </div>
      <div className="text-2xl font-extrabold text-amauta-yellow mt-1 tabular-nums">
        {value}
      </div>
    </div>
  );
}

function Feature({
  n,
  title,
  body,
  href,
}: {
  n: string;
  title: string;
  body: string;
  href?: string;
}) {
  const inner = (
    <>
      <span className="text-[11px] font-bold text-amauta-yellow uppercase tracking-[0.18em]">
        {n}
      </span>
      <h3 className="mt-2 font-extrabold text-amauta-bordo text-lg">
        {title}
      </h3>
      <p className="mt-2 text-sm text-amauta-text-secondary leading-relaxed">
        {body}
      </p>
      {href && (
        <span className="mt-4 inline-flex items-center text-xs font-bold text-amauta-bordo opacity-0 group-hover:opacity-100 transition-opacity">
          Ver <span className="ml-1">→</span>
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group block rounded-sm border border-amauta-bg-light bg-white p-6 hover:border-amauta-yellow hover:shadow-card transition-all duration-300 cursor-pointer"
      >
        {inner}
      </Link>
    );
  }

  return (
    <article className="rounded-sm border border-amauta-bg-light p-6">
      {inner}
    </article>
  );
}
