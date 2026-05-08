/**
 * GET /api/cron/snapshot-cafci
 *
 * Daily job that downloads CAFCI's Planilla Diaria A and upserts all rows
 * into the `fci_snapshot` table in Supabase.
 *
 * Triggered by Vercel Cron (see vercel.json). The Cron service authenticates
 * by sending `Authorization: Bearer ${CRON_SECRET}` — we reject anything else
 * to prevent random callers from spamming this endpoint.
 *
 * Why a daily cron?
 *   1. Build long-term history (vol, sharpe, evolución gráfico).
 *   2. Independence: if CAFCI breaks tomorrow, the site keeps showing the
 *      last good snapshot from Supabase.
 *   3. Speed: read from Supabase (~50ms) vs download + parse the .xlsx
 *      every page request (~2 s).
 *
 * For now this just COLLECTS. The app still reads the Excel directly.
 * In ~1 month we'll have enough history to refactor the app to read from
 * Supabase + light up new features.
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchCafciSnapshot, cafciDateToIso } from "@/lib/fondos/client";
import type { CafciSheetRow } from "@/lib/fondos/client";
import { adminClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type SnapshotInsert = Database["public"]["Tables"]["fci_snapshot"]["Insert"];

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Batch size for upserts. Postgres handles large batches well, but smaller
 *  chunks give us per-batch error visibility in case of network blips. */
const UPSERT_BATCH_SIZE = 500;

function rowToSnapshot(r: CafciSheetRow): SnapshotInsert | null {
  if (!r.codigoCafci || !r.fechaDDMMYY) return null;
  const fecha = cafciDateToIso(r.fechaDDMMYY);
  return {
    fecha,
    codigo_cafci: r.codigoCafci,
    fondo: r.fondo,
    categoria_detallada: r.categoriaDetallada,
    gestora: r.sociedadGerente,
    depositaria: r.sociedadDepositaria,
    moneda: r.moneda,
    region: r.region,
    horizonte: r.horizonte,
    calificacion: r.calificacion,
    codigo_cnv: r.codigoCnv,
    vcp: r.vcp,
    vcp_ayer: r.vcpAyer,
    ccp: r.ccp,
    patrimonio: r.patrimonio,
    var_dia: r.varDia,
    var_mes: r.varMes,
    var_ytd: r.varYTD,
    var_13m: r.var13M,
    fee_gestion: r.honorariosGerente,
    fee_depositaria: r.honorariosDepositaria,
    com_ingreso: r.comIngreso,
    com_rescate: r.comRescate,
    hon_exito: r.honorariosExito,
    plazo_liq: r.plazoLiq,
  };
}

export async function GET(req: NextRequest) {
  // Auth — accept Vercel Cron's Bearer token, or a manual debug call with
  // the same secret in the query string (`?secret=...`).
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET no configurado en el entorno" },
      { status: 500 },
    );
  }
  const authHeader = req.headers.get("authorization") ?? "";
  const fromHeader = authHeader.replace(/^Bearer\s+/i, "").trim();
  const fromQuery = req.nextUrl.searchParams.get("secret")?.trim() ?? "";
  if (fromHeader !== expected && fromQuery !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  // 1 — Download + parse the Excel.
  let rows: CafciSheetRow[];
  try {
    rows = await fetchCafciSnapshot();
  } catch (err) {
    console.error("[cron snapshot-cafci] download/parse failed:", err);
    return NextResponse.json(
      { ok: false, stage: "download", error: String(err) },
      { status: 502 },
    );
  }

  // 2 — Detect the "real" snapshot date by majority vote.
  // CAFCI's planilla includes a handful of liquidated/inactive funds whose
  // `fecha` column is their last known date (not the snapshot date). We only
  // want the active funds of the current closing day, so we keep just those
  // matching the most-frequent date.
  const dateCounts = new Map<string, number>();
  for (const r of rows) {
    if (!r.fechaDDMMYY) continue;
    dateCounts.set(r.fechaDDMMYY, (dateCounts.get(r.fechaDDMMYY) ?? 0) + 1);
  }
  let snapshotDate = "";
  let maxCount = 0;
  for (const [d, n] of dateCounts) {
    if (n > maxCount) {
      maxCount = n;
      snapshotDate = d;
    }
  }

  // 3 — Map to Supabase shape, dropping inactive funds and rows without
  // a CAFCI ID (they can't be primary-keyed).
  const records: SnapshotInsert[] = [];
  let dropped = 0;
  for (const r of rows) {
    if (r.fechaDDMMYY !== snapshotDate) {
      dropped++;
      continue;
    }
    const rec = rowToSnapshot(r);
    if (rec) records.push(rec);
    else dropped++;
  }

  if (records.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        stage: "parse",
        error: "Sin filas válidas en la planilla",
        rows_total: rows.length,
      },
      { status: 502 },
    );
  }

  // 3 — Upsert in batches. PK is (fecha, codigo_cafci) so re-runs the same
  // day are idempotent (CAFCI sometimes republishes corrections post-cierre).
  const supa = adminClient();
  let inserted = 0;
  for (let i = 0; i < records.length; i += UPSERT_BATCH_SIZE) {
    const batch = records.slice(i, i + UPSERT_BATCH_SIZE);
    const { error } = await supa
      .from("fci_snapshot")
      .upsert(batch, { onConflict: "fecha,codigo_cafci" });
    if (error) {
      console.error(
        `[cron snapshot-cafci] upsert batch ${i / UPSERT_BATCH_SIZE} failed:`,
        error,
      );
      return NextResponse.json(
        {
          ok: false,
          stage: "upsert",
          batch_index: i / UPSERT_BATCH_SIZE,
          inserted_so_far: inserted,
          error: error.message,
        },
        { status: 500 },
      );
    }
    inserted += batch.length;
  }

  const elapsedMs = Date.now() - startedAt;
  return NextResponse.json({
    ok: true,
    fecha_snapshot: records[0].fecha,
    rows_total: rows.length,
    rows_dropped: dropped,
    rows_upserted: inserted,
    elapsed_ms: elapsedMs,
  });
}
