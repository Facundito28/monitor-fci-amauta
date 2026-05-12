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
  applyEstrategiaWithConfidence,
  loadEstrategiaOverrides,
  sortEstrategias,
  type CartHolding,
  type Estrategia,
} from "./estrategia";
import { publicClient } from "@/lib/supabase/server";

export type { CartHolding, Estrategia, Confianza } from "./estrategia";

/**
 * Datos de UNA clase del fondo. Cada fondo CAFCI suele tener entre 1 y 8
 * clases (A, B, C, D, E, F, G, L) que comparten cartera, gestora, depositaria,
 * categoría y benchmark — solo difieren en honorarios + mínimos de suscripción.
 *
 * Usado en `EnrichedRow.clasesDisponibles` para que la ficha del fondo muestre
 * el detalle de honorarios por clase sin que el listado principal se infle a
 * 4.500+ filas (una por clase).
 */
export interface ClaseInfo {
  codigoCafci: number | null;
  /** Nombre completo de la clase, ej. "Balanz Capital Ahorro - Clase B". */
  claseNombre: string;
  /** Letra de la clase: "A", "B", "L", ... o "" si no se pudo extraer. */
  letra: string;
  /** Patrimonio (AUM) de ESTA clase. */
  patrimonio: number | null;
  /** Honorario anual del gerente para esta clase, en %. */
  feeGestion: number | null;
  /** Honorario anual de la depositaria, en %. */
  feeDepositaria: number | null;
  /** Comisión de suscripción, en %. */
  comIngreso: number | null;
  /** Comisión de rescate, en %. */
  comRescate: number | null;
  /** "S" | "N" — honorario por éxito. */
  honExito: string | null;
  /** Días para liquidar un rescate. */
  plazoRescate: number | null;
}

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
   * Benchmark de referencia declarado por el gerente al CAFCI, ej. "Badlar".
   * Viene de `fci_fondo_meta` populated por el cron semanal. null si no
   * tenemos metadata para este fondo todavía.
   */
  benchmark: string | null;

  /**
   * Duration declarada por CAFCI, ej. "Menor o Igual a 0.5 Año".
   * Útil para distinguir fondos USD Corto / Largo plazo dentro del macro
   * bucket "Renta Fija USD".
   */
  duration: string | null;

  /** Fecha de inicio del fondo (primer día de operación), ISO date. */
  inicio: string | null;

  /**
   * Estrategia inferida. Computed from (a) override manual en Supabase, sino
   * (b) inferencia por holdings de cartera si están disponibles, sino
   * (c) fallback al macro-bucket por categoría + moneda.
   */
  estrategia: Estrategia;

  /**
   * Nivel de confianza de la clasificación. Crítico para la UI: el asesor
   * necesita saber cuándo la etiqueta es indubitable y cuándo es solo macro
   * fallback. Ver `src/lib/fondos/estrategia.ts` para la semántica completa.
   */
  estrategiaConfianza: import("./estrategia").Confianza;

  /**
   * Explicación humano-legible del por qué de la clasificación, ej:
   *   "CER domina con 68% de holdings visibles."
   *   "Composición no publicada por CAFCI — clasificación basada solo en
   *    macro-categoría + moneda. No es posible afinar a sub-estrategia."
   */
  estrategiaRazon: string;

  /**
   * Composición de cartera (top N holdings, ordenados por share desc).
   * Vacía si todavía no se scrapeo este fondo. Cada `tipo_activo` viene de
   * cartera-client.ts:classifyActivo.
   */
  cartera: CartHolding[];

  /**
   * Letra de la clase REPRESENTATIVA — la que usamos para llenar VCP / retornos
   * / honorarios de la fila. Priorizamos B (estándar minorista), luego A,
   * después C..G, después L (Ley 27.743). Null si la clase no tiene letra.
   */
  claseRepresentativa: string | null;

  /**
   * Todas las clases del fondo con su detalle de honorarios + patrimonio.
   * Se muestra en la ficha `/fondo/[key]` para que el asesor compare costos
   * entre clases (A típicamente más cara para minoristas, C-G institucionales).
   */
  clasesDisponibles: ClaseInfo[];
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
  const inferred = applyEstrategiaWithConfidence(
    {
      fondo: r.fondo,
      categoria,
      moneda,
      codigoCafci: r.codigoCafci,
    },
    overrides,
    cartera,
  );
  const estrategia = inferred.estrategia;
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
    estrategiaConfianza: inferred.confianza,
    estrategiaRazon: inferred.razon,
    cartera,
    // Estos campos se rellenan luego en _buildSnapshot — buildRow sigue
    // siendo "por-clase" y queda puro para tests / reusos futuros.
    claseRepresentativa: null,
    clasesDisponibles: [],
    benchmark: null,
    duration: null,
    inicio: null,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

