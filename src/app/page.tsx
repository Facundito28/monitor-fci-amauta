import Link from "next/link";

export default function Home() {
  return (
    <div className="flex-1 flex flex-col">
      {/* Hero */}
      <section className="bg-amauta-dark text-white">
        <div className="max-w-7xl mx-auto px-6 py-20 sm:py-28 grid gap-10 lg:grid-cols-2 items-center">
          <div>
            <span className="inline-block bg-amauta-yellow text-amauta-dark text-xs font-bold uppercase tracking-wider px-3 py-1 rounded">
              Beta · CAFCI Live Data
            </span>
            <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold leading-tight tracking-tight">
              Monitor de Fondos Comunes de Inversión
            </h1>
            <p className="mt-5 text-lg text-white/80 max-w-xl leading-relaxed">
              Consulte, compare y analice los FCIs argentinos con datos
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

          <div className="hidden lg:block">
            <div className="relative aspect-square max-w-md mx-auto rounded-2xl bg-gradient-to-br from-amauta-bordo to-amauta-dark p-8 border border-white/10 shadow-2xl">
              <div className="absolute top-6 right-6 text-amauta-yellow text-7xl font-extrabold leading-none">✦</div>
              <div className="space-y-3 mt-12">
                <KpiSkel label="Fondos monitoreados" value="—" />
                <KpiSkel label="Categorías" value="—" />
                <KpiSkel label="Última actualización" value="—" />
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
              title="TIR del día"
              body="VCP de hoy vs cierre anterior, anualizado en TNA y TEA. Para money market y renta fija corta lo ves al instante."
            />
            <Feature
              title="Períodos custom"
              body="Cualquier ventana de fechas — no solo 30/90 días. Selector libre desde/hasta en gráficos y comparador."
            />
            <Feature
              title="Comparar hasta 4 fondos"
              body="Curva base 100, tabla lado a lado, métricas de riesgo. Compartí la vista por link."
            />
            <Feature
              title="Rentabilidad real"
              body="Rendimientos descontando IPC del INDEC. Mirá lo que verdaderamente ganás en pesos constantes."
            />
            <Feature
              title="Benchmarks AR"
              body="Plazo Fijo BADLAR, MEP, CCL y Merval superpuestos sobre la curva del fondo."
            />
            <Feature
              title="Permalinks"
              body="Cada filtro y comparación queda en la URL. Copiás, pegás y tu compañero ve lo mismo."
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function KpiSkel({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-3 backdrop-blur-sm">
      <div className="text-[11px] uppercase tracking-wider text-white/60">{label}</div>
      <div className="text-2xl font-extrabold text-amauta-yellow mt-0.5">{value}</div>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-lg border border-amauta-bg-light p-6 hover:border-amauta-yellow transition-colors">
      <h3 className="font-bold text-amauta-bordo">{title}</h3>
      <p className="mt-2 text-sm text-amauta-text-secondary leading-relaxed">{body}</p>
    </article>
  );
}
