/**
 * Wrappers around the CAFCI estadisticas subdomain — the *other* public
 * surface besides `pb_get`. Used by the weekly cron to enrich our daily
 * snapshot with fund metadata + portfolio composition.
 *
 * Two endpoints:
 *   1. Catalog JSON (~2.7 MB, 1.137 fondos with metadata + clase IDs):
 *      https://estadisticas.cafci.org.ar/consulta-de-fondos.json
 *
 *   2. Per-fund HTML ficha — the composition of cartera lives in a single
 *      `data-pie-chart-items-value` attribute as JSON:
 *      https://estadisticas.cafci.org.ar/fondos/{fondoId}?clase={claseId}
 *
 *      Cartera is per-fondo, not per-clase, so we just hit one clase and
 *      attribute the result to the parent fondo.
 *
 * Both endpoints are public and don't require auth or cookies — just a
 * regular browser User-Agent.
 */

const BASE = "https://estadisticas.cafci.org.ar";
const CATALOG_URL = `${BASE}/consulta-de-fondos.json`;
const TIMEOUT_MS = 15_000;

const HEADERS: HeadersInit = {
  accept: "application/json,text/html,*/*",
  "user-agent":
    "Monitor-FCIs-Amauta/1.0 (+https://monitor-fci-amauta.vercel.app)",
};

// ─── Catalog JSON ────────────────────────────────────────────────────────────

export interface CafciCatalogTipoRenta {
  id: number;
  nombre: string;
}

export interface CafciCatalogClase {
  id: number;
  nombre: string;
  /** May or may not be present per CAFCI feed. */
  tipo_clase?: string | null;
  comision_admin?: number | string | null;
  comision_ingreso?: number | string | null;
  comision_rescate?: number | string | null;
  monto_minimo?: number | string | null;
}

export interface CafciCatalogFondo {
  id: number;
  nombre: string;
  codigo_cnv?: string | null;
  estado?: string | null;
  objetivo?: string | null;
  inicio?: string | null;
  mm_puro?: boolean | null;
  sociedad_gerente?: { id: number; nombre: string } | string | null;
  sociedad_depositaria?: { id: number; nombre: string } | string | null;
  moneda?: { id: number; nombre: string } | string | null;
  tipo_renta?: CafciCatalogTipoRenta | null;
  region?: { id: number; nombre: string } | string | null;
  duration?: { id: number; nombre: string } | string | null;
  benchmark?: { id: number; nombre: string } | string | null;
  horizonte?: { id: number; nombre: string } | string | null;
  clases?: CafciCatalogClase[];
}

export interface CafciCatalog {
  generated_at: string;
  total_fondos: number;
  total_clases: number;
  filtros?: { tipo_renta?: CafciCatalogTipoRenta[] };
  fondos: CafciCatalogFondo[];
}

export async function fetchCafciCatalog(): Promise<CafciCatalog> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(CATALOG_URL, {
      headers: HEADERS,
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`CAFCI catalog → HTTP ${res.status}`);
    }
    return (await res.json()) as CafciCatalog;
  } finally {
    clearTimeout(timer);
  }
}

/** Helper to flatten the nested `{ id, nombre }` shape that some fields use. */
function nameOf(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "object" && v !== null && "nombre" in v) {
    const n = (v as { nombre?: unknown }).nombre;
    if (typeof n === "string") return n.trim() || null;
  }
  return null;
}

/**
 * Build (codigo_cafci_clase → metadata) rows ready to upsert in fci_fondo_meta.
 * One row per CLASE (PK = codigo_cafci_clase), all classes of the same fund
 * inherit the fund-level fields.
 */
export interface FondoMetaRow {
  codigo_cafci_clase: number;
  fondo_id: number;
  fondo_nombre: string;
  clase_nombre: string;
  tipo_renta_id: number | null;
  tipo_renta_nombre: string | null;
  mm_puro: boolean | null;
  region: string | null;
  benchmark: string | null;
  duration: string | null;
  horizonte: string | null;
  inicio: string | null;
}

