// Update the cumulative _index.json from the latest snapshot.
// Each referral's history grows over time as we observe status/stage/decision changes.

import { readdir } from "node:fs/promises";
import type {
  Referral,
  ReferralHistoryEntry,
  ReferralIndex,
  ReferralIndexed,
} from "./schema.ts";
import {
  INDEX_PATH,
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

function makeHistoryEntry(r: Referral, observedAt: string): ReferralHistoryEntry {
  return {
    observedAt,
    status: r.status,
    stage: r.stage,
    decision: r.decision,
    determination: r.determination,
  };
}

function historyMatches(a: ReferralHistoryEntry, b: ReferralHistoryEntry): boolean {
  return (
    a.status === b.status &&
    a.stage === b.stage &&
    a.decision === b.decision &&
    a.determination === b.determination
  );
}

async function findLatestSnapshot(): Promise<string> {
  const files = (await readdir(SNAPSHOT_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort();
  const latest = files[files.length - 1];
  if (!latest) throw new Error(`no snapshots in ${SNAPSHOT_DIR}`);
  return `${SNAPSHOT_DIR}/${latest}`;
}

async function main(): Promise<void> {
  const runId = isoDate();
  const snapshotPath = await findLatestSnapshot();
  console.log(`index-update: reading ${snapshotPath}`);

  const snapshot = await readJSON<SnapshotFile>(snapshotPath);
  if (!snapshot) throw new Error(`failed to read ${snapshotPath}`);

  const existingIndex = (await readJSON<ReferralIndex>(INDEX_PATH)) ?? {};
  const observedAt = snapshot.runId;

  let added = 0;
  let updated = 0;
  let unchanged = 0;

  const nextIndex: ReferralIndex = { ...existingIndex };

  for (const r of snapshot.referrals) {
    const ref = r.referenceNumber;
    const prior = nextIndex[ref];
    const newEntry = makeHistoryEntry(r, observedAt);

    if (!prior) {
      const indexed: ReferralIndexed = {
        ...r,
        firstSeen: observedAt,
        lastSeen: observedAt,
        history: [newEntry],
      };
      nextIndex[ref] = indexed;
      added++;
      continue;
    }

    const lastEntry = prior.history[prior.history.length - 1];
    const isStatusChange = !lastEntry || !historyMatches(lastEntry, newEntry);

    nextIndex[ref] = {
      ...prior,
      // refresh non-history fields to the latest observation
      name: r.name,
      jurisdiction: r.jurisdiction,
      decision: r.decision,
      determination: r.determination,
      status: r.status,
      stage: r.stage,
      referralType: r.referralType,
      year: r.year,
      category: r.category,
      portalUrl: r.portalUrl,
      crmId: r.crmId,
      proposalId: r.proposalId,
      lastSeen: observedAt,
      history: isStatusChange ? [...prior.history, newEntry] : prior.history,
    };

    if (isStatusChange) updated++;
    else unchanged++;
  }

  await writeJSON(INDEX_PATH, nextIndex);
  console.log(
    `index-update: added ${added}, updated ${updated}, unchanged ${unchanged}; total ${Object.keys(nextIndex).length}`,
  );
  console.log(`wrote ${INDEX_PATH}`);
  void runId;
}

main().catch((err) => {
  console.error("index-update failed:", err);
  process.exit(1);
});
