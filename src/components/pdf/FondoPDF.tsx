/**
 * Amauta-branded PDF report for a single FCI.
 * Rendered server-side via @react-pdf/renderer in /api/fondo/pdf route.
 *
 * Layout (BLOQUE 7 — A4, two pages cuando hace falta):
 *   Página 1:
 *     1. Header dark band — título, gestora, badges meta (estrategia +
 *        confianza dot + categoría + horizonte + región + benchmark + duration
 *        + calificación), fecha de cierre.
 *     2. KPI row — VCP / AUM total / Cuotapartes / Hon. Gerente (clase rep).
 *     3. "Cómo se clasificó este fondo" — pill con confianza + razón
 *        humano-legible. Crítico para auditabilidad.
 *     4. Composición de Cartera — pie chart SVG nativo + leyenda.
 *     5. Rendimientos Históricos — tabla 1D/MTD/YTD/13M con TNA.
 *   Página 2 (auto-break si hay clases):
 *     6. Clases del Fondo — tabla con honorarios por clase, fila destacada
 *        para la clase representativa.
 *     7. Footer absoluto con disclaimer CNV.
 */
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Path,
  Rect,
} from "@react-pdf/renderer";
import type { EnrichedRow, ClaseInfo, CartHolding } from "@/lib/fondos/enriched";
import type { Confianza } from "@/lib/fondos/estrategia";

// ─── Colour palette (designMD tokens hexadecimales) ─────────────────────────
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

// Color por nivel de confianza para el pill del bloque "clasificación".
const CONFIANZA_HEX: Record<Confianza, { bg: string; border: string; dot: string; text: string }> = {
  override: { bg: "#EFF6FF", border: "#BFDBFE", dot: "#3B82F6", text: "#1E40AF" },
  alta:     { bg: "#ECFDF5", border: "#A7F3D0", dot: "#10B981", text: "#065F46" },
  media:    { bg: "#FFFBEB", border: "#FDE68A", dot: "#F59E0B", text: "#92400E" },
  baja:     { bg: "#FFF7ED", border: "#FED7AA", dot: "#F97316", text: "#9A3412" },
  macro:    { bg: "#F8FAFC", border: "#E2E8F0", dot: "#94A3B8", text: "#475569" },
};

const CONFIANZA_LABEL: Record<Confianza, string> = {
  override: "Override manual",
  alta:     "Mandate",
  media:    "Tactical (tilt fuerte)",
  baja:     "Tactical (diversificado)",
  macro:    "Solo macro",
};

// Colores hex para el pie chart (espejo de TIPO_BAR_COLOR en la ficha web).
const TIPO_COLOR_HEX: Record<string, string> = {
  "Plazo Fijo":   "#34D399",  // emerald-400
  "Cta Cte":      "#6EE7B7",  // emerald-300
  "Caución":      "#2DD4BF",  // teal-400
  "Cheque":       "#5EEAD4",  // teal-300
  "Lecap":        "#3B82F6",  // blue-500
  "Bonte":        "#60A5FA",  // blue-400
  "Lecer":        "#A855F7",  // purple-500
  "Boncer":       "#C084FC",  // purple-400
  "Dólar Linked": "#FBBF24",  // amber-400
  "Hard USD":     "#06B6D4",  // cyan-500
  "ON":           "#818CF8",  // indigo-400
  "Acciones":     "#FB923C",  // orange-400
  "FCI":          "#F9A8D4",  // pink-300
  "Resto":        "#CBD5E1",  // slate-300
  "Otros":        "#94A3B8",  // slate-400
};

// ─── Inline formatters (no browser Intl needed) ─────────────────────────────
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

// ─── Pie chart helpers ──────────────────────────────────────────────────────

/**
 * Construye el path SVG de una porción de pie chart entre dos ángulos
 * (en grados, 0 = top, sentido horario).
 */
