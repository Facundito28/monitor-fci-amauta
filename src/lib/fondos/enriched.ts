/**
 * Maps CAFCI's daily spreadsheet rows to the shape the UI expects.
 *
 * Public API (kept stable so pages don't need to change every time we
 * swap data sources):
 *   getMarketSnapshot()            — full daily snapshot.
 *   getMarketSnapshotWithReturns() — alias, kept for caller intent.
 *   fmtDateAr(iso)                 — DD/MM/YYYY.
 *
 * Notes on returns:
 *   CAFCI's spreadsheet pre-computes 1D, MTD (since end of last month),
 *   YTD, and 13-month returns. We expose those as ret1d / retMTD / ytd /
 *   ret13m. We do NOT have rolling 7-day, 30-day or true 1-year — those
 *   would require a daily VCP series we don't yet snapshot ourselves.
 *   For UI continuity, ret30d uses retMTD (close enough for the listing)
 *   and ret1a uses ret13m.
 */
import {
  cafciDateToIso,
  fetchCafciSnapshot,
  fondoBaseName,
} from "./client";
import type { CafciSheetRow } from "./client";

export interface EnrichedRow {
  /** URL-safe key — same as the displayName. */
  key: string;
  /** Display name including " - Clase X" suffix when applicable. */
  displayName: string;
  /** Underlying fondo name without class suffix. */
  baseName: string;

  /** Capitalised macro category, e.g. "Money Market", "Renta Fija". */
  categoria: string | null;
  /** Detailed CAFCI category, e.g. "Renta Variable Peso Argentina". */
  categoriaDetallada: string | null;
  /** Sociedad gerente. */
  gestora: string | null;
  /** Sociedad depositaria (banco custodio). */
  depositaria: string | null;
  /** "Corto Plazo" / "Mediano Plazo" / "Largo Plazo". */
  horizonte: string | null;
  /** "Pesos" | "USD". */
  moneda: string | null;
  /** Region label, e.g. "Argentina", "Mercosur". */
  region: string | null;

  /** ISO YYYY-MM-DD of this row's data. */
  fecha: string;
  /** Valor cuotaparte. */
  vcp: number;
  /** Valor cuotaparte ayer (used to display variations). */
  vcpAyer: number | null;
  /** Cantidad de cuotapartes. */
  ccp: number | null;
  /** AUM in fund's currency. */
  patrimonio: number | null;

  /** Daily return (%). */
  ret1d: number | null;
  /** Month-to-date return (%) — since end of last calendar month. */
  retMTD: number | null;
  /** Same as retMTD; exposed under ret30d for UI continuity. */
  ret30d: number | null;
  /** Year-to-date return (%). */
  ytd: number | null;
  /** 13-month return (%) — CAFCI's "interanual" proxy. */
  ret13m: number | null;
  /** Same as ret13m; exposed under ret1a for UI continuity. */
  ret1a: number | null;
  /** TNA computed from 1D return (%). */
  tna1d: number | null;
  /** TNA computed from MTD return (%) — annualised over 30 days. */
  tna30d: number | null;
  /** TNA computed from 13-month return (%) — annualised over 395 days. */
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

  /** Credit rating, e.g. "A", "AAA". */
  calificacion: string | null;
  /** CNV registration code. */
  codigoCnv: string | null;
  /** CAFCI internal fund id. */
  codigoCafci: number | null;
}

