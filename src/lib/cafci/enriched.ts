/**
 * Joins the static fondo catalog with the latest daily snapshot to produce
 * a single enriched row per fund class — the unit our UI works with.
 *
 * getMarketSnapshot()            → fast, no returns (home, comparar).
 * getMarketSnapshotWithReturns() → full, with 1D/7D/30D/1A TNA (fondos, rankings).
 */
import {
  buildVcpMapForDate,
  fondoBaseName,
  getAllStatsByDate,
  getFondoFicha,
  getFondosActivos,
  getGestoraMap,
  getLatestBusinessDate,
  getTiposRenta,
  subtractDays,
} from "./client";
import type { CartHolding, DailyStatRow, FichaData, Fondo } from "./types";

export type { CartHolding, FichaData };

export interface EnrichedRow {
  /** Unique key = CAFCI display name. */
  key: string;
  /** Display name (may include " - Clase A" suffix). */
  displayName: string;
  /** Underlying fondo name without class suffix. */
  baseName: string;
  /** Parent fondo id (string), null if no match found. */
  fondoId: string | null;
  /**
   * CAFCI clase id — from clase_fondos[] lookup.
   * Required together with fondoId to call /fondo/{fondoId}/clase/{claseId}/ficha.
   */
  claseId: string | null;
  /** tipoRentaId — kept for category-level queries. */
  tipoRentaId: string | null;
  /** Category name like "Renta Fija", "Mercado de Dinero". */
  categoria: string | null;
  /** Sociedad gerente short name. */
  gestora: string | null;
  /** "Corto Plazo" / "Mediano Plazo" / "Largo Plazo". */
  horizonte: string | null;
  /** ISO YYYY-MM-DD of this row's data. */
  fecha: string;
  /** Valor cuotaparte. */
  vcp: number;
  /** Cantidad de cuotapartes. */
  ccp: number | null;
  /** AUM in pesos. */
  patrimonio: number | null;

  // ── Rendimientos ────────────────────────────────────────────────────
  /** Simple return 1 business day (%). null = prior data unavailable. */
  ret1d: number | null;
  /** Simple return ~7 calendar days (%). */
  ret7d: number | null;
  /** Simple return ~30 calendar days (%). */
  ret30d: number | null;
  /** Simple return ~365 calendar days (%). */
  ret1a: number | null;
  /** TNA annualised from 1D (%). */
  tna1d: number | null;
  /** TNA annualised from 30D (%). */
  tna30d: number | null;
  /** TNA annualised from 1A (%). */
  tna1a: number | null;
}

