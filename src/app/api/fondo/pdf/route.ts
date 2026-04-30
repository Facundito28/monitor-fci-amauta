/**
 * GET /api/fondo/pdf?key=ENCODED_DISPLAY_NAME
 *
 * Generates and streams an Amauta-branded PDF report for the requested
 * fund class. Pulls data from the bulk fonditos snapshot — same source as
 * the detail page.
 *
 * Returns:
 *   Content-Type: application/pdf
 *   Content-Disposition: attachment; filename="<FundName>_<date>.pdf"
 */
import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { FondoPDF } from "@/components/pdf/FondoPDF";
import {
  getFondoDetalle,
  getMarketSnapshotWithReturns,
} from "@/lib/fondos/enriched";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("key");
  if (!raw) {
    return NextResponse.json({ error: "missing key" }, { status: 400 });
  }

  const displayName = decodeURIComponent(raw);

  // 1 — Bulk snapshot (rates + fees + metadata for the row)
  const snap = await getMarketSnapshotWithReturns().catch(() => null);
  if (!snap) {
    return NextResponse.json(
      { error: "Datos no disponibles — intentá de nuevo en unos minutos" },
      { status: 503 },
    );
  }

  const fondo = snap.rows.find((r) => r.key === displayName);
  if (!fondo) {
    return NextResponse.json(
      { error: `Fondo "${displayName}" no encontrado` },
      { status: 404 },
    );
  }

  // 2 — Best-effort detail call (vol, sharpe, 7d). Tolerate failure.
  const detalle = await getFondoDetalle(fondo.displayName).catch(() => null);

  // 3 — Render PDF
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(FondoPDF, {
    fondo,
    detalle,
  }) as any;

  let buffer: Buffer;
  try {
    buffer = await renderToBuffer(element);
  } catch (err) {
    console.error("[pdf] renderToBuffer error:", err);
    return NextResponse.json(
      { error: "PDF generation failed" },
      { status: 500 },
    );
  }

  // 4 — Safe filename
  const safeName = fondo.displayName
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  const filename = `${safeName}_${snap.fecha}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
