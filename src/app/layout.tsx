import type { Metadata } from "next";
import { Fira_Sans } from "next/font/google";
import Link from "next/link";
import Image from "next/image";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const firaSans = Fira_Sans({
  variable: "--font-fira-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700", "800"],
});

export const metadata: Metadata = {
  title: "Monitor FCIs | Amauta Inversiones",
  description:
    "Plataforma de consulta y comparación de Fondos Comunes de Inversión argentinos. Datos diarios de CAFCI con análisis profesional de Amauta Inversiones Financieras.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es-AR"
      className={`${firaSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-amauta-text">
        <Header />
        <main className="flex-1 flex flex-col">{children}</main>
        <Footer />
        <SpeedInsights />
      </body>
    </html>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-amauta-bg-light shadow-[0_1px_0_0_rgba(0,0,0,0.04)]">
      {/* Top accent rule — yellow brand bar */}
      <div className="h-[3px] bg-amauta-yellow" aria-hidden />

      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <Image
            src="/logo_amauta.png"
            alt="Amauta Inversiones"
            width={40}
            height={40}
            className="h-10 w-auto"
            priority
          />
          <span className="hidden sm:flex flex-col leading-none">
            <span className="text-[11px] uppercase tracking-[0.18em] text-amauta-text-secondary font-medium">
              Amauta Inversiones
            </span>
            <span className="text-base font-extrabold text-amauta-bordo group-hover:text-amauta-bordo-hover transition-colors">
              Monitor FCIs
            </span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2 text-sm font-bold">
          <NavLink href="/fondos">Fondos</NavLink>
          <NavLink href="/rankings">Rankings</NavLink>
          <NavLink
            href="/comparar"
            className="ml-1 sm:ml-2 px-4 py-2 rounded-sm bg-amauta-yellow text-amauta-dark hover:bg-amauta-yellow-hover transition-colors"
          >
            Comparar
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

function NavLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (className) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className="px-3 py-2 rounded-xs text-amauta-text hover:text-amauta-bordo transition-colors"
    >
      {children}
    </Link>
  );
}

function Footer() {
  return (
    <footer className="bg-amauta-dark text-white/80 mt-16">
      <div className="h-[3px] bg-amauta-yellow" aria-hidden />

      <div className="max-w-7xl mx-auto px-6 py-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-3 mb-4">
            <Image
              src="/logo_amauta.png"
              alt="Amauta Inversiones"
              width={40}
              height={40}
              className="h-10 w-auto"
            />
            <div className="flex flex-col leading-none">
              <span className="text-[11px] uppercase tracking-[0.18em] text-white/60 font-medium">
                Multifamily Office
              </span>
              <span className="text-white font-extrabold text-lg">
                Amauta Inversiones
              </span>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-white/70 max-w-md">
            Independencia, integridad, excelencia. Conocimiento para crecer.
          </p>
          <p className="mt-4 text-xs text-white/50">
            Matrícula CNV 1029 · San Miguel de Tucumán, Argentina
          </p>
        </div>

        <div>
          <h4 className="text-white font-bold mb-3 uppercase tracking-wider text-xs">
            Plataforma
          </h4>
          <ul className="space-y-2 text-sm text-white/70">
            <li><Link href="/fondos" className="hover:text-amauta-yellow transition-colors">Fondos</Link></li>
            <li><Link href="/comparar" className="hover:text-amauta-yellow transition-colors">Comparador</Link></li>
            <li><Link href="/rankings" className="hover:text-amauta-yellow transition-colors">Rankings</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-bold mb-3 uppercase tracking-wider text-xs">
            Datos & Contacto
          </h4>
          <ul className="space-y-2 text-sm text-white/70">
            <li>
              Fuente: <a href="https://www.cafci.org.ar/" target="_blank" rel="noreferrer" className="hover:text-amauta-yellow underline underline-offset-2">CAFCI</a>
            </li>
            <li>
              Web: <a href="https://amautainversiones.com/" target="_blank" rel="noreferrer" className="hover:text-amauta-yellow underline underline-offset-2">amautainversiones.com</a>
            </li>
            <li className="text-xs text-white/50">
              Actualización diaria post-cierre.
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-5 text-[11px] leading-relaxed text-white/55">
          Este material es preparado por <strong className="text-white/80">Amauta Inversiones Financieras</strong> (Matrícula CNV 1029) con fines informativos y no constituye una recomendación de inversión. Rentabilidades pasadas no garantizan resultados futuros. Datos provistos por CAFCI; verificar siempre con la fuente oficial. © {new Date().getFullYear()} Amauta Inversiones Financieras.
        </div>
      </div>
    </footer>
  );
}
