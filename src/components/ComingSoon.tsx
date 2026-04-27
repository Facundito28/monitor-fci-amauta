import Link from "next/link";

interface Props {
  title: string;
  description: string;
  bullets?: string[];
  phase?: string;
}

export function ComingSoon({ title, description, bullets, phase }: Props) {
  return (
    <div className="bg-amauta-bg-light flex-1">
      <div className="max-w-3xl mx-auto px-6 py-20">
        <div className="bg-white rounded-lg border border-amauta-bg-light p-10 text-center">
          <span className="inline-block bg-amauta-yellow text-amauta-dark text-xs font-bold uppercase tracking-wider px-3 py-1 rounded">
            {phase ?? "Próximamente"}
          </span>
          <h1 className="mt-4 text-3xl font-extrabold text-amauta-bordo">{title}</h1>
          <p className="mt-3 text-amauta-text-secondary">{description}</p>

          {bullets && bullets.length > 0 && (
            <ul className="mt-6 grid gap-2 text-left max-w-md mx-auto">
              {bullets.map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-2 text-sm text-amauta-text-secondary"
                >
                  <span className="text-amauta-yellow font-bold mt-0.5">✦</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link
              href="/fondos"
              className="inline-flex items-center justify-center rounded-md bg-amauta-yellow text-amauta-dark font-bold px-5 py-2 text-sm hover:bg-amauta-yellow-hover transition-colors"
            >
              Ver fondos
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-md border border-amauta-bg-light text-amauta-text-secondary font-medium px-5 py-2 text-sm hover:bg-amauta-bg-light transition-colors"
            >
              Volver al inicio
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
