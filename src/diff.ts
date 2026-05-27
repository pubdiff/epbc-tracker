// Compute the diff between the latest snapshot and the prior snapshot.
// Writes data/diffs/<isoDate>.json.

import { readdir } from "node:fs/promises";
import type {
  Change,
  ChangedFields,
  Diff,
  Referral,
} from "./schema.ts";
import {
  DIFF_DIR,
  SNAPSHOT_DIR,
  isoDate,
  readJSON,
  writeJSON,
} from "./lib.ts";

interface SnapshotFile {
  runId: string;
  fetchedAt: string;
  sourceEndpoint: string;
  count: number;
  referrals: Referral[];
}

const TRACKED_FIELDS = [
  "name",
  "jurisdiction",
  "decision",
  "determination",
  "status",
  "stage",
  "referralType",
  "category",
] as const satisfies readonly (keyof Referral)[];

function diffOne(prev: Referral, curr: Referral): Change | null {
  const from: ChangedFields = {};
  const to: ChangedFields = {};
  let dirty = false;
  for (const field of TRACKED_FIELDS) {
    if (prev[field] !== curr[field]) {
      (from as Record<string, unknown>)[field] = prev[field];
      (to as Record<string, unknown>)[field] = curr[field];
      dirty = true;
    }
  }
  if (!dirty) return null;
  return { referenceNumber: curr.referenceNumber, from, to };
}

async function listSnapshots(): Promise<string[]> {
  return (await readdir(SNAPSHOT_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort();
}

async function main(): Promise<void> {
  const runId = isoDate();
  const snapshots = await listSnapshots();
  if (snapshots.length === 0) throw new Error(`no snapshots in ${SNAPSHOT_DIR}`);

  const latestName = snapshots[snapshots.length - 1]!;
  const priorName = snapshots.length >= 2 ? snapshots[snapshots.length - 2]! : null;
  console.log(`diff: latest=${latestName}, prior=${priorName ?? "(none - first run)"}`);

  const latest = await readJSON<SnapshotFile>(`${SNAPSHOT_DIR}/${latestName}`);
  if (!latest) throw new Error(`failed to read latest snapshot`);

  const prior = priorName
    ? await readJSON<SnapshotFile>(`${SNAPSHOT_DIR}/${priorName}`)
    : null;

  const priorByRef = new Map<string, Referral>();
  for (const r of prior?.referrals ?? []) priorByRef.set(r.referenceNumber, r);

  const latestByRef = new Map<string, Referral>();
  for (const r of latest.referrals) latestByRef.set(r.referenceNumber, r);

  const added: Referral[] = [];
  const changed: Change[] = [];
  const removed: string[] = [];

  for (const [ref, curr] of latestByRef) {
    const prev = priorByRef.get(ref);
    if (!prev) {
      added.push(curr);
      continue;
    }
    const change = diffOne(prev, curr);
    if (change) changed.push(change);
  }

  for (const ref of priorByRef.keys()) {
    if (!latestByRef.has(ref)) removed.push(ref);
  }

  const diff: Diff = {
    runId,
    added,
    changed,
    removed,
    stats: {
      totalCurrent: latestByRef.size,
      totalPrevious: priorByRef.size,
      addedCount: added.length,
      changedCount: changed.length,
      removedCount: removed.length,
    },
  };

  const diffPath = `${DIFF_DIR}/${runId}.json`;
  await writeJSON(diffPath, diff);
  console.log(
    `diff: added=${added.length}, changed=${changed.length}, removed=${removed.length}`,
  );
  console.log(`wrote ${diffPath}`);
}

main().catch((err) => {
  console.error("diff failed:", err);
  process.exit(1);
});