function piePath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  // Caso especial: porción de 100% no se dibuja con arc (degenera), usamos
  // círculo completo via dos arcos de 180.
  if (endDeg - startDeg >= 360) {
    return `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`;
  }
  const start = ((startDeg - 90) * Math.PI) / 180;
  const end = ((endDeg - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(start);
  const y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end);
  const y2 = cy + r * Math.sin(end);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

/**
 * Agrupa holdings por tipo_activo y suma share. Devuelve ordenado por share
 * descendente para que el pie quede ordenado de mayor a menor.
 */
function aggregateByTipo(
  holdings: CartHolding[],
): Array<{ tipo: string; share: number; color: string }> {
  const byTipo = new Map<string, number>();
  for (const h of holdings) {
    byTipo.set(h.tipo_activo, (byTipo.get(h.tipo_activo) ?? 0) + h.share);
  }
  return Array.from(byTipo.entries())
    .map(([tipo, share]) => ({
      tipo,
      share,
      color: TIPO_COLOR_HEX[tipo] ?? "#94A3B8",
    }))
    .sort((a, b) => b.share - a.share);
}

// ─── Prop types ─────────────────────────────────────────────────────────────
export interface FondoPDFProps {
  fondo: EnrichedRow;
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.textPrimary,
    backgroundColor: C.white,
  },

  // Header dark band
  header: {
    backgroundColor: C.dark,
    paddingHorizontal: 40,
    paddingTop: 26,
    paddingBottom: 22,
  },
  brandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 12,
  },
  brandLabel: {
    fontSize: 7,
    color: "#FFFFFF80",
    letterSpacing: 1.5,
    fontFamily: "Helvetica-Bold",
  },
  closeLabel: {
    fontSize: 6.5,
    color: "#FFFFFF60",
    textAlign: "right",
  },
  closeDate: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: C.yellow,
    textAlign: "right",
  },
  headerTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    color: C.white,
    lineHeight: 1.2,
  },
  headerSub: {
    fontSize: 9,
    color: "#FFFFFFAA",
    marginTop: 4,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
  },
  badgeYellow: {
    backgroundColor: C.yellow,
    color: C.dark,
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 3,
    marginRight: 5,
    marginBottom: 3,
  },
  badgeOutline: {
    borderWidth: 0.7,
    borderColor: "#FFFFFF50",
    color: "#FFFFFFBB",
    fontSize: 6.5,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 3,
    marginRight: 5,
    marginBottom: 3,
  },

  // Body
  body: {
    paddingHorizontal: 40,
    paddingTop: 18,
    paddingBottom: 64,
  },

  // KPI row
  kpiRow: {
    flexDirection: "row",
    marginBottom: 14,
  },
  kpiBox: {
    flex: 1,
    backgroundColor: C.bgLight,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginRight: 6,
  },
  kpiBoxLast: {
    marginRight: 0,
  },
  kpiLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6,
    color: C.textTertiary,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    color: C.bordo,
  },

  // Clasificación block
  classBlock: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  classRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 5,
  },
  classLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginRight: 8,
  },
  classPill: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 0.7,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  classDot: {
    width: 5,
    height: 5,
    borderRadius: 99,
    marginRight: 4,
  },
  classPillText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  classRazon: {
    fontSize: 8.5,
    color: C.textSecondary,
    lineHeight: 1.4,
  },
  classStrong: {
    fontFamily: "Helvetica-Bold",
    color: C.textPrimary,
  },

  // Section wrapper
  section: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 3,
    marginBottom: 14,
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

  // Composición — pie + legend
  composBody: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pieContainer: {
    width: 130,
    height: 130,
    marginRight: 14,
  },
  legend: {
    flex: 1,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
  },
  legendSwatch: {
    width: 9,
    height: 9,
    borderRadius: 2,
    marginRight: 6,
  },
  legendTipo: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: C.textPrimary,
    flex: 1,
  },
  legendShare: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: C.bordo,
    textAlign: "right",
  },

  // Table generic
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
    textTransform: "uppercase",
    letterSpacing: 0.4,
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
  tableRowHighlight: {
    backgroundColor: "#FEF9E0",
    borderLeftWidth: 2,
    borderLeftColor: C.yellow,
  },
  td: {
    fontSize: 9,
    color: C.textSecondary,
  },
  tdBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  tdSmall: {
    fontSize: 7.5,
    color: C.textSecondary,
  },
  tdBoldSmall: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: C.textPrimary,
  },

  // Footer
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 6,
  },
  footerText: {
    fontSize: 6.5,
    color: C.textTertiary,
    lineHeight: 1.5,
  },
});

