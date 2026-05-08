/**
 * Estrategia (sub-categoría de inversión) de un FCI.
 *
 * 6 buckets honestos, basados solo en metadata pública de CAFCI (categoría
 * macro + moneda). Sin regex sobre nombre porque, descubrimos, los fondos
 * argentinos NO etiquetan la estrategia en el nombre — "Compass Renta Fija
 * II" puede ser CER, Lecaps, Dólar Linked o tasa fija sin ningún signo
 * exterior. La única forma de distinguir esos sub-tipos sería bajar la
 * cartera completa de cada fondo (API CAFCI cerrada).
 *
 * Para los fondos donde la mesa de Amauta sí conozca la estrategia real
 * (ej. "Galileo Renta CER" → CER, "Balanz Lecaps" → Lecaps), está la tabla
 * `fci_estrategia_override` en Supabase: PK = codigo_cafci, estrategia =
 * cualquier string libre. Cuando un fondo tiene override, su valor sobrescribe
 * el bucket auto, y el filtro lo expone como una opción nueva.
 */
import { publicClient } from "@/lib/supabase/server";

/**
 * Buckets que devuelve el clasificador.
 *
 * Granularidad por tipo de fuente:
 * - Sin cartera disponible: solo aparecen los 6 macro buckets de CAFCI
 *   (Money Market / RF ARS / RF USD / RV / RM / Otros).
 * - Con cartera (cuando el cron weekly ya populó `fci_cartera`): el
 *   clasificador puede afinar dentro de "RF ARS" a CER / Lecaps / DL,
 *   y también marcar "Money Market" cuando los holdings son cash equiv.
 */
export const STANDARD_ESTRATEGIAS = [
  "Money Market",
  "Lecaps",
  "CER",
  "Dólar Linked",
  "Hard USD",
  "Renta Fija ARS",
  "Renta Fija USD",
  "Renta Variable",
  "Renta Mixta",
  "Otros",
] as const;

export type StandardEstrategia = (typeof STANDARD_ESTRATEGIAS)[number];

/**
 * Tipo público: cualquier string. Usamos string en lugar de union literal
 * porque la tabla `fci_estrategia_override` puede introducir valores nuevos
 * (CER, Lecaps, DL, etc.) que vos cargás manualmente.
 */
export type Estrategia = string;

/**
 * Subset de EnrichedRow / CafciSheetRow necesario para clasificar.
 * Mantenido angosto para que la función sea fácil de razonar.
 */
export interface ClassifierInput {
  /** Display name del fondo (no se usa en el clasificador, queda para overrides futuros). */
  fondo: string;
  /** Categoría macro: "Money Market" / "Renta Fija" / "Renta Mixta" / etc. */
  categoria: string | null;
  /** "Pesos" / "USD" / "ARS" — case insensitive. */
  moneda: string | null;
}

/**
 * Asigna una estrategia standard según categoría macro + moneda.
 * Esta es la versión "ciega" — sin holdings de cartera. Si tenés
 * `holdings`, usá `inferEstrategiaWithHoldings` que es más precisa.
 *
 * Reglas (primer match gana):
 *   - Money Market → "Money Market"
 *   - Renta Variable → "Renta Variable"
 *   - Renta Mixta → "Renta Mixta"
 *   - Renta Fija + moneda USD → "Renta Fija USD"
 *   - Renta Fija + (ARS / Pesos / otra) → "Renta Fija ARS"
 *   - Cualquier otra cosa → "Otros"
 */
export function inferEstrategia(input: ClassifierInput): StandardEstrategia {
  const cat = (input.categoria ?? "").toLowerCase();
  const moneda = (input.moneda ?? "").toUpperCase();
  const isUsd = moneda === "USD";

  if (cat.includes("money market")) return "Money Market";
  if (cat.includes("renta variable")) return "Renta Variable";
  if (cat.includes("renta mixta")) return "Renta Mixta";
  if (cat.includes("renta fija")) {
    return isUsd ? "Renta Fija USD" : "Renta Fija ARS";
  }
  return "Otros";
}

// ─── Cartera-aware classifier ───────────────────────────────────────────────

/**
 * Holdings shape para clasificación + display en UI.
 *
 * - `rank` = posición en la cartera ordenada por share desc (1 = mayor).
 * - `activo` = nombre del activo tal cual lo publica CAFCI ("Lecer X15Y6").
 * - `tipo_activo` = bucket coarse (Lecer / Boncer / Lecap / Cta Cte / etc.),
 *   resultado de cartera-client.ts:classifyActivo.
 * - `share` = porcentaje (0-100).
 *
 * Solo `tipo_activo` + `share` se usan para clasificar la estrategia. `rank`
 * y `activo` están para que la UI pueda mostrar la composición en la ficha.
 */
export interface CartHolding {
  rank: number;
  activo: string;
  tipo_activo: string;
  share: number;
}

