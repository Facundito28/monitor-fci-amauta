/**
 * Thin wrapper around the fonditos.ar public API
 * (https://fonditos-api.gonzagiardino.workers.dev).
 *
 * Why fonditos and not CAFCI directly:
 *   CAFCI's public API (api.pub.cafci.org.ar) started returning 403/timeouts
 *   in April 2026. Fonditos is a public Cloudflare Worker by Gonzalo Giardino
 *   (gonzagiardino) that ingests CAFCI daily and re-serves the data already
 *   normalised, with calculated returns and historical VCP series.
 *
 * Endpoints used:
 *   GET /funds                                       — full daily snapshot
 *   GET /funds/detail?fondo=NAME                     — single-fund ficha
 *   GET /funds/history?fondo=NAME&days=N             — VCP daily series
 *   GET /funds/returns?from=&to=&funds[]=NAME        — return for a date range
 *   GET /health/sync                                 — last sync metadata
 *
 * Be a good citizen:
 *   - Identify ourselves with a User-Agent.
 *   - Cache aggressively (1h on Vercel Data Cache) — fonditos updates daily,
 *     no point hammering the Worker.
 *   - Time out individual calls to avoid hanging the page.
 */
import type {
  FonditosFund,
  FonditosFundDetail,
  FonditosHealth,
  FonditosHistoryPoint,
  FonditosReturnRangeRow,
} from "./types";

const BASE = "https://fonditos-api.gonzagiardino.workers.dev";

const HEADERS: HeadersInit = {
  accept: "application/json",
  "user-agent":
    "Monitor-FCIs-Amauta/1.0 (+https://monitor-fci-amauta.vercel.app)",
};

/** Abort any single call after this many ms to prevent hanging. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Cache fonditos responses for 1h. They publish daily — 1h is plenty. */
const REVALIDATE_S = 3_600;

/** TTL for the in-memory snapshot cache (ms). Same horizon as REVALIDATE_S. */
const FUNDS_CACHE_TTL_MS = 60 * 60 * 1_000;

async function fonditosGet<T>(
  path: string,
  opts: { useFetchCache?: boolean } = { useFetchCache: true },
): Promise<T> {
  const url = `${BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: HEADERS,
      ...(opts.useFetchCache
        ? { next: { revalidate: REVALIDATE_S } }
        : { cache: "no-store" as const }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    console.error(`[fonditos] network error for ${path}:`, e);
    throw e;
  }
  clearTimeout(timer);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      `[fonditos] HTTP ${res.status} for ${path} — body: ${body.slice(0, 200)}`,
    );
    throw new Error(`fonditos ${path} → HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

/**
 * In-memory cache for the bulk /funds payload.
 *
 * Why a module-level cache instead of Next's Data Cache:
 *   The /funds payload is ~2.1 MB, which exceeds Next.js's fetch Data Cache
 *   2 MB limit. Without our own cache, every request would hit fonditos. We
 *   memoise the parsed JSON for FUNDS_CACHE_TTL_MS, scoped to the current
 *   process. On Vercel, each serverless instance keeps its own copy; that's
 *   fine — the worst case is one fonditos hit per cold start.
 */
let fundsCache: { data: FonditosFund[]; expiresAt: number } | null = null;
let fundsInflight: Promise<FonditosFund[]> | null = null;

/** Full daily snapshot — every active class with returns + fees. */
export async function fetchFunds(): Promise<FonditosFund[]> {
  const now = Date.now();
  if (fundsCache && fundsCache.expiresAt > now) {
    return fundsCache.data;
  }
  // Coalesce concurrent calls so we only make one network request at a time.
  if (fundsInflight) return fundsInflight;
  fundsInflight = (async () => {
    try {
      const json = await fonditosGet<{ data: FonditosFund[] }>("/funds", {
        useFetchCache: false,
      });
      const data = Array.isArray(json?.data) ? json.data : [];
      fundsCache = { data, expiresAt: Date.now() + FUNDS_CACHE_TTL_MS };
      return data;
    } finally {
      fundsInflight = null;
    }
  })();
  return fundsInflight;
}

/** Sync health — used to display a "last close" badge consistent with /funds. */
export function fetchHealth(): Promise<FonditosHealth> {
  return fonditosGet<FonditosHealth>("/health/sync");
}

/**
 * Single-fund detail (vol/sharpe/rend_7d that aren't in the bulk /funds).
 * `fondo` is the exact display name as returned by /funds (case-sensitive).
 */
export function fetchFundDetail(fondo: string): Promise<FonditosFundDetail> {
  const q = new URLSearchParams({ fondo });
  return fonditosGet<FonditosFundDetail>(`/funds/detail?${q.toString()}`);
}

/**
 * Daily VCP history for a fund, looking back `days` calendar days.
 * Returns an array of { fecha, vcp, patrimonio, vcp_norm } sorted ascending.
 */
export async function fetchFundHistory(
  fondo: string,
  days: number,
): Promise<FonditosHistoryPoint[]> {
  const q = new URLSearchParams({ fondo, days: String(days) });
  const json = await fonditosGet<{ data: FonditosHistoryPoint[] }>(
    `/funds/history?${q.toString()}`,
  );
  return Array.isArray(json?.data) ? json.data : [];
}

/**
 * Return between two dates for one fund. Server-side calculation; we just
 * display the result. Days are computed by the API including weekends.
 */
export async function fetchReturnRange(
  fondo: string,
  from: string,
  to: string,
): Promise<FonditosReturnRangeRow | null> {
  const q = new URLSearchParams({ from, to });
  q.append("funds[]", fondo);
  const json = await fonditosGet<{ data: FonditosReturnRangeRow[] }>(
    `/funds/returns?${q.toString()}`,
  );
  return json?.data?.[0] ?? null;
}

/**
 * Strip a class suffix from a display name to recover the underlying fondo
 * name. Kept for compatibility with code that distinguishes "fondo" from
 * "fondo - clase X".
 */
export function fondoBaseName(displayName: string): string {
  return displayName.replace(/\s*-\s*Clase\s+.+$/i, "").trim();
}

/** Subtract N calendar days from an ISO YYYY-MM-DD date string. */
export function subtractDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * If an ISO date lands on a weekend, roll back to the previous Friday.
 * Mostly belt-and-braces — fonditos already returns business-day data.
 */
export function adjustForWeekend(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00Z");
  const day = d.getUTCDay();
  if (day === 0) return subtractDays(isoDate, 2);
  if (day === 6) return subtractDays(isoDate, 1);
  return isoDate;
}