export interface MarketSnapshot {
  fecha: string;
  rows: EnrichedRow[];
  categorias: string[];
  gestoras: string[];
  monedas: string[];
  aumTotal: number;
  /** Always true — CAFCI bundles returns in the daily sheet. */
  hasReturns: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Group CAFCI's granular categories under a small set of macro buckets so
 * the UI filter dropdown stays usable. Anything we don't recognise falls
 * back to a Title-Cased version of the granular label.
 */
function macroFromGranular(granular: string | null): string | null {
  if (!granular) return null;
  const g = granular.toLowerCase();
  if (g.includes("mercado de dinero") || g.includes("money market"))
    return "Money Market";
  if (g.includes("renta fija")) return "Renta Fija";
  if (g.includes("renta mixta")) return "Renta Mixta";
  if (g.includes("renta variable")) return "Renta Variable";
  if (g.includes("infraestructura")) return "Infraestructura";
  if (g.includes("pyme")) return "PyMEs";
  if (g.includes("retorno total")) return "Retorno Total";
  if (g.includes("etf") || g.includes("cedear")) return "ETF/Cedears";
  // Fallback: Title-case.
  return granular
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function horizonteLabel(code: string | null): string | null {
  if (!code) return null;
  const c = code.toLowerCase();
  if (c.startsWith("cor")) return "Corto Plazo";
  if (c.startsWith("med")) return "Mediano Plazo";
  if (c.startsWith("lar")) return "Largo Plazo";
  return null;
}

function monedaLabel(code: string | null): string | null {
  if (!code) return null;
  const c = code.toUpperCase();
  if (c === "ARS" || c === "PESOS") return "Pesos";
  if (c === "USD") return "USD";
  return c;
}

function regionLabel(code: string | null): string | null {
  if (!code) return null;
  const c = code.toLowerCase();
  if (c.startsWith("arg")) return "Argentina";
  if (c.startsWith("mer") || c.startsWith("mun")) return "Mercosur";
  if (c.startsWith("br")) return "Brasil";
  if (c.startsWith("lat")) return "Latam";
  if (c.startsWith("glo")) return "Global";
  return code;
}

function annualise(retPct: number | null, days: number): number | null {
  if (retPct == null) return null;
  return retPct * (365 / days);
}

function buildRow(r: CafciSheetRow): EnrichedRow {
  const fecha = cafciDateToIso(r.fechaDDMMYY);
  const ret1d = r.varDia;
  const retMTD = r.varMes;
  const ret13m = r.var13M;
  return {
    key: r.fondo,
    displayName: r.fondo,
    baseName: fondoBaseName(r.fondo),
    categoria: macroFromGranular(r.categoriaDetallada),
    categoriaDetallada: r.categoriaDetallada,
    gestora: r.sociedadGerente,
    depositaria: r.sociedadDepositaria,
    horizonte: horizonteLabel(r.horizonte),
    moneda: monedaLabel(r.moneda),
    region: regionLabel(r.region),
    fecha,
    vcp: r.vcp,
    vcpAyer: r.vcpAyer,
    ccp: r.ccp,
    patrimonio: r.patrimonio,
    ret1d,
    retMTD,
    ret30d: retMTD,
    ytd: r.varYTD,
    ret13m,
    ret1a: ret13m,
    tna1d: annualise(ret1d, 1),
    tna30d: annualise(retMTD, 30),
    tna1a: annualise(ret13m, 395),
    feeGestion: r.honorariosGerente,
    feeDepositaria: r.honorariosDepositaria,
    comIngreso: r.comIngreso,
    comRescate: r.comRescate,
    honExito: r.honorariosExito,
    plazoRescate: r.plazoLiq,
    calificacion: r.calificacion,
    codigoCnv: r.codigoCnv,
    codigoCafci: r.codigoCafci,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

async function _buildSnapshot(): Promise<MarketSnapshot> {
  const sheet = await fetchCafciSnapshot();

  const rows: EnrichedRow[] = [];
  const categoriasSet = new Set<string>();
  const gestorasSet = new Set<string>();
  const monedasSet = new Set<string>();
  let aumTotal = 0;
  let fecha = "";

  for (const r of sheet) {
    const row = buildRow(r);
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

export async function getMarketSnapshot(): Promise<MarketSnapshot> {
  return _buildSnapshot();
}

/** Same as getMarketSnapshot — kept for caller intent. */
export async function getMarketSnapshotWithReturns(): Promise<MarketSnapshot> {
  return _buildSnapshot();
}

/** Format ISO date as DD/MM/YYYY for es-AR display. */
export function fmtDateAr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
