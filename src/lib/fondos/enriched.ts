/**
 * Maps fonditos.ar API responses to the shape the UI expects.
 *
 * Public API:
 *   getMarketSnapshot()            — fast snapshot (home, comparar).
 *   getMarketSnapshotWithReturns() — same snapshot (returns are bundled in
 *                                    the bulk response, so this is a thin
 *                                    alias kept for caller clarity).
 *   getFondoDetalle(displayName)   — single-fund ficha with vol / sharpe /
 *                                    7-day return for the detail page.
 *   getReturnInRange(...)          — server-calculated return between two
 *                                    dates, for the "rendimiento custom".
 *   fmtDateAr(iso)                 — DD/MM/YYYY.
 */
import {
  fetchFundDetail,
  fetchFunds,
  fetchReturnRange,
  fondoBaseName,
} from "./client";
import type { FonditosFund, FonditosFundDetail } from "./types";

export interface EnrichedRow {
  /** URL-safe key — same as the displayName (CAFCI/fonditos uses it verbatim). */
  key: string;
  /** Display name including " - Clase X" suffix when applicable. */
  displayName: string;
  /** Underlying fondo name without class suffix. */
  baseName: string;
  /** "A" | "B" | "C" | "Única" | ... */
  fundClass: string | null;

  /** Capitalised macro category, e.g. "Money Market", "Renta Fija". */
  categoria: string | null;
  /** Detailed CAFCI category, e.g. "MONEY MARKET ARS CLÁSICO". */
  categoriaDetallada: string | null;
  /** Sociedad gerente. */
  gestora: string | null;
  /** "BANK" | "INDEPENDENT" — for context badges. */
  managerType: string | null;
  /** "Corto Plazo" / "Mediano Plazo" / "Largo Plazo". */
  horizonte: string | null;
  /** "Pesos" | "USD". */
  moneda: string | null;
  /** Benchmark de la categoría (e.g. "BADLAR"). */
  benchmark: string | null;

  /** ISO YYYY-MM-DD of this row's data. */
  fecha: string;
  /** Valor cuotaparte. */
  vcp: number;
  /** Cantidad de cuotapartes. */
  ccp: number | null;
  /** AUM in fund's currency. */
  patrimonio: number | null;

  /** Simple return 1 business day (%). null = not available. */
  ret1d: number | null;
  /** Simple return ~7 calendar days (%) — populated only on the detail call. */
  ret7d: number | null;
  /** Simple return ~30 calendar days (%). */
  ret30d: number | null;
  /** Simple return ~365 calendar days (%). */
  ret1a: number | null;
  /** Year-to-date return (%). */
  ytd: number | null;
  /** TNA computed from 1D return (%). */
  tna1d: number | null;
  /** TNA computed from 30D return (%). */
  tna30d: number | null;
  /** TNA computed from 1A return (%). */
  tna1a: number | null;

  /** Annual management fee (%). */
  feeGestion: number | null;
  /** Annual depositary fee (%). */
  feeDepositaria: number | null;
  /** Subscription commission (%). */
  comIngreso: number | null;
  /** Redemption commission (%). */
  comRescate: number | null;
  /** "S" | "N" — performance fee charged. */
  honExito: string | null;
  /** Days to settle a redemption. */
  plazoRescate: number | null;

  /** Credit rating, e.g. "AAAf.ar". */
  calificacion: string | null;
}

export interface MarketSnapshot {
  fecha: string;
  rows: EnrichedRow[];
  categorias: string[];
  gestoras: string[];
  monedas: string[];
  aumTotal: number;
  /** Always true now — the bulk endpoint includes returns. */
  hasReturns: boolean;
}

