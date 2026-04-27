import { ComingSoon } from "@/components/ComingSoon";

export const metadata = {
  title: "Comparar fondos · Monitor FCIs · Amauta",
  description:
    "Comparador de Fondos Comunes de Inversión argentinos. Próximamente.",
};

export default function CompararPage() {
  return (
    <ComingSoon
      phase="Fase 4"
      title="Comparador de fondos"
      description="Vas a poder elegir hasta 4 fondos y compararlos lado a lado en cualquier período."
      bullets={[
        "Curva base 100 sobre el período que elijas",
        "Tabla comparativa: VCP, TNA por ventanas, AUM, comisión, gestora",
        "Selector de fechas custom (no solo 30/90 días)",
        "Permalink compartible con tus compañeros",
        "Overlay de benchmarks: BADLAR, MEP, CCL, Merval",
      ]}
    />
  );
}