export interface MarketSnapshot {
  fecha: string;
  rows: EnrichedRow[];
  categorias: string[];
  gestoras: string[];
  aumTotal: number;
  /** True when return columns (ret*, tna*) have been populated. */
  hasReturns: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function computeReturn(vcpNow: number, vcpThen: number | undefined): number | null {
  if (!vcpThen || vcpThen === 0) return null;
  return ((vcpNow / vcpThen) - 1) * 100;
}

function annualise(ret: number | null, days: number): number | null {
  if (ret == null) return null;
  return ret * (365 / days);
}

function buildEnrichedRow(
  stat: DailyStatRow,
  fecha: string,
  fondosByLowerName: Map<string, Fondo>,
  gestoraMap: Map<string, string>,
  vcpD1: Map<string, number> | null,
  vcpD7: Map<string, number> | null,
  vcpD30: Map<string, number> | null,
  vcpD365: Map<string, number> | null,
): EnrichedRow {
  const baseName = fondoBaseName(stat.fondo);
  const parent = fondosByLowerName.get(baseName.toLowerCase().trim());
  const categoria =
    parent?.tipoRenta?.nombre ?? parent?.clasificacionVieja ?? null;
  const gestora = parent?.sociedadGerenteId
    ? gestoraMap.get(String(parent.sociedadGerenteId)) ?? null
    : null;
  const horizonte =
    parent?.horizonteViejo ?? horizonteFromCode(stat.horizonte);
  const patrimonio = typeof stat.patrimonio === "number" ? stat.patrimonio : null;
  const ccp = typeof stat.ccp === "number" ? stat.ccp : null;

  // Resolve the CAFCI class ID by matching the display name against clase_fondos[].nombre.
  // CAFCI daily stats use the same display name as clase_fondos[].nombre.
  const statNameLower = stat.fondo.toLowerCase().trim();
  const claseId =
    parent?.clase_fondos?.find(
      (c) => c.nombre.toLowerCase().trim() === statNameLower,
    )?.id ?? null;

  const key = stat.fondo;
  const vcpNow = stat.vcp;

  const ret1d = vcpD1 ? computeReturn(vcpNow, vcpD1.get(key)) : null;
  const ret7d = vcpD7 ? computeReturn(vcpNow, vcpD7.get(key)) : null;
  const ret30d = vcpD30 ? computeReturn(vcpNow, vcpD30.get(key)) : null;
  const ret1a = vcpD365 ? computeReturn(vcpNow, vcpD365.get(key)) : null;

  return {
    key,
    displayName: stat.fondo,
    baseName,
    fondoId: parent?.id ?? null,
    claseId,
    tipoRentaId: parent?.tipoRentaId ?? null,
    categoria,
    gestora,
    horizonte,
    fecha,
    vcp: vcpNow,
    ccp,
    patrimonio,
    ret1d,
    ret7d,
    ret30d,
    ret1a,
    tna1d: annualise(ret1d, 1),
    tna30d: annualise(ret30d, 30),
    tna1a: annualise(ret1a, 365),
  };
}

// ─── Core snapshot builder ───────────────────────────────────────────────────

async function _buildSnapshot(withReturns: boolean): Promise<MarketSnapshot> {
  const [fondos, gestoraMap, tipos, latestFecha] = await Promise.all([
    getFondosActivos(),
    getGestoraMap(),
    getTiposRenta(),
    getLatestBusinessDate(),
  ]);

  const d1 = subtractDays(latestFecha, 1);
  const d7 = subtractDays(latestFecha, 7);
  const d30 = subtractDays(latestFecha, 30);
  const d365 = subtractDays(latestFecha, 365);

  const nullMap = Promise.resolve(null as Map<string, number> | null);

  const [todayStats, vcpD1, vcpD7, vcpD30, vcpD365] = await Promise.all([
    getAllStatsByDate(tipos, latestFecha),
    withReturns ? buildVcpMapForDate(tipos, d1) : nullMap,
    withReturns ? buildVcpMapForDate(tipos, d7) : nullMap,
    withReturns ? buildVcpMapForDate(tipos, d30) : nullMap,
    withReturns ? buildVcpMapForDate(tipos, d365) : nullMap,
  ]);

  const fondosByLowerName = new Map<string, Fondo>();
  for (const f of fondos) {
    if (f.nombre) fondosByLowerName.set(f.nombre.toLowerCase().trim(), f);
  }

  const rows: EnrichedRow[] = [];
  const categoriasSet = new Set<string>();
  const gestorasSet = new Set<string>();
  let aumTotal = 0;

  for (const stat of todayStats) {
    const row = buildEnrichedRow(
      stat,
      latestFecha,
      fondosByLowerName,
      gestoraMap,
      vcpD1,
      vcpD7,
      vcpD30,
      vcpD365,
    );
    if (row.categoria) categoriasSet.add(row.categoria);
    if (row.gestora) gestorasSet.add(row.gestora);
    if (row.patrimonio) aumTotal += row.patrimonio;
    rows.push(row);
  }

  return {
    fecha: latestFecha,
    rows,
    categorias: Array.from(categoriasSet).sort(),
    gestoras: Array.from(gestorasSet).sort(),
    aumTotal,
    hasReturns: withReturns,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Fast snapshot — no return computation. Used in home + comparar. */
export async function getMarketSnapshot(): Promise<MarketSnapshot> {
  return _buildSnapshot(false);
}

/**
 * Full snapshot WITH return computation (1D, 7D, 30D, 1A).
 * Fetches prior-date VCP data in parallel; adds ~1–2 s latency.
 * Used in /fondos and /rankings.
 */
export async function getMarketSnapshotWithReturns(): Promise<MarketSnapshot> {
  return _buildSnapshot(true);
}

/**
 * Fetch the full ficha (rendimientos + composicion + fees) for a fund class.
 * Uses the official CAFCI endpoint: GET /fondo/{fondoId}/clase/{claseId}/ficha
 *
 * Returns null if fondoId or claseId are unavailable, or the API fails.
 */
export async function getFondoFichaData(
  fondoId: string | null,
  claseId: string | null,
): Promise<FichaData | null> {
  if (!fondoId || !claseId) return null;
  return getFondoFicha(fondoId, claseId);
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

/** Format ISO date as DD/MM/YYYY for es-AR display. */
export function fmtDateAr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