/**
 * Versión "ojos abiertos" del clasificador: si el fondo tiene cartera y los
 * holdings tienen una concentración clara en un bucket específico (CER, Lecaps,
 * Money Market, DL, Hard USD), devolvemos ese bucket. Sino, fallback al
 * clasificador macro estándar (`inferEstrategia`).
 *
 * Thresholds elegidos para que un fondo "puramente CER" (>50% Lecer+Boncer)
 * caiga ahí, pero un mix balanceado (ej. 30% CER + 30% Lecap + 40% otro)
 * caiga al bucket macro "Renta Fija ARS".
 */
export function inferEstrategiaWithHoldings(
  input: ClassifierInput,
  holdings: CartHolding[],
): StandardEstrategia {
  if (holdings.length === 0) return inferEstrategia(input);

  // Aggregate share por tipo_activo.
  let cer = 0,
    lecaps = 0,
    dl = 0,
    hardUsd = 0,
    cash = 0;
  for (const h of holdings) {
    const t = h.tipo_activo;
    const s = h.share || 0;
    if (t === "Lecer" || t === "Boncer") cer += s;
    else if (t === "Lecap" || t === "Bonte") lecaps += s;
    else if (t === "Dólar Linked") dl += s;
    else if (t === "Hard USD") hardUsd += s;
    else if (t === "Plazo Fijo" || t === "Cta Cte" || t === "Caución")
      cash += s;
  }

  // Money Market: cash equivalents son la mayoría.
  if (cash >= 60) return "Money Market";

  // Buckets específicos cuando uno domina por al menos la mitad de la cartera
  // VISIBLE (los top holdings — el "Resto de Activos" dilución no se cuenta).
  // Threshold 50 es robusto: descarta fondos balanceados que mejor caen en RF.
  if (cer >= 50) return "CER";
  if (lecaps >= 50) return "Lecaps";
  if (dl >= 30) return "Dólar Linked";
  if (hardUsd >= 50) return "Hard USD";

  // Sin concentración clara — vuelta al macro bucket.
  return inferEstrategia(input);
}

// ─── Override loader (Supabase, cached in process memory) ───────────────────

let overrideCache: { data: Map<number, Estrategia>; expiresAt: number } | null =
  null;
let overrideInflight: Promise<Map<number, Estrategia>> | null = null;
const OVERRIDE_TTL_MS = 6 * 60 * 60 * 1_000;

/**
 * Carga el mapa codigo_cafci → estrategia desde Supabase. Cacheado 6 h en
 * memoria. Si Supabase no está configurado o falla, devuelve mapa vacío
 * (silently) — el auto-tag sigue funcionando sin overrides.
 */
export async function loadEstrategiaOverrides(): Promise<
  Map<number, Estrategia>
> {
  const now = Date.now();
  if (overrideCache && overrideCache.expiresAt > now) return overrideCache.data;
  if (overrideInflight) return overrideInflight;

  overrideInflight = (async () => {
    try {
      const supa = publicClient();
      const { data, error } = await supa
        .from("fci_estrategia_override")
        .select("codigo_cafci, estrategia");
      if (error) {
        console.error("[estrategia] override fetch error:", error.message);
        return new Map<number, Estrategia>();
      }
      const map = new Map<number, Estrategia>();
      for (const row of data ?? []) {
        if (
          typeof row.codigo_cafci === "number" &&
          typeof row.estrategia === "string" &&
          row.estrategia.trim().length > 0
        ) {
          map.set(row.codigo_cafci, row.estrategia.trim());
        }
      }
      overrideCache = { data: map, expiresAt: Date.now() + OVERRIDE_TTL_MS };
      return map;
    } catch (e) {
      console.error("[estrategia] supabase client init failed:", e);
      return new Map<number, Estrategia>();
    } finally {
      overrideInflight = null;
    }
  })();
  return overrideInflight;
}

/**
 * Estrategia final del fondo, en orden de precedencia:
 *   1. Override manual en Supabase si existe (tabla fci_estrategia_override).
 *   2. Inferencia por holdings de cartera si están disponibles.
 *   3. Fallback al clasificador macro (categoría + moneda).
 */
export function applyEstrategia(
  input: ClassifierInput & { codigoCafci: number | null },
  overrides: Map<number, Estrategia>,
  holdings: CartHolding[] = [],
): Estrategia {
  if (input.codigoCafci != null) {
    const ov = overrides.get(input.codigoCafci);
    if (ov) return ov;
  }
  if (holdings.length > 0) {
    return inferEstrategiaWithHoldings(input, holdings);
  }
  return inferEstrategia(input);
}

/**
 * Ordena una lista de estrategias colocando las standard primero (en su
 * orden canónico) y luego las custom (de overrides) alfabéticamente.
 */
export function sortEstrategias(estrategias: Iterable<Estrategia>): Estrategia[] {
  const standardSet = new Set<string>(STANDARD_ESTRATEGIAS);
  const all = Array.from(new Set(estrategias));
  const standard = STANDARD_ESTRATEGIAS.filter((e) => all.includes(e));
  const custom = all.filter((e) => !standardSet.has(e)).sort((a, b) => a.localeCompare(b, "es-AR"));
  return [...standard, ...custom];
}