// ─── Supabase loaders for cartera + meta (cached 6h) ────────────────────────

interface FondoMetaInfo {
  /** Benchmark de referencia, ej. "Badlar". */
  benchmark: string | null;
  /** Duration declarada por CAFCI, ej. "Menor o Igual a 0.5 Año". */
  duration: string | null;
  /** Región de inversión, ej. "Argentina" / "Latam" / "Global". */
  region: string | null;
  /** Horizonte sugerido por CAFCI, ej. "Corto Plazo". */
  horizonte: string | null;
  /** Tipo de renta detallado del catálogo, ej. "Renta Fija ARS Discrecional". */
  tipoRentaNombre: string | null;
  /** Fecha de inicio del fondo (ISO date, primer día de operación). */
  inicio: string | null;
  /** Marca "Money Market puro" del catálogo CAFCI. */
  mmPuro: boolean | null;
}

interface CarteraStore {
  /** codigo_cafci_clase → fondo_id padre. */
  claseToFondo: Map<number, number>;
  /** fondo_id → top holdings ordenados por share desc. */
  holdingsByFondo: Map<number, CartHolding[]>;
  /**
   * fondo_id → metadata oficial CAFCI (benchmark, duration, region, etc.).
   * Los datos son por-fondo, no por-clase, así que dedupeamos al cargar.
   */
  metaByFondo: Map<number, FondoMetaInfo>;
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
      metaByFondo: new Map(),
    };
    try {
      const supa = publicClient();

      // 1) clase → fondo mapping + metadata oficial por fondo (paginated;
      //    ~4566 rows en fci_fondo_meta). Metadata por-fondo (benchmark,
      //    duration, region, etc.) la deduplicamos: el primer hit de cada
      //    fondo_id gana, el resto se descarta (los valores son idénticos
      //    entre clases del mismo fondo).
      const claseToFondo = new Map<number, number>();
      const metaByFondo = new Map<number, FondoMetaInfo>();
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supa
          .from("fci_fondo_meta")
          .select(
            "codigo_cafci_clase, fondo_id, benchmark, duration, region, horizonte, tipo_renta_nombre, inicio, mm_puro",
          )
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
            if (!metaByFondo.has(r.fondo_id)) {
              metaByFondo.set(r.fondo_id, {
                benchmark: typeof r.benchmark === "string" ? r.benchmark : null,
                duration: typeof r.duration === "string" ? r.duration : null,
                region: typeof r.region === "string" ? r.region : null,
                horizonte:
                  typeof r.horizonte === "string" ? r.horizonte : null,
                tipoRentaNombre:
                  typeof r.tipo_renta_nombre === "string"
                    ? r.tipo_renta_nombre
                    : null,
                inicio: typeof r.inicio === "string" ? r.inicio : null,
                mmPuro: typeof r.mm_puro === "boolean" ? r.mm_puro : null,
              });
            }
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

      const result: CarteraStore = { claseToFondo, holdingsByFondo, metaByFondo };
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

// ─── Class-letter parsing + representative picker ──────────────────────────
//
// CAFCI nombres tienen sufijo "- Clase X" donde X es A..G ó "L Ley 27.743".
// Para dedup necesitamos extraer la letra y elegir la clase "representativa"
// del fondo (la que mostramos en el listado).
//
// Prioridad de la clase representativa: B → A → C → D → E → F → G → L → otra.
// Razonamiento: Clase B es el estándar minorista en la práctica argentina
// (mínimo de suscripción accesible, comisiones típicas retail). A veces
// algunos fondos sólo tienen A o son post-Ley 27.743 con sólo L — caemos al
// fallback. Ante empate, gana la clase con mayor patrimonio (= más
// representativa del fondo en términos de plata invertida).

const CLASE_PRIORITY: Record<string, number> = {
  B: 0, A: 1, C: 2, D: 3, E: 4, F: 5, G: 6, L: 7,
};

function parseClaseLetra(displayName: string): string {
  // "Balanz Capital Ahorro - Clase B" → "B"
  // "Balanz Capital Ahorro - Clase L Ley Nº 27.743" → "L"
  const m = /-\s*Clase\s+([A-Z])\b/i.exec(displayName);
  return m ? m[1].toUpperCase() : "";
}

function claseScore(letra: string): number {
  const p = CLASE_PRIORITY[letra];
  return p !== undefined ? p : 999;
}

async function _buildSnapshot(): Promise<MarketSnapshot> {
  // Fire all loaders in parallel — sheet download dominates latency.
  const [sheet, overrides, carteraStore] = await Promise.all([
    fetchCafciSnapshot(),
    loadEstrategiaOverrides(),
    loadCarteraStore(),
  ]);

  // ── Step 1: agrupar filas (clases) por nombre base de fondo ───────────────
  // CAFCI publica una fila por clase; un mismo fondo tiene 1-8 clases que
  // comparten cartera, gestora, categoría — solo difieren en honorarios y
  // mínimos. Para no inflar el listado a 4.500+ filas, dedupeamos por
  // baseName y mostramos solo la clase representativa por fondo.
  const byBase = new Map<string, CafciSheetRow[]>();
  for (const r of sheet) {
    const baseName = fondoBaseName(r.fondo);
    if (!byBase.has(baseName)) byBase.set(baseName, []);
    byBase.get(baseName)!.push(r);
  }

  const rows: EnrichedRow[] = [];
  const categoriasSet = new Set<string>();
  const gestorasSet = new Set<string>();
  const monedasSet = new Set<string>();
  const estrategiasSet = new Set<Estrategia>();
  let aumTotal = 0;
  let fecha = "";

  for (const [baseName, group] of byBase) {
    // ── Step 2: elegir clase representativa ─────────────────────────────────
    // Ordenamos por (prioridad de letra asc, patrimonio desc) y tomamos la 1ra.
    const sortedGroup = [...group].sort((a, b) => {
      const sa = claseScore(parseClaseLetra(a.fondo));
      const sb = claseScore(parseClaseLetra(b.fondo));
      if (sa !== sb) return sa - sb;
      return (b.patrimonio ?? 0) - (a.patrimonio ?? 0);
    });
    const rep = sortedGroup[0];

    // ── Step 3: armar detalle de clases (para ficha del fondo) ──────────────
    const clasesDisponibles: ClaseInfo[] = sortedGroup.map((c) => ({
      codigoCafci: c.codigoCafci,
      claseNombre: c.fondo,
      letra: parseClaseLetra(c.fondo),
      patrimonio: c.patrimonio,
      feeGestion: c.honorariosGerente,
      feeDepositaria: c.honorariosDepositaria,
      comIngreso: c.comIngreso,
      comRescate: c.comRescate,
      honExito: c.honorariosExito,
      plazoRescate: c.plazoLiq,
    }));

    // ── Step 4: AUM del fondo = suma de patrimonio de todas las clases ──────
    // Más significativo que mostrar solo el de la clase representativa,
    // porque "tamaño del fondo" depende de la suma agregada.
    const patrimonioFondo = sortedGroup.reduce(
      (acc, c) => acc + (c.patrimonio ?? 0),
      0,
    );

    // ── Step 5: lookup cartera vía fondoId del rep ──────────────────────────
    const fondoId =
      rep.codigoCafci != null
        ? carteraStore.claseToFondo.get(rep.codigoCafci) ?? null
        : null;
    const holdings = fondoId != null
      ? carteraStore.holdingsByFondo.get(fondoId) ?? []
      : [];

    // ── Step 6: armar row con datos del rep, override patrimonio agregado y
    //           key/displayName por baseName (URL estable y limpia) ──────────
    const baseRow = buildRow(rep, overrides, fondoId, holdings);
    const letraRep = parseClaseLetra(rep.fondo);
    const meta = fondoId != null ? carteraStore.metaByFondo.get(fondoId) : null;
    const row: EnrichedRow = {
      ...baseRow,
      key: baseName,
      displayName: baseName,
      patrimonio: patrimonioFondo > 0 ? patrimonioFondo : baseRow.patrimonio,
      claseRepresentativa: letraRep || null,
      clasesDisponibles,
      benchmark: meta?.benchmark ?? null,
      duration: meta?.duration ?? null,
      inicio: meta?.inicio ?? null,
    };

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
