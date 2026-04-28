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
 * Returns { text, colorClass } for use in JSX.
 */
export function fmtReturn(
  value: number | null | undefined,
  decimals = 2,
): { text: string; colorClass: string } {
  if (value == null || isNaN(value)) {
    return { text: "—", colorClass: "text-amauta-text-tertiary" };
  }
  const sign = value >= 0 ? "+" : "";
  const text = `${sign}${fmtNumber(value, decimals)}%`;
  const colorClass =
    value > 0
      ? "text-emerald-600 font-semibold"
      : value < 0
        ? "text-red-600 font-semibold"
        : "text-amauta-text-secondary";
  return { text, colorClass };
}
