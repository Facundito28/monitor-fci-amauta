/**
 * Joins the static fondo catalog with the latest daily snapshot to produce
 * a single enriched row per fund class — the unit our UI works with.
 *
 * Each daily-stat row's `fondo` field is the CLASS display name
 * ("Fondo X - Clase A"), so we strip that suffix and look up the parent
 * fondo to recover gestora and category.
 */
import {
  fondoBaseName,
  getFondosActivos,
  getGestoraMap,
  getLatestSnapshot,
} from "./client";
import type { DailyStatRow, Fondo } from "./types";

export interface EnrichedRow {
  /** Unique key = CAFCI display name. */
  key: string;
  /** Display name (may include " - Clase A" suffix). */
  displayName: string;
  /** Underlying fondo name without class suffix. */
  baseName: string;
  /** Parent fondo id (string), null if no match found. */
  fondoId: string | null;
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
}

export interface MarketSnapshot {
  /** ISO YYYY-MM-DD of the snapshot. */
  fecha: string;
  /** All enriched per-class rows. */
  rows: EnrichedRow[];
  /** Distinct categorías present. */
  categorias: string[];
  /** Distinct gestoras present. */
  gestoras: string[];
  /** Aggregate AUM across all rows. */
  aumTotal: number;
}

/**
 * Fetches everything needed for the listings view in one shot and joins.
 * Cached at the request level (Next.js fetch dedup).
 */
export async function getMarketSnapshot(): Promise<MarketSnapshot> {
  const [snapshot, fondos, gestoraMap] = await Promise.all([
    getLatestSnapshot(),
    getFondosActivos(),
    getGestoraMap(),
  ]);

  const fondosByLowerName = new Map<string, Fondo>();
  for (const f of fondos) {
    if (f.nombre) fondosByLowerName.set(f.nombre.toLowerCase().trim(), f);
  }

  const rows: EnrichedRow[] = [];
  const categoriasSet = new Set<string>();
  const gestorasSet = new Set<string>();
  let aumTotal = 0;

  for (const stat of snapshot.rows) {
    const baseName = fondoBaseName(stat.fondo);
    const parent = fondosByLowerName.get(baseName.toLowerCase().trim());
    const categoria =
      parent?.tipoRenta?.nombre ??
      parent?.clasificacionVieja ??
      null;
    const gestora = parent?.sociedadGerenteId
      ? gestoraMap.get(String(parent.sociedadGerenteId)) ?? null
      : null;
    const horizonte = parent?.horizonteViejo ?? horizonteFromCode(stat.horizonte);

    const patrimonio =
      typeof stat.patrimonio === "number" ? stat.patrimonio : null;
    const ccp = typeof stat.ccp === "number" ? stat.ccp : null;

    if (categoria) categoriasSet.add(categoria);
    if (gestora) gestorasSet.add(gestora);
    if (patrimonio) aumTotal += patrimonio;

    rows.push({
      key: stat.fondo,
      displayName: stat.fondo,
      baseName,
      fondoId: parent?.id ?? null,
      categoria,
      gestora,
      horizonte,
      fecha: snapshot.fecha,
      vcp: stat.vcp,
      ccp,
      patrimonio,
    });
  }

  return {
    fecha: snapshot.fecha,
    rows,
    categorias: Array.from(categoriasSet).sort(),
    gestoras: Array.from(gestorasSet).sort(),
    aumTotal,
  };
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
