/**
 * fonditos.ar public API types.
 * Source: https://fonditos-api.gonzagiardino.workers.dev/openapi.json
 */

/** One row of GET /funds — bulk daily snapshot. */
export interface FonditosFund {
  id: number;
  /** Display name including class suffix when applicable. */
  name: string;
  /** "A" | "B" | "C" | "Única" | ... */
  fundClass: string;
  manager: string;
  managerType: "BANK" | "INDEPENDENT" | string;
  /** Detailed CAFCI category, e.g. "MONEY MARKET ARS CLÁSICO". */
  category: string;
  /** Coarse macro bucket, e.g. "MONEY MARKET", "RENTA FIJA". */
  macroCategory: string;
  /** "COR" | "MED" | "LAR". */
  horizon: string;
  region: string;
  benchmark: string;
  /** "ARS" | "USD". */
  currency: string;
  /** ISO YYYY-MM-DD of this snapshot. */
  date: string;

  // Market data
  aum: number;
  aumARS: number;
  aumUSD: number;
  lastPrice: number;
  shareQuantity: number;

  // Returns — note: dailyReturn / monthlyReturn / ytdReturn / oneYearReturn
  // are decimal fractions (0.001 = 0.1%). `tna` already comes as a percentage.
  dailyReturn: number | null;
  monthlyReturn: number | null;
  ytdReturn: number | null;
  oneYearReturn: number | null;
  tna: number | null;

  // Net subscriptions in pesos (negative = net redemption)
  netSubs1D: number | null;
  netSubs30D: number | null;
  netSubsYTD: number | null;
  netSubs1Y: number | null;

  // Static info
  calificacion: string | null;
  /** Annual management fee as %, already a number (e.g. 1.94). */
  feeGestion: number | null;
  /** Annual depositary fee as %. */
  feeDepositaria: number | null;
  gastosGestion: number | null;
  comRescate: number | null;
  comIngreso: number | null;
  /** "S" | "N" — whether the fund charges a performance fee. */
  honExito: string | null;
  /** Days to settle a redemption. */
  plazoRescate: number | null;
}

/** GET /funds/detail?fondo=NAME — single fund with vol/sharpe/rend_7d. */
export interface FonditosFundDetail {
  fondo: string;
  datos_actuales: {
    id: number;
    fondo: string;
    categoria: string;
    fecha: string;
    vcp: number;
    ccp: number;
    patrimonio: number;
    horizonte: string;
    moneda: string;
    source: string;
    updated_at: number;
    calificacion: string | null;
    fee_gestion: number | null;
    fee_depositaria: number | null;
    gastos_gestion: number | null;
    com_rescate: number | null;
    com_ingreso: number | null;
    hon_exito: string | null;
    plazo_rescate: number | null;
  };
  /**
   * Returns are already percentages (e.g. rend_30d: 1.515 means 1.515%).
   * tna is also a percentage. volatilidad and sharpe are unitless.
   */
  metricas: {
    rend_7d: number | null;
    rend_30d: number | null;
    rend_90d: number | null;
    rend_ytd: number | null;
    rend_1y: number | null;
    tna: number | null;
    volatilidad: number | null;
    sharpe: number | null;
    dias_historico: number | null;
    fecha_inicio: string | null;
    fecha_fin: string | null;
  };
  historial_puntos: number;
}

/** Single point of GET /funds/history?fondo=NAME&days=N. */
export interface FonditosHistoryPoint {
  fecha: string;
  vcp: number;
  patrimonio: number;
  /** VCP normalised so the first point in the requested window equals 100. */
  vcp_norm: number;
}

/** Single row of GET /funds/returns?from=&to=&funds[]=NAME. */
export interface FonditosReturnRangeRow {
  fondo: string;
  input: string;
  categoria: string;
  fecha_from: string;
  fecha_to: string;
  vcp_from: number;
  vcp_to: number;
  /** Decimal fraction (0.014 = 1.4%). */
  return: number;
  /** Same value already as percentage (1.4565). */
  return_pct: number;
  /** TNA percentage (annualised over `dias`). */
  tna_pct: number;
  dias: number;
}

/** GET /health/sync. */
export interface FonditosHealth {
  ok: boolean;
  status: string;
  last_sync_date: string;
  funds_count: number;
  is_complete: boolean;
  minutes_ago: number;
  hours_ago: number;
  threshold: number;
}
