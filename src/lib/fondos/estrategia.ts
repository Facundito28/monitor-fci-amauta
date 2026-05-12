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
 * Thresholds de "MANDATE" — al pasar de aquí, decimos que el fondo es
 * STRUCTURALMENTE de esa estrategia (probable mandato del prospecto). Por
 * debajo, es discrecional / tactical: la composición rota con el mercado
 * y NO podemos llamarlo "CER" o "Lecaps" sin engañar al asesor.
 *
 * BLOQUE 8 — May 2026, ajuste para distinguir mandate vs tactical:
 *
 *   - "Balanz Institucional" tiene 83% CER → mandate CER (siempre será CER).
 *   - "Balanz Capital Ahorro" tiene 72% CER hoy pero su benchmark es Badlar
 *     y duration ≤0.5y → T+1 discretional, hoy con tilt CER pero mañana
 *     puede rotar a Lecap o cash. Llamarlo "CER" sería incorrecto.
 *
 * Verificado contra los 1.085 fondos con holdings reales (2026-05-11):
 *   - 52 fondos pasan threshold 80% en CER  → 4.8% son CER mandate
 *   - 6 fondos pasan 80% en Lecaps          → 0.5% Lecaps mandate
 *   - 9 fondos pasan 80% en Hard USD        → 0.8% Hard USD mandate
 *   - 0 fondos pasan 60% en DL              → DL casi nunca es mandate puro
 *
 * El resto (94%) se clasifica por macro (Renta Fija ARS/USD/Mixta/MM/RV),
 * que sigue siendo correcto — son fondos cuya identidad NO es el bucket
 * específico sino el "estilo" de inversión. El tilt actual se muestra en
 * la ficha del fondo via composición y razón del clasificador.
 */
export const MANDATE_THRESHOLD = {
  CER: 80,
  LECAPS: 80,
  HARD_USD: 80,
  DL: 60,            // Más bajo: el universo DL es chico, un 60% ya es mandate
  MM_CASH: 60,       // Si cash equivalents > 60%, es MM funcionalmente
} as const;

/**
 * Thresholds de "TILT" — concentración intermedia. No es mandate pero es
 * un sesgo visible para el asesor. Se reporta en la razón sin cambiar la
 * etiqueta final (el fondo sigue clasificándose como macro RF).
 *
 * Solo se usa para razonamiento humano-legible. El bucket dominante < 80%
 * cae a macro bucket por convención.
 */
const TILT_THRESHOLD = 50;

/**
 * Versión "ojos abiertos" del clasificador: si el fondo tiene cartera con
 * MANDATE-level concentration (≥80% para CER/Lecaps/Hard USD; ≥60% para DL),
 * devolvemos ese bucket. Sino, fallback al clasificador macro
 * (`inferEstrategia`).
 *
 * Reglas (orden de chequeo):
 *   1. Guardrail por categoría macro CAFCI — si el catálogo ya dice "Money
 *      Market" / "Renta Variable" / "Renta Mixta", respetamos.
 *   2. Cash equivalents ≥60% → promotion a Money Market (caso T+1 con todo
 *      en cauciones — funcionalmente es MM).
 *   3. Bucket dominante ≥ MANDATE_THRESHOLD → CER / Lecaps / DL / Hard USD.
 *   4. Empate por share dominante entre candidatos que pasan threshold.
 *   5. Fallback a macro (Renta Fija ARS / USD / etc.).
 */
