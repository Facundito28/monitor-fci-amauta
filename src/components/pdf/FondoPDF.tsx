/**
 * Amauta-branded PDF report for a single FCI class.
 * Rendered server-side via @react-pdf/renderer in the /api/fondo/pdf route.
 *
 * Layout:
 *   1. Dark header — fund name, gestora, badges, date
 *   2. KPI row     — VCP, AUM, cuotapartes, hon. gerente
 *   3. Rendimientos table (simple % + TNA)
 *   4. Estadísticas de riesgo (volatilidad, sharpe) when available
 *   5. Honorarios row (when available)
 *   6. Absolute footer — CNV disclaimer
 */
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { EnrichedRow, FondoDetalle } from "@/lib/fondos/enriched";

// ─── Colour palette ──────────────────────────────────────────────────────────
const C = {
  dark:          "#231F20",
  bordo:         "#621044",
  yellow:        "#F3CF11",
  bgLight:       "#F5F4EE",
  border:        "#E8E3D8",
  textPrimary:   "#231F20",
  textSecondary: "#4B5563",
  textTertiary:  "#9CA3AF",
  white:         "#FFFFFF",
  green:         "#059669",
  red:           "#DC2626",
};

// ─── Inline formatters (no browser Intl needed) ───────────────────────────
function fmtN(v: number | null | undefined, dec = 2): string {
  if (v == null || isNaN(Number(v))) return "—";
  const n = Number(v);
  const fixed = n.toFixed(dec);
  const [int, frac] = fixed.split(".");
  const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return dec > 0 ? `${intFormatted},${frac}` : intFormatted;
}

function fmtRet(v: number | null | undefined): { text: string; color: string } {
  if (v == null || isNaN(Number(v))) return { text: "—", color: C.textTertiary };
  const n = Number(v);
  const sign = n >= 0 ? "+" : "";
  return {
    text: `${sign}${fmtN(n)}%`,
    color: n > 0 ? C.green : n < 0 ? C.red : C.textSecondary,
  };
}

function fmtCompact(v: number | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (n >= 1_000_000_000_000) return `$${(n / 1_000_000_000_000).toFixed(1)} B`;
  if (n >= 1_000_000_000)     return `$${(n / 1_000_000_000).toFixed(1)} M`;
  if (n >= 1_000_000)         return `$${(n / 1_000_000).toFixed(1)} K`;
  return `$${fmtN(n, 0)}`;
}

function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function fmtPctNum(n: number | null | undefined): string {
  return n != null && !isNaN(n) ? `${n.toFixed(2)}%` : "—";
}

// ─── Prop types ──────────────────────────────────────────────────────────────
export interface FondoPDFProps {
  fondo: EnrichedRow;
  detalle: FondoDetalle | null;
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.textPrimary,
    backgroundColor: C.white,
  },

  // Header
  header: {
    backgroundColor: C.dark,
    paddingHorizontal: 40,
    paddingTop: 26,
    paddingBottom: 22,
  },
  badgeRow: {
    flexDirection: "row",
    marginBottom: 10,
  },
  badge: {
    backgroundColor: C.yellow,
    color: C.dark,
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 3,
    marginRight: 5,
  },
  badgeOutline: {
    borderWidth: 1,
    borderColor: "#FFFFFF50",
    color: "#FFFFFFBB",
    fontSize: 6.5,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 3,
    marginRight: 5,
  },
  headerTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 17,
    color: C.white,
    lineHeight: 1.2,
  },
  headerGestora: {
    fontSize: 9,
    color: "#FFFFFFAA",
    marginTop: 4,
  },
  headerBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 14,
  },
  headerBrand: {
    fontSize: 8,
    color: "#FFFFFF70",
    letterSpacing: 0.8,
  },
  headerDateLabel: {
    fontSize: 7,
    color: "#FFFFFF60",
    textAlign: "right",
  },
  headerDate: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: C.yellow,
    textAlign: "right",
  },

  // Body
  body: {
    paddingHorizontal: 40,
    paddingTop: 22,
    paddingBottom: 64,
  },

  // KPI row
  kpiRow: {
    flexDirection: "row",
    marginBottom: 20,
  },
  kpiBox: {
    flex: 1,
    backgroundColor: C.bgLight,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginRight: 7,
  },
  kpiBoxLast: {
    marginRight: 0,
  },
  kpiLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    color: C.textTertiary,
    marginBottom: 5,
  },
  kpiValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: C.bordo,
  },

  // Section wrapper
  section: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 5,
    marginBottom: 16,
    overflow: "hidden",
  },
  sectionHead: {
    backgroundColor: C.dark,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionHeadTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: C.white,
    letterSpacing: 0.8,
  },
  sectionHeadSub: {
    fontSize: 6.5,
    color: "#FFFFFF60",
  },

  // Table
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: C.bgLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  th: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    color: C.textTertiary,
  },
  tableRow: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F0ECE4",
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  td: {
    fontSize: 9,
    color: C.textSecondary,
  },
  tdBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },

  // Honorarios
  honorRow: {
    flexDirection: "row",
  },
  honorCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  honorCellLast: {
    borderRightWidth: 0,
  },
  honorLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    color: C.textTertiary,
    marginBottom: 4,
  },
  honorValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: C.bordo,
  },

  // Footer
  footer: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 7,
  },
  footerText: {
    fontSize: 6.5,
    color: C.textTertiary,
    lineHeight: 1.5,
  },
});

