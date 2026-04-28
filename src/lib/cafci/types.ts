/**
 * CAFCI public API types — minimal subset for our use cases.
 * Source: https://api.pub.cafci.org.ar
 */

export interface CafciResponse<T> {
  success: boolean;
  data: T;
  page?: number;
  lastPage?: number;
}

export interface TipoRenta {
  id: string;
  nombre: string;
  codigoCafci: string;
}

export interface Entidad {
  id: string;
  nombre: string;
  nombreCorto: string;
  cuit?: string;
  miembro?: boolean;
  tipos?: Array<{ id: string; nombre: string }>;
}

/**
 * One row of /estadisticas/informacion/diaria/{categoriaId}/{fecha}.
 *
 * The endpoint mixes aggregates (no `fecha` field) with per-class records
 * (have `fecha` like "DD/MM/YY"). Filter to those where fecha is set.
 */
export interface DailyStatRow {
  /** Display name from CAFCI: either "Fondo X" or "Fondo X - Clase A". */
  fondo: string;
  /** Date in DD/MM/YY format. */
  fecha: string;
  /** "COR" / "MED" / "LAR". */
  horizonte: string;
  /** Valor cuotaparte. */
  vcp: number;
  /** Cantidad de cuotapartes — empty string when missing. */
  ccp: number | string;
  /** AUM in pesos — empty string when missing. */
  patrimonio: number | string;
}

/**
 * Latest snapshot for the whole market: combined daily stats across all
 * categories for a single business date.
 */
export interface LatestSnapshot {
  /** ISO YYYY-MM-DD of the snapshot. */
  fecha: string;
  /** All per-class records across all categories on that date. */
  rows: DailyStatRow[];
}

/**
 * One clase within a Fondo, as returned by include=clase_fondo.
 * GET /fondo?include=clase_fondo
 */
export interface ClaseFondo {
  id: string;
  nombre: string;
  tipoClaseId: string;
}

/**
 * One holding in a fund's portfolio cartera.
 * From GET /fondo/{fondoId}/clase/{claseId}/ficha
 * → .data.info.semanal.carteras[]
 */
export interface CartHolding {
  nombreActivo: string;
  tipoActivo?: string;
  /** Portfolio weight as percentage (0–100). */
  share: number;
}

/**
 * Rendimiento entry for a single time window from the ficha endpoint.
 * Values are TNA percentages (e.g. 65.5 means 65.5% TNA).
 */
export interface FichaRendimiento {
  tna: number;
  tea?: number;
  simple?: number;
}

/**
 * Core data returned by GET /fondo/{fondoId}/clase/{claseId}/ficha
 * Shape: { success: true, data: FichaData }
 */
export interface FichaData {
  info: {
    diaria: {
      actual: {
        patrimonio: number;
        fecha: string;
        vcp?: number;
      };
      rendimientos: {
        day?: FichaRendimiento;
        week?: FichaRendimiento;
        month?: FichaRendimiento;
        yearToDate?: FichaRendimiento;
        oneYear?: FichaRendimiento;
        threeYear?: FichaRendimiento;
        fiveYear?: FichaRendimiento;
      };
    };
    semanal?: {
      carteras?: CartHolding[];
    };
    mensual?: {
      honorariosComisiones?: {
        honorariosAdministracionGerente?: string;
        honorariosAdministracionDepositaria?: string;
        comisionIngreso?: string;
        comisionRescate?: string;
      };
    };
  };
}

/**
 * Fondo as returned by /fondo?include=tipoRenta,clase_fondo
 * Foreign key IDs come as strings.
 */
export interface Fondo {
  id: string;
  nombre: string;
  estado: string;
  tipoRentaId: string;
  monedaId: string;
  regionId: string;
  benchmarkId: string;
  horizonteId: string;
  durationId: string;
  sociedadGerenteId: string;
  sociedadDepositariaId: string;
  tipoFondoId: string;
  tipoRentaMixtaId: string | null;
  inicio: string;
  /** Legacy human-readable fields, often the easiest source. */
  clasificacionVieja?: string;
  regionVieja?: string;
  horizonteViejo?: string;
  /** Resolved when fetched with include=tipoRenta */
  tipoRenta?: TipoRenta;
  /** Resolved when fetched with include=clase_fondo */
  clase_fondos?: ClaseFondo[];
}

/**
 * @deprecated Replaced by CartHolding + getFondoFicha().
 * Kept for backwards compat — remove once composition is fully migrated.
 */
export interface CarteraRow {
  fondo: string;
  nombreActivo: string;
  tipoActivo?: string;
  porcentaje: number;
}
