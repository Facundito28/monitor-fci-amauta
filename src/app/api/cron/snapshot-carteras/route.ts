/**
 * GET /api/cron/snapshot-carteras
 *
 * Weekly job that:
 *   1. Downloads the CAFCI catalog JSON → upserts fci_fondo_meta with
 *      clase→fondo mapping + tipo_renta + region + benchmark + duration.
 *   2. For each fondo in the catalog, scrapes the public ficha HTML and
 *      extracts the portfolio composition → upserts fci_cartera.
 *
 * Idempotent — re-runs the same week overwrite by PK (fecha_snapshot,
 * fondo_id, rank). Skips fondos already snapshot for today's date.
 *
 * Auth: Bearer CRON_SECRET (or ?secret=... query param for manual debug).
 *
 * Note on Vercel timeouts: full crawl is ~1.137 fondos × 1.5 s. With
 * concurrency 20 it lands around 70-90 s, which exceeds Hobby plan's 60 s
 * function limit. We mitigate with two mechanisms:
 *   - `?max_seconds=N` to bound execution time. Defaults to 50 s (10 s
 *     buffer below the platform limit). When time runs out we return
 *     `{ ok: true, complete: false, ... }` and Vercel Cron retries on the
 *     next schedule.
 *   - `skip_existing=true` (default) to skip fondos already snapshot for
 *     `current_iso_week_monday()`. This makes successive invocations on
 *     the same week additive: each run picks up where the previous left.
 *
 * For the *first* full crawl, invoke manually from a local terminal (no
 * Vercel timeout there) until you see `complete: true`.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  fetchCafciCatalog,
  fetchCarteraFondo,
  flattenCatalogToMetaRows,
  type CarteraHolding,
} from "@/lib/fondos/cartera-client";
import { adminClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type CarteraInsert = Database["public"]["Tables"]["fci_cartera"]["Insert"];
type FondoMetaInsert =
  Database["public"]["Tables"]["fci_fondo_meta"]["Insert"];

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const META_BATCH_SIZE = 500;
const CARTERA_BATCH_SIZE = 500;
const SCRAPE_CONCURRENCY = 20;
/**
 * Time budget — must stay safely below Vercel's `maxDuration = 60` ceiling.
 * The cold start + catalog download + meta upsert eat 5-15s before scraping
 * even starts, and an in-flight fetch can take up to 10s to return after we
 * hit the deadline. Leaving 20s of headroom keeps us under the platform
 * timeout reliably.
 */
const DEFAULT_MAX_SECONDS = 40;

/** Anchor a snapshot to the current ISO week's Monday (so daily reruns
 *  during the same week share the same `fecha_snapshot`). */