// ─── Sub-components ─────────────────────────────────────────────────────────

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
      <Text style={s.kpiLabel}>{label}</Text>
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

function ClasificacionBlock({
  estrategia,
  confianza,
  razon,
}: {
  estrategia: string;
  confianza: Confianza;
  razon: string;
}) {
  const colors = CONFIANZA_HEX[confianza];
  return (
    <View
      style={[
        s.classBlock,
        { backgroundColor: colors.bg, borderColor: colors.border },
      ]}
    >
      <View style={s.classRow}>
        <Text style={s.classLabel}>Cómo se clasificó</Text>
        <View
          style={[
            s.classPill,
            { borderColor: colors.border, backgroundColor: C.white },
          ]}
        >
          <View style={[s.classDot, { backgroundColor: colors.dot }]} />
          <Text style={[s.classPillText, { color: colors.text }]}>
            {CONFIANZA_LABEL[confianza]}
          </Text>
        </View>
      </View>
      <Text style={s.classRazon}>
        <Text style={s.classStrong}>Estrategia: {estrategia}. </Text>
        {razon}
      </Text>
    </View>
  );
}

function PieChart({
  data,
}: {
  data: Array<{ tipo: string; share: number; color: string }>;
}) {
  // Normalizar a 100 — CAFCI a veces publica >100% total. Para el pie
  // visual queremos slices proporcionales sin solaparse.
  const total = data.reduce((acc, d) => acc + d.share, 0);
  if (total <= 0) return null;

  const cx = 65;
  const cy = 65;
  const r = 60;

  let cumulative = 0;
  const slices = data.map((d) => {
    const sweep = (d.share / total) * 360;
    const start = cumulative;
    const end = cumulative + sweep;
    cumulative = end;
    return { ...d, start, end, sweep };
  });

  return (
    <Svg width={130} height={130} viewBox="0 0 130 130">
      {slices.map((slice, i) => {
        if (slice.sweep < 0.5) return null; // skip slivers <0.5deg
        return (
          <Path
            key={`${slice.tipo}-${i}`}
            d={piePath(cx, cy, r, slice.start, slice.end)}
            fill={slice.color}
            stroke="#FFFFFF"
            strokeWidth={0.8}
          />
        );
      })}
    </Svg>
  );
}

function PieLegend({
  data,
}: {
  data: Array<{ tipo: string; share: number; color: string }>;
}) {
  // Mostramos hasta 10 entries, agrupando el resto en "Otros minoritarios"
  // para que la leyenda no se desborde.
  const max = 10;
  const head = data.slice(0, max);
  const rest = data.slice(max);
  const restShare = rest.reduce((acc, d) => acc + d.share, 0);

  return (
    <View style={s.legend}>
      {head.map((d) => (
        <View key={d.tipo} style={s.legendRow}>
          <View style={[s.legendSwatch, { backgroundColor: d.color }]} />
          <Text style={s.legendTipo}>{d.tipo}</Text>
          <Text style={s.legendShare}>{d.share.toFixed(1)}%</Text>
        </View>
      ))}
      {rest.length > 0 && (
        <View style={s.legendRow}>
          <View style={[s.legendSwatch, { backgroundColor: "#CBD5E1" }]} />
          <Text style={s.legendTipo}>+{rest.length} otros tipos</Text>
          <Text style={s.legendShare}>{restShare.toFixed(1)}%</Text>
        </View>
      )}
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
      <Text
        style={[
          s.tdBold,
          { flex: 1, textAlign: "right", color: tf.color, fontSize: 8 },
        ]}
      >
        {tf.text}
      </Text>
    </View>
  );
}

