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
 * Diseño (BLOQUE 3 — Opción A, May 2026):
 *   1. Guardrail por categoría macro CAFCI — si el catálogo ya dice "Money
 *      Market" / "Renta Variable" / "Renta Mixta", respetamos. Holdings de
 *      un MM dinámico pueden tener 30% en Lecaps cortos y aún así ser
 *      conceptualmente MM; idem un fondo mixto con concentración temporal
 *      en CER. La categoría macro de CAFCI es señal fuerte sobre la
 *      INTENCIÓN del fondo (no la composición puntual).
 *   2. Para fondos de Renta Fija solo: clasificamos por holdings con
 *      thresholds más permisivos (30% en vez de 50%) y resolvemos empates
 *      por SHARE DOMINANTE entre los candidatos que pasan threshold.
 *
 * Thresholds (BLOQUE 3 — Opción A):
 *   - CER ≥ 30%          (antes 50)
 *   - Lecaps ≥ 30%       (antes 50)
 *   - Dólar Linked ≥ 20% (antes 30)
 *   - Hard USD ≥ 30%     (antes 50)
 *   - Money Market cash ≥ 60% (sin cambio — sigue siendo un piso alto)
 *
 * Resolución de empate: si pasan threshold varios buckets (ej. CER 35% +
 * Lecaps 32%), gana el de mayor share. Antes con "first match wins" el
 * orden de chequeo dictaba la respuesta, lo cual era arbitrario.
 *
 * Verificado contra holdings reales 2026-05-11:
 *   - Balanz Capital Ahorro: Lecer+Boncer ~68% → CER ✅
 *   - Balanz Institucional:  Boncer ~74%        → CER ✅
 *   - Compass Renta Fija:    Hard USD ~46%      → Hard USD ✅ (antes RF USD)
 *   - Pellegrini RF III:     Lecap ~49%, CER ~25% → Lecaps ✅
 *   - Pellegrini RF II:      CER ~55%, Lecap ~26% → CER ✅
 */
export function inferEstrategiaWithHoldings(
  input: ClassifierInput,
  holdings: CartHolding[],
): StandardEstrategia {
  if (holdings.length === 0) return inferEstrategia(input);

  // Guardrail macro: categorías no-RF se respetan del catálogo CAFCI.
  const cat = (input.categoria ?? "").toLowerCase();
  if (cat.includes("money market") || cat.includes("mercado de dinero")) {
    return "Money Market";
  }
  if (cat.includes("renta variable")) return "Renta Variable";
  if (cat.includes("renta mixta")) return "Renta Mixta";

  // Aggregate share por tipo_activo (solo para fondos de Renta Fija de acá).
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

  // "Promotion to MM" — fondo categorizado RF pero con >60% en cash
  // equivalents. Caso raro pero existe (cierres en pesos de fondos T+1).
  if (cash >= 60) return "Money Market";

  // Candidatos: cualquier bucket que pasa su threshold. Gana el de mayor
  // share, NO el primero en el orden de chequeo.
  const candidates: Array<{ name: StandardEstrategia; share: number }> = [];
  if (cer >= 30) candidates.push({ name: "CER", share: cer });
  if (lecaps >= 30) candidates.push({ name: "Lecaps", share: lecaps });
  if (dl >= 20) candidates.push({ name: "Dólar Linked", share: dl });
  if (hardUsd >= 30) candidates.push({ name: "Hard USD", share: hardUsd });

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.share - a.share);
    return candidates[0].name;
  }

  // Sin concentración clara — vuelta al macro bucket (Renta Fija ARS / USD).
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
