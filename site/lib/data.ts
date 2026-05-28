// Build-time data loading. Reads the JSON committed in ../data/ as the data layer.
// Designed to run only in Server Components / generateStaticParams.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export { refSlug } from "./slug";

const REPO_ROOT = join(process.cwd(), "..");
const DATA_DIR = join(REPO_ROOT, "data");
const INDEX_PATH = join(DATA_DIR, "_index.json");
const DIFF_DIR = join(DATA_DIR, "diffs");

export interface ReferralHistoryEntry {
  observedAt: string;
  status: string | null;
  stage: string | null;
  decision: string | null;
  determination: string | null;
}

export interface ReferralIndexed {
  referenceNumber: string;
  proposalId: number | null;
  name: string | null;
  jurisdiction: string | null;
  decision: string | null;
  determination: string | null;
  status: string | null;
  stage: string | null;
  referralType: string | null;
  year: number | null;
  category: string | null;
  portalUrl: string | null;
  crmId: string | null;
  firstSeen: string;
  lastSeen: string;
  history: ReferralHistoryEntry[];
}

export type ReferralIndex = Record<string, ReferralIndexed>;

export interface ChangedFields {
  name?: string | null;
  jurisdiction?: string | null;
  decision?: string | null;
  determination?: string | null;
  status?: string | null;
  stage?: string | null;
  referralType?: string | null;
  category?: string | null;
}

export interface Change {
  referenceNumber: string;
  from: ChangedFields;
  to: ChangedFields;
}

export interface Diff {
  runId: string;
  added: ReferralIndexed[];
  changed: Change[];
  removed: string[];
  stats: {
    totalCurrent: number;
    totalPrevious: number;
    addedCount: number;
    changedCount: number;
    removedCount: number;
  };
}

let indexCache: ReferralIndex | null = null;
export async function loadIndex(): Promise<ReferralIndex> {
  if (indexCache) return indexCache;
  const raw = await readFile(INDEX_PATH, "utf8");
  indexCache = JSON.parse(raw) as ReferralIndex;
  return indexCache;
}

let diffsCache: Diff[] | null = null;
export async function loadDiffs(): Promise<Diff[]> {
  if (diffsCache) return diffsCache;
  let files: string[];
  try {
    files = (await readdir(DIFF_DIR)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    diffsCache = [];
    return diffsCache;
  }
  const diffs: Diff[] = [];
  for (const f of files) {
    const raw = await readFile(join(DIFF_DIR, f), "utf8");
    diffs.push(JSON.parse(raw) as Diff);
  }
  diffsCache = diffs;
  return diffs;
}


export interface ActivityItem {
  kind: "added" | "decision" | "stage" | "status";
  runId: string;
  referenceNumber: string;
  name: string | null;
  jurisdiction: string | null;
  from: string | null;
  to: string | null;
  headline: string;
}

function isBootstrap(d: Diff): boolean {
  return d.stats.totalPrevious === 0 && d.stats.addedCount > 1000;
}

export async function recentActivity(limit = 40): Promise<ActivityItem[]> {
  const diffs = await loadDiffs();
  const idx = await loadIndex();
  const items: ActivityItem[] = [];

  for (const d of [...diffs].reverse()) {
    if (isBootstrap(d)) continue;
    for (const a of d.added) {
      items.push({
        kind: "added",
        runId: d.runId,
        referenceNumber: a.referenceNumber,
        name: a.name,
        jurisdiction: a.jurisdiction,
        from: null,
        to: a.status,
        headline: "New referral",
      });
    }
    for (const c of d.changed) {
      const cur = idx[c.referenceNumber];
      if (c.to.decision !== undefined && c.to.decision !== c.from.decision) {
        items.push({
          kind: "decision",
          runId: d.runId,
          referenceNumber: c.referenceNumber,
          name: cur?.name ?? null,
          jurisdiction: cur?.jurisdiction ?? null,
          from: c.from.decision ?? null,
          to: c.to.decision ?? null,
          headline: "Decision",
        });
      } else if (c.to.stage !== undefined && c.to.stage !== c.from.stage) {
        items.push({
          kind: "stage",
          runId: d.runId,
          referenceNumber: c.referenceNumber,
          name: cur?.name ?? null,
          jurisdiction: cur?.jurisdiction ?? null,
          from: c.from.stage ?? null,
          to: c.to.stage ?? null,
          headline: "Stage change",
        });
      } else if (c.to.status !== undefined && c.to.status !== c.from.status) {
        items.push({
          kind: "status",
          runId: d.runId,
          referenceNumber: c.referenceNumber,
          name: cur?.name ?? null,
          jurisdiction: cur?.jurisdiction ?? null,
          from: c.from.status ?? null,
          to: c.to.status ?? null,
          headline: "Status change",
        });
      }
    }
    if (items.length >= limit) break;
  }

  return items.slice(0, limit);
}

export async function trackerStats(): Promise<{
  total: number;
  firstSeen: string;
  lastUpdate: string;
  byJurisdiction: Array<[string, number]>;
  byStage: Array<[string, number]>;
}> {
  const idx = await loadIndex();
  const all = Object.values(idx);
  const byJurisdiction = new Map<string, number>();
  const byStage = new Map<string, number>();
  let earliest = "9999-12-31";
  let latest = "0000-01-01";
  for (const r of all) {
    if (r.jurisdiction) byJurisdiction.set(r.jurisdiction, (byJurisdiction.get(r.jurisdiction) ?? 0) + 1);
    if (r.stage) byStage.set(r.stage, (byStage.get(r.stage) ?? 0) + 1);
    if (r.firstSeen < earliest) earliest = r.firstSeen;
    if (r.lastSeen > latest) latest = r.lastSeen;
  }
  return {
    total: all.length,
    firstSeen: earliest,
    lastUpdate: latest,
    byJurisdiction: [...byJurisdiction.entries()].sort((a, b) => b[1] - a[1]),
    byStage: [...byStage.entries()].sort((a, b) => b[1] - a[1]),
  };
}
