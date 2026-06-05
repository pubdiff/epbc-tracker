// Data-health guardrail. Runs after parse, before the data is committed/posted.
//
// A scraper or upstream change can silently produce a degraded snapshot - a
// partial ArcGIS response, an auth/redirect change, an empty result - and the
// pipeline would happily commit it and publish a diff that reads as "hundreds of
// referrals vanished" when really the fetch broke. For an accountability tool a
// silent data hole is the worst failure mode, so we fail the run instead of
// publishing degraded data. (A genuine >10% weekly change never happens at this
// scale; a sharp drop means breakage.)
//
// Exit non-zero on a failed check so the `scrape` script aborts before commit.

import { readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { SNAPSHOT_DIR, readJSON } from "./lib.ts";

export interface HealthVerdict {
  ok: boolean;
  reason: string;
}

// Pure decision so it's unit-testable. prevCount === null means no prior
// snapshot (bootstrap) - always healthy. maxDropFraction defaults to 0.10.
export function assessHealth(
  prevCount: number | null,
  curCount: number,
  maxDropFraction = 0.1,
): HealthVerdict {
  if (curCount === 0) {
    return { ok: false, reason: "current snapshot has 0 records (fetch/parse likely broke)" };
  }
  if (prevCount === null || prevCount === 0) {
    return { ok: true, reason: `no prior snapshot to compare; ${curCount} records` };
  }
  const drop = (prevCount - curCount) / prevCount;
  if (drop > maxDropFraction) {
    return {
      ok: false,
      reason: `record count dropped ${(drop * 100).toFixed(1)}% (${prevCount} -> ${curCount}), over the ${(maxDropFraction * 100).toFixed(0)}% guardrail - treating as breakage, not a real change`,
    };
  }
  return { ok: true, reason: `${prevCount} -> ${curCount} (within guardrail)` };
}

interface SnapshotFile {
  count: number;
}

async function twoLatestSnapshotCounts(): Promise<{ prev: number | null; cur: number | null }> {
  let files: string[];
  try {
    files = (await readdir(SNAPSHOT_DIR)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return { prev: null, cur: null };
  }
  const curFile = files[files.length - 1];
  const prevFile = files[files.length - 2];
  const cur = curFile ? (await readJSON<SnapshotFile>(`${SNAPSHOT_DIR}/${curFile}`))?.count ?? null : null;
  const prev = prevFile ? (await readJSON<SnapshotFile>(`${SNAPSHOT_DIR}/${prevFile}`))?.count ?? null : null;
  return { prev, cur };
}

async function main(): Promise<void> {
  const maxDrop = Number(process.env.HEALTH_MAX_DROP ?? "0.1");
  const { prev, cur } = await twoLatestSnapshotCounts();
  if (cur === null) {
    console.log("check-health: no snapshot found, skipping");
    return;
  }
  const verdict = assessHealth(prev, cur, maxDrop);
  console.log(`check-health: ${verdict.reason}`);
  if (!verdict.ok) {
    console.error("check-health: FAILED - aborting before commit/post so degraded data isn't published");
    process.exit(1);
  }
}

// Only run as a CLI entry, not when imported by tests.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error("check-health failed:", err);
    process.exit(1);
  });
}