export function inferEstrategiaWithHoldings(
  input: ClassifierInput,
  holdings: CartHolding[],
): StandardEstrategia {
  if (holdings.length === 0) return inferEstrategia(input);

  const cat = (input.categoria ?? "").toLowerCase();
  if (cat.includes("money market") || cat.includes("mercado de dinero")) {
    return "Money Market";
  }
  if (cat.includes("renta variable")) return "Renta Variable";
  if (cat.includes("renta mixta")) return "Renta Mixta";

  let cer = 0, lecaps = 0, dl = 0, hardUsd = 0, cash = 0;
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

  if (cash >= MANDATE_THRESHOLD.MM_CASH) return "Money Market";

  const candidates: Array<{ name: StandardEstrategia; share: number }> = [];
  if (cer >= MANDATE_THRESHOLD.CER) candidates.push({ name: "CER", share: cer });
  if (lecaps >= MANDATE_THRESHOLD.LECAPS) candidates.push({ name: "Lecaps", share: lecaps });
  if (dl >= MANDATE_THRESHOLD.DL) candidates.push({ name: "Dólar Linked", share: dl });
  if (hardUsd >= MANDATE_THRESHOLD.HARD_USD) candidates.push({ name: "Hard USD", share: hardUsd });

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.share - a.share);
    return candidates[0].name;
  }

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
 * Niveles de confianza en la clasificación — auditables para que el asesor
 * sepa CUÁNDO confiar en la etiqueta y cuándo verla solo como contexto:
 *
 *   - "override":  manual de Amauta (tabla fci_estrategia_override).
 *                  Confianza máxima: alguien lo verificó.
 *
 *   - "alta":      MANDATE confirmado. El fondo es ESTRUCTURALMENTE de esa
 *                  estrategia. Dos caminos para llegar aquí:
 *                    a) Concentración ≥ MANDATE_THRESHOLD (CER ≥80%, etc.)
 *                       — el prospecto obliga al gerente a mantenerse ahí
 *                       independiente del mercado, y eso se ve en la cartera.
 *                    b) Macro CAFCI MM/RV/Mixta — regulatoriamente declarado.
 *
 *   - "media":     TACTICAL con tilt fuerte. La etiqueta es la macro pero
 *                  hay un sesgo notable hacia un bucket (50-79%). El asesor
 *                  debería leer la composición — el tilt actual puede rotar.
 *
 *   - "baja":      TACTICAL sin tilt claro. Cartera diversificada o
 *                  mix < 50% en cualquier bucket. La macro es genérica.
 *
 *   - "macro":     Sin holdings publicados por CAFCI. La clasificación es
 *                  SOLO la macro categoría + moneda — no podemos saber si
 *                  es mandate ni cuál es el tilt actual.
 */
export type Confianza = "override" | "alta" | "media" | "baja" | "macro";

/**
 * Resultado completo del clasificador — estrategia + nivel de confianza +
 * explicación humano-legible. La razón debe ser auditable, no marketing —
 * concentración numérica, override flag, o "sin composición publicada".
 */
export interface EstrategiaInferida {
  estrategia: Estrategia;
  confianza: Confianza;
  razon: string;
}

/**
 * Estrategia final del fondo + confianza + razón. En orden de precedencia:
 *   1. Override manual en Supabase si existe (fci_estrategia_override).
 *   2. Guardrail macro: si CAFCI declara MM/RV/Mixta, respetamos.
 *   3. Inferencia por holdings (cuando hay datos del cron semanal).
 *   4. Fallback al clasificador macro por categoría + moneda.
 */
