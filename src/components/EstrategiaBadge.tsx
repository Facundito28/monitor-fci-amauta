/**
 * Badge color-coded por estrategia, reutilizable en /fondos, /fondo/[key],
 * /rankings, /comparar y el PDF (con un fallback styled-text).
 *
 * BLOQUE 6: el badge puede llevar un mini-indicador de confianza al lado
 * (alta = verde, media = amarillo, baja = naranja, macro = gris, override
 * = azul). Permite al asesor ver de un vistazo cuándo la etiqueta es
 * indubitable y cuándo es solo macro fallback.
 *
 * Standard buckets (Money Market, RF ARS, RF USD, RV, Mixta, Otros) tienen
 * un color fijo. Valores custom (de overrides en Supabase) caen al color
 * "rose" para distinguirlos visualmente.
 */
import type { Confianza } from "@/lib/fondos/estrategia";

const ESTRATEGIA_BADGE: Record<string, string> = {
  "Money Market":    "bg-emerald-100 text-emerald-700",
  "Lecaps":          "bg-blue-100 text-blue-700",
  "CER":             "bg-purple-100 text-purple-700",
  "Dólar Linked":    "bg-amber-100 text-amber-700",
  "Hard USD":        "bg-cyan-100 text-cyan-700",
  "Renta Fija ARS":  "bg-yellow-100 text-yellow-700",
  "Renta Fija USD":  "bg-indigo-100 text-indigo-700",
  "Renta Variable":  "bg-orange-100 text-orange-700",
  "Renta Mixta":     "bg-teal-100 text-teal-700",
  "Otros":           "bg-slate-100 text-slate-700",
};

const CONFIANZA_DOT: Record<Confianza, { cls: string; label: string }> = {
  override: { cls: "bg-blue-500",    label: "Override manual de Amauta" },
  alta:     { cls: "bg-emerald-500", label: "Mandate confirmado — concentración ≥80% sostenida o categoría CAFCI MM/RV/Mixta" },
  media:    { cls: "bg-amber-400",   label: "Tactical con tilt fuerte — sesgo 50-79% en un bucket, puede rotar" },
  baja:     { cls: "bg-orange-500",  label: "Tactical sin tilt claro — cartera diversificada, clasificación macro genérica" },
  macro:    { cls: "bg-slate-400",   label: "Sin composición pública — clasificación solo macro" },
};

export function EstrategiaBadge({
  value,
  confianza,
  showDot = true,
  className = "",
}: {
  value: string;
  /** Si se omite, no se muestra el dot. */
  confianza?: Confianza;
  /** Permite ocultar el dot explícitamente (útil en celdas muy densas). */
  showDot?: boolean;
  className?: string;
}) {
  const cls = ESTRATEGIA_BADGE[value] ?? "bg-rose-100 text-rose-700";
  const dot = confianza && showDot ? CONFIANZA_DOT[confianza] : null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-extrabold px-2 py-0.5 rounded-xs whitespace-nowrap ${cls} ${className}`}
    >
      {dot && (
        <span
          className={`inline-block w-2 h-2 rounded-full ${dot.cls}`}
          aria-label={dot.label}
          title={dot.label}
        />
      )}
      {value}
    </span>
  );
}

/**
 * Pill standalone para mostrar el nivel de confianza con label.
 * Usado en la ficha del fondo donde queremos ser explícitos.
 */
export function ConfianzaPill({
  confianza,
  className = "",
}: {
  confianza: Confianza;
  className?: string;
}) {
  const cfg = CONFIANZA_DOT[confianza];
  const labelText: Record<Confianza, string> = {
    override: "Override manual",
    alta: "Mandate",
    media: "Tactical · tilt fuerte",
    baja: "Tactical · diversificado",
    macro: "Solo macro",
  };
  const pillBg: Record<Confianza, string> = {
    override: "bg-blue-50 text-blue-700 border-blue-200",
    alta:     "bg-emerald-50 text-emerald-700 border-emerald-200",
    media:    "bg-amber-50 text-amber-800 border-amber-200",
    baja:     "bg-orange-50 text-orange-700 border-orange-200",
    macro:    "bg-slate-50 text-slate-600 border-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-xs border ${pillBg[confianza]} ${className}`}
      title={cfg.label}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${cfg.cls}`} aria-hidden />
      {labelText[confianza]}
    </span>
  );
}
