/**
 * Thin wrapper around the CAFCI public API.
 *
 * Notes:
 * - CAFCI requires `origin` and `referer` headers on most endpoints; without
 *   them many calls return HTTP 403 / { error: "internal" }.
 * - Foreign keys are returned as strings ("3" not 3); compare as strings.
 * - `include` syntax: comma-separated, NEVER use semicolons. Only some
 *   includes work: `tipoRenta` works; `entidadGerente`/`gerente` do NOT.
 * - For gestora resolution, fetch /entidad once and build a lookup map.
 * - `limit=0` returns all rows (CAFCI convention).
 */
import type {
  CafciResponse,
  DailyStatRow,
  Entidad,
  Fondo,
  LatestSnapshot,
  TipoRenta,
} from "./types";

const BASE = "https://api.pub.cafci.org.ar";

const HEADERS: HeadersInit = {
  accept: "application/json, text/plain, */*",
  origin: "https://www.cafci.org.ar",
  referer: "https://www.cafci.org.ar/",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

async function cafciGet<T>(path: string): Promise<T> {
  const url = `${BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: HEADERS,
      cache: "no-store",
    });
  } catch (e) {
    console.error(`[cafci] network error for ${path}:`, e);
    throw e;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      `[cafci] HTTP ${res.status} for ${path} — body: ${body.slice(0, 200)}`,
    );
    throw new Error(`CAFCI ${path} → HTTP ${res.status}`);
  }
  const json = (await res.json()) as CafciResponse<T>;
  if (!json.success) {
    console.error(
      `[cafci] success=false for ${path}: ${JSON.stringify(json).slice(0, 200)}`,
    );
    throw new Error(`CAFCI ${path} → ${JSON.stringify(json).slice(0, 120)}`);
  }
  return json.data;
}

/** Lista de categorías (tipos de renta). */
export function getTiposRenta(): Promise<TipoRenta[]> {
  return cafciGet<TipoRenta[]>("/tipo-renta");
}

/** Listado completo de fondos activos con tipoRenta resuelto. */
export function getFondosActivos(): Promise<Fondo[]> {
  return cafciGet<Fondo[]>(
    "/fondo?estado=1&include=tipoRenta&limit=0&order=nombre",
  );
}

/** Listado de entidades (sociedades gerentes y depositarias). */
export function getEntidades(): Promise<Entidad[]> {
  return cafciGet<Entidad[]>("/entidad?limit=0");
}

/**
 * Builds a `id → nombreCorto` map from the entidades list, for quick
 * resolution of a fondo's `sociedadGerenteId` to a human-readable name.
 */
export async function getGestoraMap(): Promise<Map<string, string>> {
  const entidades = await getEntidades();
  const map = new Map<string, string>();
  for (const e of entidades) {
    if (e.id && e.nombreCorto) {
      // CAFCI pads nombres with spaces — trim.
      map.set(String(e.id), e.nombreCorto.trim());
    }
  }
  return map;
}

/**
 * Daily stats for a single category on a specific date.
 * Filters out aggregate rows (those with no `fecha`).
 */
export async function getDailyStatsByCategory(
  categoriaId: string | number,
  fecha: string,
): Promise<DailyStatRow[]> {
  try {
    const data = await cafciGet<DailyStatRow[]>(
      `/estadisticas/informacion/diaria/${categoriaId}/${fecha}`,
    );
    return data.filter(
      (r) =>
        r &&
        typeof r.fondo === "string" &&
        typeof r.fecha === "string" &&
        r.fecha.length > 0 &&
        typeof r.vcp === "number",
    );
  } catch {
    return [];
  }
}

/**
 * Walks back from `fromDate` (default: today) to find the most recent
 * business day with stats data. CAFCI returns {error: 'inexistance'} or
 * empty arrays on weekends and holidays.
 */
export async function getLatestBusinessDate(
  fromDate?: Date,
  maxLookback = 7,
): Promise<string> {
  const start = fromDate ?? new Date();
  const probeCategoryId = "3"; // Renta Fija — has many fondos so always reliable
  for (let i = 0; i < maxLookback; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    const fecha = d.toISOString().slice(0, 10);
    const rows = await getDailyStatsByCategory(probeCategoryId, fecha);
    if (rows.length > 0) return fecha;
  }
  // Fallback to yesterday (caller should still tolerate empty data)
  const fb = new Date(start);
  fb.setDate(fb.getDate() - 1);
  return fb.toISOString().slice(0, 10);
}

/**
 * Pulls daily stats for ALL categories on the latest business date,
 * concatenated. Single round-trip from the caller's perspective.
 */
export async function getLatestSnapshot(): Promise<LatestSnapshot> {
  const fecha = await getLatestBusinessDate();
  const tipos = await getTiposRenta();
  const lists = await Promise.all(
    tipos.map((t) => getDailyStatsByCategory(t.id, fecha)),
  );
  const rows: DailyStatRow[] = [];
  for (const list of lists) rows.push(...list);
  return { fecha, rows };
}

/**
 * Strips a class suffix from a CAFCI display name to recover the
 * underlying fondo name for matching purposes.
 *
 * "Galileo Premium - Clase A" → "Galileo Premium"
 * "1810 Ahorro"               → "1810 Ahorro"
 */
export function fondoBaseName(displayName: string): string {
  return displayName.replace(/\s*-\s*Clase\s+.+$/i, "").trim();
}

/**
 * Parse CAFCI's DD/MM/YY date format into ISO YYYY-MM-DD.
 */
export function parseCafciDate(s: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(s);
  if (!m) return null;
  const dd = m[1];
  const mm = m[2];
  const yy = parseInt(m[3], 10);
  // CAFCI dates are post-2000.
  const yyyy = 2000 + yy;
  return `${yyyy}-${mm}-${dd}`;
}
