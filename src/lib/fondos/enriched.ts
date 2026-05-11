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
import {
  applyEstrategia,
  loadEstrategiaOverrides,
  sortEstrategias,
  type CartHolding,
  type Estrategia,
} from "./estrategia";
import { publicClient } from "@/lib/supabase/server";

export type { CartHolding, Estrategia } from "./estrategia";

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
  /** CAFCI internal fund id (clase). */
  codigoCafci: number | null;
  /** CAFCI parent fondo id (resolved via fci_fondo_meta). null si no hay match. */
  fondoId: number | null;

  /**
   * Estrategia inferida. Computed from (a) override manual en Supabase, sino
   * (b) inferencia por holdings de cartera si están disponibles, sino
   * (c) fallback al macro-bucket por categoría + moneda.
   */
  estrategia: Estrategia;

  /**
   * Composición de cartera (top N holdings, ordenados por share desc).
   * Vacía si todavía no se scrapeo este fondo. Cada `tipo_activo` viene de
   * cartera-client.ts:classifyActivo.
   */
  cartera: CartHolding[];
}

export interface MarketSnapshot {
  fecha: string;
  rows: EnrichedRow[];
  categorias: string[];
  gestoras: string[];
  monedas: string[];
  /** Estrategias presentes en este snapshot (sorted by ESTRATEGIAS canonical order). */
  estrategias: Estrategia[];
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

function buildRow(
  r: CafciSheetRow,
  overrides: Map<number, Estrategia>,
  fondoId: number | null,
  cartera: CartHolding[],
): EnrichedRow {
  const fecha = cafciDateToIso(r.fechaDDMMYY);
  const ret1d = r.varDia;
  const retMTD = r.varMes;
  const ret13m = r.var13M;
  const categoria = macroFromGranular(r.categoriaDetallada);
  const moneda = monedaLabel(r.moneda);
  const estrategia = applyEstrategia(
    {
      fondo: r.fondo,
      categoria,
      moneda,
      codigoCafci: r.codigoCafci,
    },
    overrides,
    cartera,
  );
  return {
    key: r.fondo,
    displayName: r.fondo,
    baseName: fondoBaseName(r.fondo),
    categoria,
    categoriaDetallada: r.categoriaDetallada,
    gestora: r.sociedadGerente,
    depositaria: r.sociedadDepositaria,
    horizonte: horizonteLabel(r.horizonte),
    moneda,
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
    fondoId,
    estrategia,
    cartera,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

// ─── Supabase loaders for cartera + meta (cached 6h) ────────────────────────

interface CarteraStore {
  /** codigo_cafci_clase → fondo_id padre. */
  claseToFondo: Map<number, number>;
  /** fondo_id → top holdings ordenados por share desc. */
  holdingsByFondo: Map<number, CartHolding[]>;
}

let carteraCache: { data: CarteraStore; expiresAt: number } | null = null;
let carteraInflight: Promise<CarteraStore> | null = null;
const CARTERA_TTL_MS = 6 * 60 * 60 * 1_000;

async function loadCarteraStore(): Promise<CarteraStore> {
  const now = Date.now();
  if (carteraCache && carteraCache.expiresAt > now) return carteraCache.data;
  if (carteraInflight) return carteraInflight;

  carteraInflight = (async () => {
    const empty: CarteraStore = {
      claseToFondo: new Map(),
      holdingsByFondo: new Map(),
    };
    try {
      const supa = publicClient();

      // 1) clase → fondo mapping (paginated; ~4566 rows). Single shot is enough
      // (default Supabase row cap is high enough for one full table read here).
      const claseToFondo = new Map<number, number>();
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supa
          .from("fci_fondo_meta")
          .select("codigo_cafci_clase, fondo_id")
          .order("codigo_cafci_clase", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) {
          console.error("[carteraStore] fondo_meta fetch error:", error.message);
          break;
        }
        if (!data || data.length === 0) break;
        for (const r of data) {
          if (
            typeof r.codigo_cafci_clase === "number" &&
            typeof r.fondo_id === "number"
          ) {
            claseToFondo.set(r.codigo_cafci_clase, r.fondo_id);
          }
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }

      // 2) Latest cartera per fondo. We grab everything for the most recent
      // fecha_snapshot; ~5000-15000 rows total depending on top-N.
      const latestRes = await supa
        .from("fci_cartera")
        .select("fecha_snapshot")
        .order("fecha_snapshot", { ascending: false })
        .limit(1)
        .maybeSingle();
      const latestFecha = latestRes.data?.fecha_snapshot;

      const holdingsByFondo = new Map<number, CartHolding[]>();
      if (latestFecha) {
        let cFrom = 0;
        while (true) {
          const { data, error } = await supa
            .from("fci_cartera")
            .select("fondo_id, rank, activo, tipo_activo, share")
            .eq("fecha_snapshot", latestFecha)
            .order("fondo_id", { ascending: true })
            .order("rank", { ascending: true })
            .range(cFrom, cFrom + PAGE - 1);
          if (error) {
            console.error("[carteraStore] cartera fetch error:", error.message);
            break;
          }
          if (!data || data.length === 0) break;
          for (const r of data) {
            if (typeof r.fondo_id !== "number") continue;
            // Skip sentinel rows (rank=0) inserted by the cron to mark
            // "this fondo was attempted but had no published cartera". They
            // exist purely to prevent the cron from re-attempting forever.
            const rank = typeof r.rank === "number" ? r.rank : 0;
            if (rank === 0) continue;
            if (!holdingsByFondo.has(r.fondo_id)) {
              holdingsByFondo.set(r.fondo_id, []);
            }
            holdingsByFondo.get(r.fondo_id)!.push({
              rank,
              activo: r.activo ?? "",
              tipo_activo: r.tipo_activo ?? "Otros",
              share: typeof r.share === "number" ? r.share : 0,
            });
          }
          if (data.length < PAGE) break;
          cFrom += PAGE;
        }
      }

      const result: CarteraStore = { claseToFondo, holdingsByFondo };
      carteraCache = { data: result, expiresAt: Date.now() + CARTERA_TTL_MS };
      return result;
    } catch (e) {
      // Supabase env vars missing or network down — degrade silently.
      console.error("[carteraStore] init failed:", e);
      return empty;
    } finally {
      carteraInflight = null;
    }
  })();
  return carteraInflight;
}

async function _buildSnapshot(): Promise<MarketSnapshot> {
  // Fire all loaders in parallel — sheet download dominates latency.
  const [sheet, overrides, carteraStore] = await Promise.all([
    fetchCafciSnapshot(),
    loadEstrategiaOverrides(),
    loadCarteraStore(),
  ]);

  const rows: EnrichedRow[] = [];
  const categoriasSet = new Set<string>();
  const gestorasSet = new Set<string>();
  const monedasSet = new Set<string>();
  const estrategiasSet = new Set<Estrategia>();
  let aumTotal = 0;
  let fecha = "";

  for (const r of sheet) {
    const fondoId =
      r.codigoCafci != null
        ? carteraStore.claseToFondo.get(r.codigoCafci) ?? null
        : null;
    const holdings = fondoId != null
      ? carteraStore.holdingsByFondo.get(fondoId) ?? []
      : [];
    const row = buildRow(r, overrides, fondoId, holdings);
    if (row.categoria) categoriasSet.add(row.categoria);
    if (row.gestora) gestorasSet.add(row.gestora);
    if (row.moneda) monedasSet.add(row.moneda);
    estrategiasSet.add(row.estrategia);
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
    estrategias: sortEstrategias(estrategiasSet),
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
