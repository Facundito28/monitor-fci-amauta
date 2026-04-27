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
