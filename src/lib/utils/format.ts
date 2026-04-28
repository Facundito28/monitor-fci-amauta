/**
 * Formatters for finance-friendly display in es-AR locale.
 */

const ES_AR = "es-AR";

export function fmtNumber(value: number | null | undefined, decimals = 2) {
  if (value == null || isNaN(value)) return "—";
  return value.toLocaleString(ES_AR, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtPercent(value: number | null | undefined, decimals = 2) {
  if (value == null || isNaN(value)) return "—";
  return `${fmtNumber(value, decimals)}%`;
}

export function fmtCurrency(
  value: number | null | undefined,
  currency = "ARS",
  decimals = 2,
) {
  if (value == null || isNaN(value)) return "—";
  return value.toLocaleString(ES_AR, {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtCompactCurrency(
  value: number | null | undefined,
  currency = "ARS",
) {
  if (value == null || isNaN(value)) return "—";
  return value.toLocaleString(ES_AR, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

/**
 * Format a return/TNA value as a signed percentage.
 * Returns { text, colorClass, isOutlier } for use in JSX.
 *
 * outlierThreshold: if |value| exceeds this, the value is flagged as a
 * probable data artefact (VCP correction / distribution event) with amber
 * colouring and a ⚠ suffix. Suggested thresholds: 1D→5, 30D→35, 1A→150.
 */
export function fmtReturn(
  value: number | null | undefined,
  decimals = 2,
  outlierThreshold?: number,
): { text: string; colorClass: string; isOutlier: boolean } {
  if (value == null || isNaN(value)) {
    return { text: "—", colorClass: "text-amauta-text-tertiary", isOutlier: false };
  }
  const isOutlier = outlierThreshold != null && Math.abs(value) > outlierThreshold;
  const sign = value >= 0 ? "+" : "";
  const base = `${sign}${fmtNumber(value, decimals)}%`;
  const text = isOutlier ? `${base} ⚠` : base;
  const colorClass = isOutlier
    ? "text-amber-500 font-semibold"
    : value > 0
      ? "text-emerald-600 font-semibold"
      : value < 0
        ? "text-red-600 font-semibold"
        : "text-amauta-text-secondary";
  return { text, colorClass, isOutlier };
}