export interface FondoDetalle {
  /** Volatilidad anualizada (decimal — 0.0826 = 8.26%). */
  volatilidad: number | null;
  /** Sharpe ratio (unitless). */
  sharpe: number | null;
  /** Días de histórico disponible. */
  diasHistorico: number | null;
  /** Fecha de inicio del histórico. */
  fechaInicio: string | null;
  /** Rendimiento 7d (%) — viene del endpoint /funds/detail. */
  rend7d: number | null;
  /** Rendimiento 90d (%) — viene del endpoint /funds/detail. */
  rend90d: number | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const MACRO_LABELS: Record<string, string> = {
  "MONEY MARKET": "Money Market",
  "RENTA FIJA": "Renta Fija",
  "RENTA MIXTA": "Renta Mixta",
  "RENTA VARIABLE": "Renta Variable",
  "INFRAESTRUCTURA": "Infraestructura",
  "PYMES": "PyMEs",
};

function macroLabel(macro: string | undefined): string | null {
  if (!macro) return null;
  const key = macro.trim().toUpperCase();
  if (MACRO_LABELS[key]) return MACRO_LABELS[key];
  return key
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function horizonteFromCode(code: string | undefined): string | null {
  switch (code) {
    case "COR":
      return "Corto Plazo";
    case "MED":
      return "Mediano Plazo";
    case "LAR":
      return "Largo Plazo";
    default:
      return null;
  }
}

function monedaLabel(currency: string | undefined): string | null {
  if (!currency) return null;
  if (currency === "ARS") return "Pesos";
  if (currency === "USD") return "USD";
  return currency;
}

/** Decimal fraction → percentage. 0.0173 → 1.73. */
function toPct(v: number | null | undefined): number | null {
  if (v == null || isNaN(v)) return null;
  return v * 100;
}

function annualise(retPct: number | null, days: number): number | null {
  if (retPct == null) return null;
  return retPct * (365 / days);
}

function buildEnrichedRow(f: FonditosFund): EnrichedRow {
  const ret1d = toPct(f.dailyReturn);
  const ret30d = toPct(f.monthlyReturn);
  const ret1a = toPct(f.oneYearReturn);

  return {
    key: f.name,
    displayName: f.name,
    baseName: fondoBaseName(f.name),
    fundClass: f.fundClass ?? null,
    categoria: macroLabel(f.macroCategory),
    categoriaDetallada: f.category ?? null,
    gestora: f.manager ?? null,
    managerType: f.managerType ?? null,
    horizonte: horizonteFromCode(f.horizon),
    moneda: monedaLabel(f.currency),
    benchmark: f.benchmark ?? null,
    fecha: f.date,
    vcp: f.lastPrice,
    ccp: typeof f.shareQuantity === "number" ? f.shareQuantity : null,
    patrimonio: typeof f.aumARS === "number" ? f.aumARS : (f.aum ?? null),
    ret1d,
    ret7d: null,
    ret30d,
    ret1a,
    ytd: toPct(f.ytdReturn),
    tna1d: f.tna ?? annualise(ret1d, 1),
    tna30d: annualise(ret30d, 30),
    tna1a: annualise(ret1a, 365),
    feeGestion: f.feeGestion,
    feeDepositaria: f.feeDepositaria,
    comIngreso: f.comIngreso,
    comRescate: f.comRescate,
    honExito: f.honExito,
    plazoRescate: f.plazoRescate,
    calificacion: f.calificacion,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

async function _buildSnapshot(): Promise<MarketSnapshot> {
  const funds = await fetchFunds();

  const rows: EnrichedRow[] = [];
  const categoriasSet = new Set<string>();
  const gestorasSet = new Set<string>();
  const monedasSet = new Set<string>();
  let aumTotal = 0;
  let fecha = "";

  for (const f of funds) {
    const row = buildEnrichedRow(f);
    if (row.categoria) categoriasSet.add(row.categoria);
    if (row.gestora) gestorasSet.add(row.gestora);
    if (row.moneda) monedasSet.add(row.moneda);
    if (row.patrimonio) aumTotal += row.patrimonio;
    if (!fecha) fecha = row.fecha;
    rows.push(row);
  }

  return {
    fecha,
    rows,
    categorias: Array.from(categoriasSet).sort(),
    gestoras: Array.from(gestorasSet).sort(),
    monedas: Array.from(monedasSet).sort(),
    aumTotal,
    hasReturns: true,
  };
}

/** Snapshot for home / comparar — includes returns since fonditos bundles them. */
export async function getMarketSnapshot(): Promise<MarketSnapshot> {
  return _buildSnapshot();
}

/** Same as getMarketSnapshot — kept for caller intent. */
export async function getMarketSnapshotWithReturns(): Promise<MarketSnapshot> {
  return _buildSnapshot();
}

/**
 * Fetch the full ficha (vol, sharpe, 7d / 90d returns, fechaInicio) for a
 * single fund. Returns null when the fund is not found or the API errors.
 */
export async function getFondoDetalle(
  displayName: string,
): Promise<FondoDetalle | null> {
  let detail: FonditosFundDetail;
  try {
    detail = await fetchFundDetail(displayName);
  } catch {
    return null;
  }
  if (!detail?.metricas) return null;
  return {
    volatilidad: detail.metricas.volatilidad,
    sharpe: detail.metricas.sharpe,
    diasHistorico: detail.metricas.dias_historico,
    fechaInicio: detail.metricas.fecha_inicio,
    rend7d: detail.metricas.rend_7d,
    rend90d: detail.metricas.rend_90d,
  };
}

/**
 * Compute the return between two dates for a single fund, using the
 * fonditos /funds/returns endpoint. Returns null on failure or empty data.
 */
export async function getReturnInRange(
  displayName: string,
  from: string,
  to: string,
): Promise<{
  vcpFrom: number;
  vcpTo: number;
  fechaFrom: string;
  fechaTo: string;
  retPct: number;
  tnaPct: number;
  dias: number;
} | null> {
  const row = await fetchReturnRange(displayName, from, to).catch(() => null);
  if (!row) return null;
  return {
    vcpFrom: row.vcp_from,
    vcpTo: row.vcp_to,
    fechaFrom: row.fecha_from,
    fechaTo: row.fecha_to,
    retPct: row.return_pct,
    tnaPct: row.tna_pct,
    dias: row.dias,
  };
}

/** Format ISO date as DD/MM/YYYY for es-AR display. */
export function fmtDateAr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