function ClaseRow({
  clase,
  isRep,
  isLast,
}: {
  clase: ClaseInfo;
  isRep: boolean;
  isLast: boolean;
}) {
  return (
    <View
      style={[
        s.tableRow,
        isLast ? s.tableRowLast : {},
        isRep ? s.tableRowHighlight : {},
      ]}
    >
      <Text style={[s.tdBoldSmall, { flex: 1.5 }]}>
        {clase.letra ? `Clase ${clase.letra}` : clase.claseNombre.split(" - ").slice(-1)[0]}
        {isRep ? " ★" : ""}
      </Text>
      <Text style={[s.tdSmall, { flex: 1.5, textAlign: "right" }]}>
        {clase.patrimonio ? fmtCompact(clase.patrimonio) : "—"}
      </Text>
      <Text style={[s.tdSmall, { flex: 1, textAlign: "right" }]}>
        {fmtPctNum(clase.feeGestion)}
      </Text>
      <Text style={[s.tdSmall, { flex: 1, textAlign: "right" }]}>
        {fmtPctNum(clase.feeDepositaria)}
      </Text>
      <Text style={[s.tdSmall, { flex: 1, textAlign: "right" }]}>
        {fmtPctNum(clase.comIngreso)}
      </Text>
      <Text style={[s.tdSmall, { flex: 1, textAlign: "right" }]}>
        {fmtPctNum(clase.comRescate)}
      </Text>
      <Text style={[s.tdSmall, { flex: 0.6, textAlign: "center" }]}>
        {clase.plazoRescate != null ? `${clase.plazoRescate}d` : "—"}
      </Text>
    </View>
  );
}

// ─── Main document ──────────────────────────────────────────────────────────