export function flattenCatalogToMetaRows(
  catalog: CafciCatalog,
): FondoMetaRow[] {
  const out: FondoMetaRow[] = [];
  for (const f of catalog.fondos ?? []) {
    if (typeof f.id !== "number" || !f.nombre) continue;
    const tipoRentaId = f.tipo_renta?.id ?? null;
    const tipoRentaNombre = f.tipo_renta?.nombre ?? null;
    const region = nameOf(f.region);
    const benchmark = nameOf(f.benchmark);
    const duration = nameOf(f.duration);
    const horizonte = nameOf(f.horizonte);
    const inicio = typeof f.inicio === "string" ? f.inicio.slice(0, 10) : null;
    const mm = typeof f.mm_puro === "boolean" ? f.mm_puro : null;
    for (const c of f.clases ?? []) {
      if (typeof c.id !== "number" || !c.nombre) continue;
      out.push({
        codigo_cafci_clase: c.id,
        fondo_id: f.id,
        fondo_nombre: f.nombre,
        clase_nombre: c.nombre,
        tipo_renta_id: tipoRentaId,
        tipo_renta_nombre: tipoRentaNombre,
        mm_puro: mm,
        region,
        benchmark,
        duration,
        horizonte,
        inicio,
      });
    }
  }
  return out;
}

// ─── Ficha HTML — composition extraction ────────────────────────────────────

export interface CarteraHolding {
  rank: number; // 1 = mayor share
  activo: string; // "Lecer X15Y6", "Resto de Activos"
  tipo_activo: string; // "Lecer" | "Boncer" | "Lecap" | "Caucion" | ...
  share: number; // 28.10
}

/**
 * Scrape one fund's portfolio composition from its public CAFCI page.
 * Throws on HTTP error or if the pie chart attribute is not found.
 */
export async function fetchCarteraFondo(
  fondoId: number,
  claseId: number,
): Promise<CarteraHolding[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let html: string;
  try {
    const res = await fetch(
      `${BASE}/fondos/${fondoId}?clase=${claseId}`,
      { headers: HEADERS, cache: "no-store", signal: controller.signal },
    );
    if (!res.ok) {
      throw new Error(
        `ficha ${fondoId}/${claseId} → HTTP ${res.status}`,
      );
    }
    html = await res.text();
  } finally {
    clearTimeout(timer);
  }
  return parseCarteraFromHtml(html);
}

/**
 * Pull `data-pie-chart-items-value="..."` out of the HTML, decode the HTML
 * entities, and parse the JSON. Public so it can be unit-tested in isolation.
 */
export function parseCarteraFromHtml(html: string): CarteraHolding[] {
  const m = /data-pie-chart-items-value="([^"]+)"/.exec(html);
  if (!m) return [];
  // CAFCI's ERB encodes embedded quotes as &quot;.
  const json = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  let arr: Array<{ nombre?: unknown; porcentaje?: unknown }>;
  try {
    arr = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: CarteraHolding[] = [];
  let rank = 0;
  for (const item of arr) {
    if (!item || typeof item.nombre !== "string") continue;
    const share = typeof item.porcentaje === "number" ? item.porcentaje : null;
    if (share == null) continue;
    rank += 1;
    out.push({
      rank,
      activo: item.nombre.trim(),
      tipo_activo: classifyActivo(item.nombre),
      share,
    });
  }
  return out;
}

// ─── Activo classifier ──────────────────────────────────────────────────────

