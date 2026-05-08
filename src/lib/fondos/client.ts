/**
 * Thin wrapper around the official CAFCI daily spreadsheet.
 *
 * Source: https://api.pub.cafci.org.ar/pb_get
 * Format: .xlsx (Excel 2007+), one sheet, ~4000 rows, ~900 KB
 * Update cadence: daily, post-close (CAFCI's own "Planilla Diaria A")
 *
 * Why this and not the legacy /fondo + /estadisticas API:
 *   The api.pub.cafci.org.ar/fondo endpoints stopped responding in April
 *   2026. The pb_get download remains public (it's the same link CAFCI's
 *   own consulta-de-fondos.html web uses for the "Descargar" button).
 *   No auth, no third-party intermediary, no rate limit observed.
 *
 * Why not fonditos.ar:
 *   They closed their public API in May 2026 — every data endpoint now
 *   requires commercial access.
 *
 * Be a good citizen:
 *   - Identify ourselves with a User-Agent.
 *   - Cache the parsed snapshot for 6 h in process memory (CAFCI publishes
 *     once per day; refreshing more often is wasteful).
 *   - Coalesce concurrent calls so we never download the file twice in
 *     parallel.
 */
import * as XLSX from "xlsx";

const PB_GET_URL = "https://api.pub.cafci.org.ar/pb_get";

/** Send the Referer CAFCI's own UI sends — they may filter on it later. */
const HEADERS: HeadersInit = {
  accept:
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*",
  referer: "https://www.cafci.org.ar/",
  "user-agent":
    "Monitor-FCIs-Amauta/1.0 (+https://monitor-fci-amauta.vercel.app)",
};

/** Abort the download if it stalls beyond this many ms. */
const REQUEST_TIMEOUT_MS = 30_000;

/** Hold the parsed snapshot for 6 h before re-fetching. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1_000;

/**
 * Raw row of the CAFCI daily spreadsheet, after we strip the cosmetic
 * header rows and section labels. Indices match column letters in the
 * Planilla Diaria; only the columns we use are typed.
 */
export interface CafciSheetRow {
  /** Display name including " - Clase X" suffix when applicable. */
  fondo: string;
  /** "ARS" | "USD" — currency for VCP/patrimonio. */
  moneda: string;
  /** Region code: "Arg" | "Mun" | "Br" | etc. */
  region: string;
  /** "Cor" | "Med" | "Lar". */
  horizonte: string;
  /** DD/MM/YY of the snapshot — same date for every row. */
  fechaDDMMYY: string;
  /** Valor cuotaparte today. */
  vcp: number;
  /** VCP yesterday — used to derive 1-day return without recomputation. */
  vcpAyer: number | null;
  /** Daily return % (already computed by CAFCI). */
  varDia: number | null;
  /** Reexpresado en pesos (handy for USD funds). */
  vcpReexpPesos: number | null;
  /** Return % since end of previous calendar month. */
  varMes: number | null;
  /** Return % since end of previous year (YTD). */
  varYTD: number | null;
  /** Return % since the same date 13 months ago (CAFCI's "1A" proxy). */
  var13M: number | null;
  /** Cantidad de cuotapartes hoy. */
  ccp: number | null;
  /** Patrimonio hoy (in fund currency). */
  patrimonio: number | null;
  /** Granular CAFCI category — comes from the section header above each block. */
  categoriaDetallada: string | null;

  /** Sociedad Depositaria (banco custodio). */
  sociedadDepositaria: string | null;
  /** Código CNV. */
  codigoCnv: string | null;
  /** Letter rating from a credit-rating agency. "A", "AAA", etc. */
  calificacion: string | null;
  /** Internal CAFCI fund ID. */
  codigoCafci: number | null;
  /** Sociedad Gerente (asset manager). */
  sociedadGerente: string | null;

  /** Annual mgmt fee % charged by the gerente. */
  honorariosGerente: number | null;
  /** Annual fee % charged by the depositaria. */
  honorariosDepositaria: number | null;
  /** Subscription commission %. */
  comIngreso: number | null;
  /** Redemption commission %. */
  comRescate: number | null;
  /** Misc operating expense % (CAFCI: "Gastos Ord Gestion"). */
  gastosGestion: number | null;
  /** "S" | "N" — whether the fund charges a performance fee. */
  honorariosExito: string | null;
  /** Settlement period (days) for redemptions. */
  plazoLiq: number | null;
}

/**
 * In-memory cache for the parsed spreadsheet.
 *
 * Why a module-level cache instead of the Next fetch Data Cache:
 *   The xlsx blob is ~900 KB and the parsed JSON would also be hefty —
 *   above the safe threshold of Next's Data Cache. We control the TTL
 *   ourselves and coalesce concurrent calls so a single cold start
 *   triggers exactly one download.
 */
