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
 * Fondo as returned by /fondo?include=tipoRenta
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
}