// ─── Sub-components ──────────────────────────────────────────────────────────

function KpiBox({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[s.kpiBox, last ? s.kpiBoxLast : {}]}>
      <Text style={s.kpiLabel}>{label.toUpperCase()}</Text>
      <Text style={s.kpiValue}>{value}</Text>
    </View>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={s.sectionHead}>
      <Text style={s.sectionHeadTitle}>{title.toUpperCase()}</Text>
      {sub && <Text style={s.sectionHeadSub}>{sub}</Text>}
    </View>
  );
}

function RetRow({
  label,
  simple,
  tna,
  last = false,
}: {
  label: string;
  simple: number | null | undefined;
  tna: number | null | undefined;
  last?: boolean;
}) {
  const sf = fmtRet(simple);
  const tf = fmtRet(tna);
  return (
    <View style={[s.tableRow, last ? s.tableRowLast : {}]}>
      <Text style={[s.td, { flex: 2 }]}>{label}</Text>
      <Text style={[s.tdBold, { flex: 1, textAlign: "right", color: sf.color }]}>
        {sf.text}
      </Text>
      <Text style={[s.tdBold, { flex: 1, textAlign: "right", color: tf.color, fontSize: 8 }]}>
        {tf.text}
      </Text>
    </View>
  );
}

// ─── Main document ───────────────────────────────────────────────────────────