/**
 * Bucket an activo by ticker / name into a coarse type. Used to (a) display
 * a colored badge in the UI and (b) feed the strategy classifier.
 *
 * Buckets (Argentine FCI portfolios in 2025-2026):
 *   - Lecer       — Letras CER (ajustables por inflación, cortas)
 *   - Boncer      — Bonos CER (TX26, TZX0, TZXO6, DICP, Discount)
 *   - Lecap       — Letras Capitalizables tasa fija pesos
 *   - Bonte       — Bonos del Tesoro / duales (TTJ, TTS, S30A6, etc.)
 *   - Dólar Linked — bonos ajustables al tipo de cambio oficial (TV24, etc.)
 *   - Hard USD    — soberanos USD (AL30, GD30, Globales) + bonos corporativos
 *                   USD/BRL (BC Itau, BC Brasil, ON Arcor, ON YPF USD)
 *   - Plazo Fijo  — depósitos a plazo en bancos (CAFCI: "Pzo Fi $ Bco X")
 *   - Cta Cte     — cuenta corriente remunerada (CAFCI: "Cta Cte $ Bco X")
 *   - Caución     — cauciones bursátiles
 *   - ON          — Obligaciones Negociables (ARS o USD genérico)
 *   - Cheque      — cheques de pago diferido y pagarés MAV
 *   - FCI         — cuotapartes de otro FCI (fund of funds)
 *   - Acciones    — equity local / Cedears
 *   - Resto       — la categoría agregada que CAFCI mete al final del top-N
 *   - Otros       — todo lo que no encaja
 */
export function classifyActivo(nombre: string): string {
  const n = nombre.toLowerCase().trim();

  if (/\bresto\s+de\s+activos\b/.test(n)) return "Resto";

  // Cash & equivalents (must come before "letra" / "bono" matchers
  // because some "Pzo Fi" entries include bank names that could collide).
  if (/\bp(?:z|l)o\.?\s*fi(?:jo)?\b|\bplazo\s+fijo\b|^pf\s/.test(n))
    return "Plazo Fijo";
  if (/\bcta\s*cte\b|\bcuenta\s+corriente\b/.test(n)) return "Cta Cte";
  if (/\bcauci/.test(n)) return "Caución";
  if (/\bcheque|\bpagar[eé]\b|\bmav\b/.test(n)) return "Cheque";

  // Soberanos ARS — CER ajustables.
  if (/\bdicp\b|\bdiscount\s+ars\b|\bbono\s+discount\b/.test(n)) return "Boncer";
  if (/\bboncer\b|\btx\d+|\btzx[a-z]?\d*|\btzxo/.test(n)) return "Boncer";
  if (/\blecer\b/.test(n)) return "Lecer";

  // Soberanos ARS — duales y tasa fija.
  // Letras Capitalizables: S15Y6, S30A6, T30J6, S30N6 (CAFCI a veces antepone "Lecap S...").
  if (/\blecap\b/.test(n)) return "Lecap";
  // Bono Dual del Tesoro: TTJ26, TTS26, TTM26 (cubren tasa fija o CER, lo más alto).
  if (/\bbono\s+dual\b|\btt[a-z]\d/.test(n)) return "Bonte";
  // Bonte/Bote nuevos: T-prefijo numérico-letra-año (ej. T30J6) o BONTE explícito.
  if (/\bbonte\b|\bbote\b|\bs\d{2}[a-z]\d\b|\bt\d{2}[a-z]\d\b/.test(n))
    return "Bonte";

  // Dólar Linked.
  if (/\bd[oó]lar\s*linked\b|\blinked\b|\btv\d{2}\b|\bt2v\d\b|\bd2v\d\b/.test(n))
    return "Dólar Linked";

  // Hard USD: soberanos + Globales + bonos corporativos USD/BRL/internacionales.
  if (
    /\bal\d{2}[a-z]?\b|\bgd\d{2}[a-z]?\b|\bglobal\b|\bbonar\b|\bbpoa\b|\bbpd\d+/.test(
      n,
    )
  )
    return "Hard USD";
  // Bonos Corporativos: CAFCI usa prefijos "BC " (Bono Corporativo) seguido del emisor.
  // Suelen ser USD/BRL/internacional y rara vez ARS.
  if (/^bc\s|\bbono\s+corporativo\b/.test(n)) return "Hard USD";

  // ON (Obligaciones Negociables).
  if (/\bobligaci[oó]n|^on\s/.test(n)) return "ON";

  // FCI cuotapartes.
  if (/\bfci\b|^cuotapart|^cta\s+fci/.test(n)) return "FCI";

  // Acciones / equity.
  if (/\bacci[oó]n|\bequity\b|\bcedear/.test(n)) return "Acciones";

  return "Otros";
}
