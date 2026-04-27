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
import type { CafciResponse, Entidad, Fondo, TipoRenta } from "./types";

const BASE = "https://api.pub.cafci.org.ar";

const HEADERS: HeadersInit = {
  accept: "application/json, text/plain, */*",
  origin: "https://www.cafci.org.ar",
  referer: "https://www.cafci.org.ar/",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

interface FetchOpts {
  /** Cache strategy. Default: revalidate every 30 min on the server. */
  revalidate?: number | false;
}

async function cafciGet<T>(
  path: string,
  { revalidate = 1800 }: FetchOpts = {},
): Promise<T> {
  const url = `${BASE}${path}`;
  const init: RequestInit = { headers: HEADERS };
  if (revalidate === false) {
    init.cache = "no-store";
  } else {
    init.next = { revalidate };
  }
  let res: Response;
  try {
    res = await fetch(url, init);
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

/** Lista de categorías (tipos de renta). Cambia muy poco — cache 24h. */
export function getTiposRenta(): Promise<TipoRenta[]> {
  return cafciGet<TipoRenta[]>("/tipo-renta", { revalidate: 86_400 });
}

/** Listado completo de fondos activos con tipoRenta resuelto. */
export function getFondosActivos(): Promise<Fondo[]> {
  return cafciGet<Fondo[]>(
    "/fondo?estado=1&include=tipoRenta&limit=0&order=nombre",
    { revalidate: 1800 },
  );
}

/** Listado de entidades (sociedades gerentes y depositarias). */
export function getEntidades(): Promise<Entidad[]> {
  return cafciGet<Entidad[]>("/entidad?limit=0", { revalidate: 86_400 });
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
