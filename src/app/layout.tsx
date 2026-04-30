import type { Metadata } from "next";
import { Fira_Sans } from "next/font/google";
import Link from "next/link";
import Image from "next/image";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const firaSans = Fira_Sans({
  variable: "--font-fira-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
});

export const metadata: Metadata = {
  title: "Monitor FCIs | Amauta Inversiones",
  description:
    "Plataforma de consulta y comparación de Fondos Comunes de Inversión argentinos. Datos diarios con análisis profesional de Amauta Inversiones Financieras.",
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
    <header className="bg-amauta-dark text-white">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="https://amautainversiones.com/wp-content/uploads/2025/05/logo_amauta.png"
            alt="Amauta Inversiones"
            width={40}
            height={40}
            className="h-10 w-auto"
            priority
          />
          <span className="hidden sm:inline text-lg font-extrabold tracking-tight">
            Monitor FCIs
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2 text-sm font-medium">
          <NavLink href="/fondos">Fondos</NavLink>
          <NavLink href="/comparar">Comparar</NavLink>
          <NavLink href="/rankings">Rankings</NavLink>
        </nav>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 rounded-md hover:bg-white/10 transition-colors"
    >
      {children}
    </Link>
  );
}

function Footer() {
  return (
    <footer className="bg-amauta-dark text-white/80 mt-12">
      <div className="max-w-7xl mx-auto px-6 py-8 grid gap-6 sm:grid-cols-3 text-sm">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <Image
              src="https://amautainversiones.com/wp-content/uploads/2025/05/logo_amauta.png"
              alt="Amauta Inversiones"
              width={32}
              height={32}
              className="h-8 w-auto"
            />
            <span className="text-white font-extrabold">Amauta Inversiones</span>
          </div>
          <p className="text-xs leading-relaxed">
            Independencia, integridad, excelencia. Conocimiento para crecer.
          </p>
        </div>

        <div>
          <h4 className="text-white font-bold mb-2">Secciones</h4>
          <ul className="space-y-1 text-xs">
            <li><Link href="/fondos" className="hover:text-amauta-yellow">Fondos</Link></li>
            <li><Link href="/comparar" className="hover:text-amauta-yellow">Comparador</Link></li>
            <li><Link href="/rankings" className="hover:text-amauta-yellow">Rankings</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-bold mb-2">Datos</h4>
          <p className="text-xs leading-relaxed">
            Datos de <a href="https://www.cafci.org.ar/" target="_blank" rel="noreferrer" className="hover:text-amauta-yellow underline">CAFCI</a> procesados por <a href="https://fonditos.ar/" target="_blank" rel="noreferrer" className="hover:text-amauta-yellow underline">fonditos.ar</a>. Actualización diaria post-cierre.
          </p>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 text-[11px] leading-relaxed text-white/60">
          Este material es preparado por <strong className="text-white/80">Amauta Inversiones Financieras</strong> (Matrícula CNV 1029) con fines informativos y no constituye una recomendación de inversión. Rentabilidades pasadas no garantizan resultados futuros. Datos provistos por CAFCI vía fonditos.ar; verificar siempre con la fuente oficial. © {new Date().getFullYear()} Amauta Inversiones Financieras.
        </div>
      </div>
    </footer>
  );
}
