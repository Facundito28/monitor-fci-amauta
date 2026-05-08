/**
 * Badge color-coded por estrategia, reutilizable en /fondos, /fondo/[key],
 * /rankings, /comparar y el PDF (con un fallback styled-text).
 *
 * Standard buckets (Money Market, RF ARS, RF USD, RV, Mixta, Otros) tienen
 * un color fijo. Valores custom (de overrides en Supabase) caen al color
 * "rose" para distinguirlos visualmente.
 */

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

export function EstrategiaBadge({
  value,
  className = "",
}: {
  value: string;
  className?: string;
}) {
  const cls = ESTRATEGIA_BADGE[value] ?? "bg-rose-100 text-rose-700";
  return (
    <span
      className={`inline-block text-xs font-bold px-2 py-0.5 rounded whitespace-nowrap ${cls} ${className}`}
    >
      {value}
    </span>
  );
}