export function FondoPDF({ fondo }: FondoPDFProps) {
  const hasCartera = fondo.cartera.length > 0;
  const cartAgg = hasCartera ? aggregateByTipo(fondo.cartera) : [];
  const hasClases = fondo.clasesDisponibles.length > 0;

  return (
    <Document
      title={fondo.displayName}
      author="Amauta Inversiones Financieras"
      subject="Ficha de Fondo Comun de Inversion"
    >
      <Page size="A4" style={s.page}>

        {/* ── HEADER ────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View style={s.brandRow}>
            <Text style={s.brandLabel}>AMAUTA · MONITOR FCIs</Text>
            <View>
              <Text style={s.closeLabel}>CIERRE</Text>
              <Text style={s.closeDate}>{fmtDate(fondo.fecha)}</Text>
            </View>
          </View>

          <Text style={s.headerTitle}>{fondo.displayName}</Text>

          <Text style={s.headerSub}>
            {fondo.gestora ?? "Gestora desconocida"}
            {fondo.depositaria ? ` · Depositaria: ${fondo.depositaria}` : ""}
            {fondo.claseRepresentativa ? ` · Clase rep.: ${fondo.claseRepresentativa}` : ""}
          </Text>

          <View style={s.badgeRow}>
            <Text style={s.badgeYellow}>{fondo.estrategia.toUpperCase()}</Text>
            {fondo.categoria && fondo.categoria !== fondo.estrategia && (
              <Text style={s.badgeOutline}>{fondo.categoria}</Text>
            )}
            {fondo.horizonte && <Text style={s.badgeOutline}>{fondo.horizonte}</Text>}
            {fondo.region && <Text style={s.badgeOutline}>{fondo.region}</Text>}
            {fondo.moneda && <Text style={s.badgeOutline}>{fondo.moneda}</Text>}
            {fondo.benchmark && fondo.benchmark !== "No Registrado" && (
              <Text style={s.badgeOutline}>BM: {fondo.benchmark}</Text>
            )}
            {fondo.duration && <Text style={s.badgeOutline}>{fondo.duration}</Text>}
            {fondo.calificacion && (
              <Text style={s.badgeOutline}>Cal. {fondo.calificacion}</Text>
            )}
          </View>
        </View>

        {/* ── BODY ──────────────────────────────────────────────────── */}
        <View style={s.body}>

          {/* KPI row */}
          <View style={s.kpiRow}>
            <KpiBox label="VCP" value={fmtN(fondo.vcp, 4)} />
            <KpiBox
              label="Patrimonio del fondo"
              value={fmtCompact(fondo.patrimonio)}
            />
            <KpiBox
              label="Cuotapartes"
              value={fondo.ccp ? fmtN(fondo.ccp, 0) : "—"}
            />
            <KpiBox
              label="Hon. Gerente (Clase rep.)"
              value={fmtPctNum(fondo.feeGestion)}
              last
            />
          </View>

          {/* ── Cómo se clasificó este fondo ── */}
          <ClasificacionBlock
            estrategia={fondo.estrategia}
            confianza={fondo.estrategiaConfianza}
            razon={fondo.estrategiaRazon}
          />

          {/* ── Composición de Cartera ── */}
          {hasCartera && (
            <View style={s.section}>
              <SectionHeader
                title="Composicion de Cartera"
                sub={`${cartAgg.length} tipos de activos · fuente CAFCI`}
              />
              <View style={s.composBody}>
                <View style={s.pieContainer}>
                  <PieChart data={cartAgg} />
                </View>
                <PieLegend data={cartAgg} />
              </View>
            </View>
          )}

          {/* ── Rendimientos ── */}
          <View style={s.section}>
            <SectionHeader title="Rendimientos Historicos" />

            <View style={s.tableHeaderRow}>
              <Text style={[s.th, { flex: 2 }]}>Periodo</Text>
              <Text style={[s.th, { flex: 1, textAlign: "right" }]}>Rendimiento</Text>
              <Text style={[s.th, { flex: 1, textAlign: "right" }]}>TNA</Text>
            </View>

            <RetRow label="Diario (1D)" simple={fondo.ret1d} tna={fondo.tna1d} />
            <RetRow label="Mensual (MTD)" simple={fondo.retMTD} tna={fondo.tna30d} />
            <RetRow label="Ano en Curso (YTD)" simple={fondo.ytd} tna={null} />
            <RetRow label="Interanual (13M)" simple={fondo.ret13m} tna={fondo.tna1a} last />
          </View>

          {/* ── Clases del Fondo ── */}
          {hasClases && (
            <View style={s.section} wrap={false}>
              <SectionHeader
                title="Clases del Fondo"
                sub={`${fondo.clasesDisponibles.length} ${fondo.clasesDisponibles.length === 1 ? "clase" : "clases"} · honorarios y comisiones · fila ★ = clase representativa`}
              />
              <View style={s.tableHeaderRow}>
                <Text style={[s.th, { flex: 1.5 }]}>Clase</Text>
                <Text style={[s.th, { flex: 1.5, textAlign: "right" }]}>Patrimonio</Text>
                <Text style={[s.th, { flex: 1, textAlign: "right" }]}>Hon. Ger.</Text>
                <Text style={[s.th, { flex: 1, textAlign: "right" }]}>Hon. Dep.</Text>
                <Text style={[s.th, { flex: 1, textAlign: "right" }]}>Com. Ing.</Text>
                <Text style={[s.th, { flex: 1, textAlign: "right" }]}>Com. Res.</Text>
                <Text style={[s.th, { flex: 0.6, textAlign: "center" }]}>Plazo</Text>
              </View>
              {fondo.clasesDisponibles.map((c, i) => (
                <ClaseRow
                  key={c.codigoCafci ?? `${c.letra}-${i}`}
                  clase={c}
                  isRep={c.letra === fondo.claseRepresentativa}
                  isLast={i === fondo.clasesDisponibles.length - 1}
                />
              ))}
            </View>
          )}

        </View>

        {/* ── FOOTER absoluto, fijo en todas las paginas ─────────────── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            Este material es preparado por Amauta Inversiones Financieras
            (Matricula CNV 1029) con fines informativos y no constituye una
            recomendacion de inversion. Rentabilidades pasadas no garantizan
            resultados futuros. La clasificacion de estrategia se infiere de
            la composicion de cartera publicada por CAFCI — verificar siempre
            con la fuente oficial (cafci.org.ar).
          </Text>
        </View>

      </Page>
    </Document>
  );
}