function currentWeekMondayIso(): string {
  const d = new Date();
  // getUTCDay: 0=Sun..6=Sat. Shift Sun=7 then subtract day-of-week-1 to land on Monday.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
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

  const maxSeconds = Math.max(
    10,
    Math.min(
      300,
      Number(req.nextUrl.searchParams.get("max_seconds")) ||
        DEFAULT_MAX_SECONDS,
    ),
  );
  const skipExisting =
    (req.nextUrl.searchParams.get("skip_existing") ?? "true").toLowerCase() !==
    "false";
  const startedAt = Date.now();
  const deadline = startedAt + maxSeconds * 1000;
  const fechaSnapshot = currentWeekMondayIso();
  const supa = adminClient();

  // 1 — Catalog → fci_fondo_meta
  let catalog;
  try {
    catalog = await fetchCafciCatalog();
  } catch (err) {
    console.error("[cron snapshot-carteras] catalog fetch failed:", err);
    return NextResponse.json(
      { ok: false, stage: "catalog", error: String(err) },
      { status: 502 },
    );
  }
  const metaRows: FondoMetaInsert[] = flattenCatalogToMetaRows(catalog).map(
    (r) => ({ ...r, updated_at: new Date().toISOString() }),
  );
  let metaUpserted = 0;
  for (let i = 0; i < metaRows.length; i += META_BATCH_SIZE) {
    const batch = metaRows.slice(i, i + META_BATCH_SIZE);
    const { error } = await supa
      .from("fci_fondo_meta")
      .upsert(batch, { onConflict: "codigo_cafci_clase" });
    if (error) {
      console.error("[cron snapshot-carteras] meta upsert error:", error);
      return NextResponse.json(
        { ok: false, stage: "meta_upsert", error: error.message },
        { status: 500 },
      );
    }
    metaUpserted += batch.length;
  }

  // 2 — Determine which fondos still need scraping for this week.
  // Use the FIRST clase id of each fondo to hit the ficha (cartera is shared).
  const fondosToScrape: { fondoId: number; firstClaseId: number }[] = [];
  for (const f of catalog.fondos ?? []) {
    if (typeof f.id !== "number") continue;
    const claseId = f.clases?.[0]?.id;
    if (typeof claseId !== "number") continue;
    fondosToScrape.push({ fondoId: f.id, firstClaseId: claseId });
  }

  // Skip already-snapshot fondos for the current week to make reruns cheap.
  const alreadyDone = new Set<number>();
  if (skipExisting) {
    for (let i = 0; i < fondosToScrape.length; i += 1000) {
      const ids = fondosToScrape.slice(i, i + 1000).map((x) => x.fondoId);
      const { data, error } = await supa
        .from("fci_cartera")
        .select("fondo_id")
        .eq("fecha_snapshot", fechaSnapshot)
        .in("fondo_id", ids);
      if (error) {
        console.error("[cron snapshot-carteras] existing query error:", error);
        // Non-fatal — proceed without skip.
        break;
      }
      for (const row of data ?? []) {
        if (typeof row.fondo_id === "number") alreadyDone.add(row.fondo_id);
      }
    }
  }
  const pending = fondosToScrape.filter((x) => !alreadyDone.has(x.fondoId));

  // 3 — Scrape with bounded concurrency until budget exhausted.
  // Convergence trick: any fondo we *attempted* this run (success with rows,
  // success-but-empty, or error) gets at least one sentinel row in fci_cartera
  // so the next run's `alreadyDone` query skips it. Without this, fondos
  // without published carteras (cerrados, en liquidación, etc.) loop forever.
  let scraped = 0;
  let errors = 0;
  let emptyCount = 0;
  let i = 0;
  const fondosWithRows = new Set<number>(); // had real cartera, rows inserted
  const fondosEmpty: number[] = []; // ficha OK but no pie chart
  const fondosErrored: number[] = []; // network / 5xx / parse error

  async function worker() {
    while (i < pending.length && Date.now() < deadline) {
      const idx = i++;
      const { fondoId, firstClaseId } = pending[idx];
      let holdings: CarteraHolding[];
      try {
        holdings = await fetchCarteraFondo(fondoId, firstClaseId);
      } catch (err) {
        errors++;
        fondosErrored.push(fondoId);
        console.error(
          `[cron snapshot-carteras] scrape ${fondoId} failed:`,
          err,
        );
        continue;
      }
      if (holdings.length === 0) {
        emptyCount++;
        fondosEmpty.push(fondoId);
        continue;
      }
      const rows: CarteraInsert[] = holdings.map((h) => ({
        fecha_snapshot: fechaSnapshot,
        fondo_id: fondoId,
        rank: h.rank,
        activo: h.activo,
        tipo_activo: h.tipo_activo,
        share: h.share,
      }));
      const { error } = await supa
        .from("fci_cartera")
        .upsert(rows, { onConflict: "fecha_snapshot,fondo_id,rank" });
      if (error) {
        errors++;
        fondosErrored.push(fondoId);
        console.error(
          `[cron snapshot-carteras] upsert fondo ${fondoId} failed:`,
          error,
        );
        continue;
      }
      fondosWithRows.add(fondoId);
      scraped++;
    }
  }

  const workers: Promise<void>[] = [];
  for (let k = 0; k < SCRAPE_CONCURRENCY; k++) workers.push(worker());
  await Promise.all(workers);

  // 4 — Mark "no cartera" / "errored" fondos with a sentinel row at rank=0,
  // so future runs treat them as alreadyDone. We only sentinel fondos that
  // didn't get real rows (rank≥1 wins on the unique PK if both happen).
  const sentinelRows: CarteraInsert[] = [];
  for (const fondoId of fondosEmpty) {
    sentinelRows.push({
      fecha_snapshot: fechaSnapshot,
      fondo_id: fondoId,
      rank: 0,
      activo: "(sin composición publicada)",
      tipo_activo: "Sin Cartera",
      share: 0,
    });
  }
  for (const fondoId of fondosErrored) {
    if (fondosWithRows.has(fondoId)) continue;
    sentinelRows.push({
      fecha_snapshot: fechaSnapshot,
      fondo_id: fondoId,
      rank: 0,
      activo: "(error al consultar CAFCI)",
      tipo_activo: "Sin Cartera",
      share: 0,
    });
  }
  let sentinelInserted = 0;
  if (sentinelRows.length > 0) {
    const { error: sentinelErr } = await supa
      .from("fci_cartera")
      .upsert(sentinelRows, { onConflict: "fecha_snapshot,fondo_id,rank" });
    if (sentinelErr) {
      console.error(
        "[cron snapshot-carteras] sentinel upsert failed:",
        sentinelErr,
      );
    } else {
      sentinelInserted = sentinelRows.length;
    }
  }

  const elapsedMs = Date.now() - startedAt;
  const attempted = scraped + emptyCount + errors;
  const complete = i >= pending.length;

  return NextResponse.json({
    ok: true,
    complete,
    fecha_snapshot: fechaSnapshot,
    catalog_total_fondos: catalog.total_fondos ?? null,
    meta_upserted: metaUpserted,
    fondos_total: fondosToScrape.length,
    fondos_skipped_existing: alreadyDone.size,
    fondos_with_cartera: scraped,
    fondos_empty: emptyCount,
    fondos_errored: errors,
    sentinel_inserted: sentinelInserted,
    fondos_remaining: Math.max(0, pending.length - attempted),
    elapsed_ms: elapsedMs,
  });
}

/** kept to satisfy the Insert type until tablas use NOT NULL on columns. */
void CARTERA_BATCH_SIZE;