export function FondoPDF({ fondo, detalle }: FondoPDFProps) {
  const tienHonorarios =
    fondo.feeGestion != null ||
    fondo.feeDepositaria != null ||
    fondo.comIngreso != null ||
    fondo.comRescate != null;

  const tienEstadisticas =
    detalle != null && (detalle.volatilidad != null || detalle.sharpe != null);

  const ret7d = detalle?.rend7d ?? null;
  const tna7d = ret7d != null ? ret7d * (365 / 7) : null;

  return (
    <Document
      title={fondo.displayName}
      author="Amauta Inversiones Financieras"
      subject="Ficha de Fondo Comun de Inversion"
    >
      <Page size="A4" style={s.page}>

        {/* ── HEADER ────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View style={s.badgeRow}>
            {fondo.categoria && (
              <Text style={s.badge}>{fondo.categoria}</Text>
            )}
            {fondo.horizonte && (
              <Text style={s.badgeOutline}>{fondo.horizonte}</Text>
            )}
            {fondo.moneda && (
              <Text style={s.badgeOutline}>{fondo.moneda}</Text>
            )}
            {fondo.calificacion && (
              <Text style={s.badgeOutline}>{fondo.calificacion}</Text>
            )}
          </View>

          <Text style={s.headerTitle}>{fondo.displayName}</Text>
          {fondo.gestora && (
            <Text style={s.headerGestora}>{fondo.gestora}</Text>
          )}

          <View style={s.headerBottom}>
            <Text style={s.headerBrand}>AMAUTA  ·  Monitor FCIs</Text>
            <View>
              <Text style={s.headerDateLabel}>Cierre</Text>
              <Text style={s.headerDate}>{fmtDate(fondo.fecha)}</Text>
            </View>
          </View>
        </View>

        {/* ── BODY ──────────────────────────────────────────────────── */}
        <View style={s.body}>

          {/* KPI row */}
          <View style={s.kpiRow}>
            <KpiBox label="VCP" value={fmtN(fondo.vcp, 4)} />
            <KpiBox label="Patrimonio (AUM)" value={fmtCompact(fondo.patrimonio)} />
            <KpiBox
              label="Cuotapartes"
              value={fondo.ccp ? fmtN(fondo.ccp, 0) : "—"}
            />
            <KpiBox
              label="Hon. Gerente"
              value={fmtPctNum(fondo.feeGestion)}
              last
            />
          </View>

          {/* ── Rendimientos ── */}
          <View style={s.section}>
            <SectionHeader title="Rendimientos Historicos" />

            <View style={s.tableHeaderRow}>
              <Text style={[s.th, { flex: 2 }]}>PERIODO</Text>
              <Text style={[s.th, { flex: 1, textAlign: "right" }]}>RENDIMIENTO</Text>
              <Text style={[s.th, { flex: 1, textAlign: "right" }]}>TNA</Text>
            </View>

            <RetRow
              label="Del dia (1D)"
              simple={fondo.ret1d}
              tna={fondo.tna1d}
            />
            <RetRow
              label="Semanal (7D)"
              simple={ret7d}
              tna={tna7d}
            />
            <RetRow
              label="Del mes (30D)"
              simple={fondo.ret30d}
              tna={fondo.tna30d}
            />
            <RetRow
              label="Del ano (YTD)"
              simple={fondo.ytd}
              tna={null}
            />
            <RetRow
              label="Interanual (1A)"
              simple={fondo.ret1a}
              tna={fondo.tna1a}
              last
            />
          </View>

          {/* ── Estadisticas ── */}
          {tienEstadisticas && (
            <View style={s.section}>
              <SectionHeader title="Estadisticas de Riesgo" />
              <View style={s.honorRow}>
                <View style={s.honorCell}>
                  <Text style={s.honorLabel}>VOLATILIDAD</Text>
                  <Text style={s.honorValue}>
                    {detalle!.volatilidad != null
                      ? `${(detalle!.volatilidad * 100).toFixed(2)}%`
                      : "—"}
                  </Text>
                </View>
                <View style={s.honorCell}>
                  <Text style={s.honorLabel}>SHARPE</Text>
                  <Text style={s.honorValue}>
                    {detalle!.sharpe != null
                      ? detalle!.sharpe.toFixed(2)
                      : "—"}
                  </Text>
                </View>
                <View style={s.honorCell}>
                  <Text style={s.honorLabel}>DIAS HISTORICO</Text>
                  <Text style={s.honorValue}>
                    {detalle!.diasHistorico != null
                      ? detalle!.diasHistorico.toString()
                      : "—"}
                  </Text>
                </View>
                <View style={[s.honorCell, s.honorCellLast]}>
                  <Text style={s.honorLabel}>INICIO HISTORICO</Text>
                  <Text style={s.honorValue}>
                    {detalle!.fechaInicio
                      ? fmtDate(detalle!.fechaInicio)
                      : "—"}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* ── Honorarios ── */}
          {tienHonorarios && (
            <View style={s.section}>
              <SectionHeader title="Honorarios y Comisiones" />
              <View style={s.honorRow}>
                <View style={s.honorCell}>
                  <Text style={s.honorLabel}>HON. GERENTE</Text>
                  <Text style={s.honorValue}>
                    {fmtPctNum(fondo.feeGestion)}
                  </Text>
                </View>
                <View style={s.honorCell}>
                  <Text style={s.honorLabel}>HON. DEPOSITARIA</Text>
                  <Text style={s.honorValue}>
                    {fmtPctNum(fondo.feeDepositaria)}
                  </Text>
                </View>
                <View style={s.honorCell}>
                  <Text style={s.honorLabel}>COM. INGRESO</Text>
                  <Text style={s.honorValue}>
                    {fmtPctNum(fondo.comIngreso)}
                  </Text>
                </View>
                <View style={[s.honorCell, s.honorCellLast]}>
                  <Text style={s.honorLabel}>COM. RESCATE</Text>
                  <Text style={s.honorValue}>
                    {fmtPctNum(fondo.comRescate)}
                  </Text>
                </View>
              </View>
            </View>
          )}

        </View>

        {/* ── FOOTER ────────────────────────────────────────────────── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            Este material es preparado por Amauta Inversiones Financieras (Matricula CNV 1029) con fines informativos
            y no constituye una recomendacion de inversion. Rentabilidades pasadas no garantizan resultados futuros.
            Datos provistos por CAFCI via fonditos.ar — verificar siempre con la fuente oficial (cafci.org.ar).
          </Text>
        </View>

      </Page>
    </Document>
  );
}
