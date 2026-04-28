/**
 * GET /api/fondo/pdf?key=ENCODED_DISPLAY_NAME
 *
 * Generates and streams an Amauta-branded PDF report for the requested
 * fund class. Fetches data from CAFCI live (same as the detail page).
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
  getFondoFichaData,
  getMarketSnapshotWithReturns,
} from "@/lib/cafci/enriched";

export const maxDuration = 60; // PDF gen + CAFCI fetch can take up to ~20s

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("key");
  if (!raw) {
    return NextResponse.json({ error: "missing key" }, { status: 400 });
  }

  const displayName = decodeURIComponent(raw);

  // 1 — Full market snapshot (gives us returns + metadata)
  const snap = await getMarketSnapshotWithReturns().catch(() => null);
  if (!snap) {
    return NextResponse.json(
      { error: "CAFCI unavailable — try again in a few minutes" },
      { status: 503 },
    );
  }

  const fondo = snap.rows.find((r) => r.key === displayName);
  if (!fondo) {
    return NextResponse.json(
      { error: `Fund "${displayName}" not found` },
      { status: 404 },
    );
  }

  // 2 — Official CAFCI ficha (composition + fees + official returns)
  const ficha = await getFondoFichaData(fondo.fondoId, fondo.claseId);

  const carteras =
    ficha?.info?.semanal?.carteras
      ?.filter((c) => c.nombreActivo && c.share > 0)
      .sort((a, b) => b.share - a.share)
      .slice(0, 10) ?? null;

  const honorarios = ficha?.info?.mensual?.honorariosComisiones ?? null;
  const rend = ficha?.info?.diaria?.rendimientos ?? null;

  // 3 — Render PDF
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(FondoPDF, {
    fondo,
    carteras,
    honorarios,
    rend,
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

  // 4 — Safe filename: strip characters that cause issues in Content-Disposition
  const safeName = fondo.displayName
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  const filename = `${safeName}_${snap.fecha}.pdf`;

  // NextResponse expects BodyInit — convert Node Buffer → Uint8Array
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Allow browsers to cache the PDF for 5 minutes (same as data freshness)
      "Cache-Control": "public, max-age=300",
    },
  });
}