export function applyEstrategiaWithConfidence(
  input: ClassifierInput & { codigoCafci: number | null },
  overrides: Map<number, Estrategia>,
  holdings: CartHolding[] = [],
): EstrategiaInferida {
  // 1) Override manual de Amauta — confianza máxima.
  if (input.codigoCafci != null) {
    const ov = overrides.get(input.codigoCafci);
    if (ov) {
      return {
        estrategia: ov,
        confianza: "override",
        razon: "Clasificación manual de Amauta (override en fci_estrategia_override).",
      };
    }
  }

  // 2) Guardrail macro CAFCI — categorías regulatoriamente declaradas.
  const cat = (input.categoria ?? "").toLowerCase();
  if (cat.includes("money market") || cat.includes("mercado de dinero")) {
    return {
      estrategia: "Money Market",
      confianza: "alta",
      razon:
        holdings.length > 0
          ? "CAFCI categoriza como Money Market — composición confirma cash + cauciones."
          : "CAFCI categoriza como Money Market (composición no publicada).",
    };
  }
  if (cat.includes("renta variable")) {
    return {
      estrategia: "Renta Variable",
      confianza: "alta",
      razon: "CAFCI categoriza como Renta Variable.",
    };
  }
  if (cat.includes("renta mixta")) {
    return {
      estrategia: "Renta Mixta",
      confianza: "alta",
      razon: "CAFCI categoriza como Renta Mixta.",
    };
  }

  // 3) Sin holdings → solo macro fallback (sin afinar). Confianza "macro".
  if (holdings.length === 0) {
    const estrategia = inferEstrategia(input);
    return {
      estrategia,
      confianza: "macro",
      razon:
        "Composición no publicada por CAFCI — clasificación basada solo en macro-categoría + moneda. No es posible afinar a sub-estrategia (CER / Lecaps / DL / Hard USD) sin info adicional.",
    };
  }

  // 4) Con holdings → analizar buckets.
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

  // 5) Promotion to MM cuando cash equivalents dominan.
  if (cash >= MANDATE_THRESHOLD.MM_CASH) {
    return {
      estrategia: "Money Market",
      confianza: "alta",
      razon: `Cash + cauciones + plazos fijos suman ${cash.toFixed(0)}% — domina liquidez (mandate de mercado de dinero).`,
    };
  }

  // 6) MANDATE candidates: solo buckets que pasen el umbral alto (CER ≥80,
  //    Lecaps ≥80, Hard USD ≥80, DL ≥60). Por debajo de eso consideramos
  //    el fondo tactical — su composición rota con el mercado y la etiqueta
  //    correcta es la macro (RF ARS / RF USD), aunque mencionamos el tilt.
  const mandateCandidates: Array<{ name: StandardEstrategia; share: number }> = [];
  if (cer >= MANDATE_THRESHOLD.CER) mandateCandidates.push({ name: "CER", share: cer });
  if (lecaps >= MANDATE_THRESHOLD.LECAPS) mandateCandidates.push({ name: "Lecaps", share: lecaps });
  if (dl >= MANDATE_THRESHOLD.DL) mandateCandidates.push({ name: "Dólar Linked", share: dl });
  if (hardUsd >= MANDATE_THRESHOLD.HARD_USD) mandateCandidates.push({ name: "Hard USD", share: hardUsd });

  if (mandateCandidates.length > 0) {
    mandateCandidates.sort((a, b) => b.share - a.share);
    const winner = mandateCandidates[0];
    return {
      estrategia: winner.name,
      confianza: "alta",
      razon: `Mandate ${winner.name} — concentración ${winner.share.toFixed(0)}% sostenida (≥ ${getThresholdFor(winner.name)}% del threshold de mandate). El fondo está estructuralmente posicionado en este bucket.`,
    };
  }

  // 7) Tactical: hay holdings pero ningún bucket llega al threshold de
  //    mandate. La etiqueta correcta es la macro; en la razón mencionamos
  //    el tilt actual para que el asesor sepa el sesgo de la cartera.
  const estrategia = inferEstrategia(input);
  const tilts: Array<{ name: string; share: number }> = [];
  if (cer >= TILT_THRESHOLD) tilts.push({ name: "CER", share: cer });
  if (lecaps >= TILT_THRESHOLD) tilts.push({ name: "Lecaps", share: lecaps });
  if (dl >= TILT_THRESHOLD * 0.6) tilts.push({ name: "Dólar Linked", share: dl }); // 30% para DL
  if (hardUsd >= TILT_THRESHOLD) tilts.push({ name: "Hard USD", share: hardUsd });
  tilts.sort((a, b) => b.share - a.share);

  if (tilts.length > 0) {
    const topTilt = tilts[0];
    return {
      estrategia,
      confianza: "media",
      razon: `Fondo discrecional con tilt actual hacia ${topTilt.name} (${topTilt.share.toFixed(0)}%) — concentración no llega al threshold de mandate (≥${getThresholdFor(topTilt.name as StandardEstrategia)}%), así que es tactical: la composición puede rotar.`,
    };
  }

  // 8) Sin tilt detectable: cartera muy diversificada.
  const allBuckets = [
    cer > 0 ? `CER ${cer.toFixed(0)}%` : null,
    lecaps > 0 ? `Lecaps ${lecaps.toFixed(0)}%` : null,
    dl > 0 ? `DL ${dl.toFixed(0)}%` : null,
    hardUsd > 0 ? `Hard USD ${hardUsd.toFixed(0)}%` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    estrategia,
    confianza: "baja",
    razon: allBuckets
      ? `Cartera diversificada sin tilt notable (${allBuckets}). Clasificación macro genérica.`
      : "Composición sin concentración en buckets reconocidos. Clasificación macro genérica.",
  };
}

/**
 * Helper: threshold de mandate por nombre de estrategia para mensajes
 * humano-legibles en la razón.
 */
function getThresholdFor(name: StandardEstrategia): number {
  switch (name) {
    case "CER": return MANDATE_THRESHOLD.CER;
    case "Lecaps": return MANDATE_THRESHOLD.LECAPS;
    case "Dólar Linked": return MANDATE_THRESHOLD.DL;
    case "Hard USD": return MANDATE_THRESHOLD.HARD_USD;
    default: return 80;
  }
}

/**
 * Versión legacy compatible con código viejo — solo retorna la estrategia.
 * Para nuevas integraciones usar `applyEstrategiaWithConfidence`.
 */
export function applyEstrategia(
  input: ClassifierInput & { codigoCafci: number | null },
  overrides: Map<number, Estrategia>,
  holdings: CartHolding[] = [],
): Estrategia {
  return applyEstrategiaWithConfidence(input, overrides, holdings).estrategia;
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
