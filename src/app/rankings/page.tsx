import { ComingSoon } from "@/components/ComingSoon";

export const metadata = {
  title: "Rankings · Monitor FCIs · Amauta",
  description:
    "Rankings de Fondos Comunes de Inversión argentinos por rendimiento, AUM y categoría. Próximamente.",
};

export default function RankingsPage() {
  return (
    <ComingSoon
      phase="Fase 2 / 3"
      title="Rankings de fondos"
      description="Top fondos por rendimiento ajustado, AUM y categoría — calculados sobre el histórico diario que vamos a empezar a almacenar en breve."
      bullets={[
        "Top 10 por TNA / TEA en cada categoría",
        "Mejor rendimiento real (ajustado por IPC)",
        "Mayor AUM y mayor crecimiento de patrimonio",
        "Volatilidad y Sharpe — risk-adjusted ranking",
        "Filtros por horizonte y moneda",
      ]}
    />
  );
}