let cache: { rows: CafciSheetRow[]; expiresAt: number } | null = null;
let inflight: Promise<CafciSheetRow[]> | null = null;

/** Parse a CAFCI percentage cell (sometimes a number, sometimes a string). */
function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

/**
 * Walk the raw sheet rows and produce one CafciSheetRow per fund class.
 *
 * Layout we handle:
 *   - Rows 0-7: cosmetic letterhead and column headers (skip).
 *   - Header row 7 has the column titles; row 8 has sub-titles like
 *     "Actual" / "29/04/26" — we use fixed column indices instead of
 *     parsing those headers because the sub-headers vary by date.
 *   - Section title rows: a single non-empty cell at column 0 with
 *     a category name like "Renta Variable Peso Argentina" — we track
 *     these and tag every following data row with that category until
 *     the next section header.
 *   - Data rows: column 0 has the fund name, column 4 has the date.
 *   - Footer rows: blank or repeat the letterhead — we skip rows where
 *     column 0 is empty AND column 4 has no date.
 */
function parseSheet(rows: unknown[][]): CafciSheetRow[] {
  const out: CafciSheetRow[] = [];
  let currentCategory: string | null = null;
  // Heuristic: data rows always have a date in column 4 in DD/MM/YY format.
  const DATE_RE = /^\d{2}\/\d{2}\/\d{2}$/;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const colA = str(r[0]);
    const colE = str(r[4]);

    if (!colA && !colE) continue;

    // Section header row: only column A has content, no date in E.
    if (colA && !colE) {
      // Skip the cosmetic CAFCI letterhead rows up top.
      if (i < 8) continue;
      currentCategory = colA;
      continue;
    }

    // Data row: column A is fund name, column E is the snapshot date.
    if (colA && colE && DATE_RE.test(colE)) {
      out.push({
        fondo: colA,
        moneda: str(r[1]) ?? "ARS",
        region: str(r[2]) ?? "",
        horizonte: str(r[3]) ?? "",
        fechaDDMMYY: colE,
        vcp: num(r[5]) ?? 0,
        vcpAyer: num(r[6]),
        varDia: num(r[7]),
        vcpReexpPesos: num(r[8]),
        varMes: num(r[9]),
        varYTD: num(r[10]),
        var13M: num(r[11]),
        ccp: num(r[12]),
        patrimonio: num(r[14]),
        categoriaDetallada: currentCategory,

        sociedadDepositaria: str(r[17]),
        codigoCnv: str(r[18]),
        calificacion: str(r[19]),
        codigoCafci: num(r[20]),
        sociedadGerente: str(r[23]),

        comIngreso: num(r[29]),
        honorariosGerente: num(r[30]),
        honorariosDepositaria: num(r[31]),
        gastosGestion: num(r[32]),
        comRescate: num(r[33]),
        honorariosExito: str(r[35]),
        plazoLiq: num(r[37]),
      });
    }
  }

  return out;
}

/** Download + parse the CAFCI daily spreadsheet. */
async function downloadAndParse(): Promise<CafciSheetRow[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    // Cache-bust like CAFCI's own site does.
    const url = `${PB_GET_URL}?d=${Date.now()}`;
    res = await fetch(url, {
      headers: HEADERS,
      // No Next data cache — the blob is too large; we cache parsed rows in process memory instead.
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    console.error("[cafci] network error fetching pb_get:", e);
    throw e;
  }
  clearTimeout(timer);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      `[cafci] HTTP ${res.status} for pb_get — body: ${body.slice(0, 200)}`,
    );
    throw new Error(`CAFCI pb_get → HTTP ${res.status}`);
  }

  const ab = await res.arrayBuffer();
  const wb = XLSX.read(ab, { type: "array", cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new Error("CAFCI pb_get → empty workbook");
  }
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw: true,
  });
  return parseSheet(rows);
}

/**
 * Get the current snapshot, possibly from in-memory cache.
 * Concurrent callers wait for the first download to finish.
 */
export async function fetchCafciSnapshot(): Promise<CafciSheetRow[]> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.rows;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const rows = await downloadAndParse();
      cache = { rows, expiresAt: Date.now() + CACHE_TTL_MS };
      return rows;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Strip a class suffix from a CAFCI display name. */
export function fondoBaseName(displayName: string): string {
  return displayName.replace(/\s*-\s*Clase\s+.+$/i, "").trim();
}

/** "DD/MM/YY" (CAFCI) → "YYYY-MM-DD" (ISO). */
export function cafciDateToIso(dmy: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(dmy);
  if (!m) return dmy;
  const yyyy = 2000 + parseInt(m[3], 10);
  return `${yyyy}-${m[2]}-${m[1]}`;
}
