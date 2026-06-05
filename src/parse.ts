// Parse the latest raw ArcGIS response into normalised Referral records.
// Writes data/snapshots/<isoDate>.json.

import { readdir } from "node:fs/promises";
import type { RawArcGisAttributes, Referral } from "./schema.ts";
import { RAW_DIR, SNAPSHOT_DIR, isoDate, readJSON, writeJSON } from "./lib.ts";

interface RawFile {
  fetchedAt: string;
  runId: string;
  endpoint: string;
  count: number;
  features: { attributes: RawArcGisAttributes }[];
}

function normaliseString(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "NA" || trimmed === "N/A") return null;
  return trimmed;
}

function normaliseUrl(value: string | null | undefined): string | null {
  if (value == null) return null;
  // ArcGIS sometimes returns URLs with backslashes (legacy Windows-style)
  return value.replace(/\\/g, "/").trim() || null;
}

function parseAttributes(a: RawArcGisAttributes): Referral {
  return {
    referenceNumber: a.REFERENCE_NUMBER,
    proposalId: a.PROPOSAL_ID,
    name: normaliseString(a.NAME),
    jurisdiction: normaliseString(a.PRIMARY_JURISDICTION),
    decision: normaliseString(a.REFERRAL_DECISION),
    determination: normaliseString(a.STANDARD_DETERMINATION),
    status: normaliseString(a.STATUS_DESCRIPTION),
    stage: normaliseString(a.STAGE_NAME),
    referralType: normaliseString(a.REFERRAL_TYPE),
    year: a.YEAR == null ? null : Math.round(a.YEAR),
    category: normaliseString(a.CATEGORY),
    portalUrl: normaliseUrl(a.REFERRAL_URL),
    crmId: normaliseString(a.CRM_ID),
  };
}

// EPBC lifecycle stage ordering, latest/most-advanced first. A reference can
// appear under more than one OBJECTID at different lifecycle points (e.g. a
// referral decision and its later approval phase). We keep the most-advanced
// record so the tracker shows the current state, deterministically - the old
// "last in fetch order" dedup could flip on an ArcGIS reorder and emit a
// spurious diff. See notes/E1-duplicate-refs.md.
const STAGE_RANK: Record<string, number> = {
  Completed: 100,
  "Post-Approval": 90,
  Approval: 80,
  Assessment: 70,
  "Assessment Approach": 65,
  "Further Information Request": 60,
  "Final PD": 55,
  "Proposed Decision Comment": 52,
  "Proposed Decision": 50,
  "Guidelines Issued": 45,
  "Direction to Publish": 42,
  "Referral Decision": 40,
  "Referral Publication": 30,
};

function stageRank(stage: string | null | undefined): number {
  return STAGE_RANK[(stage ?? "").trim()] ?? 0;
}

// Returns the record that better represents the reference's current state:
// most-advanced stage, then a recorded decision, then highest OBJECTID as a
// stable final tiebreak (so the choice never depends on fetch order).
function pickBetter(a: RawArcGisAttributes, b: RawArcGisAttributes): RawArcGisAttributes {
  const ra = stageRank(a.STAGE_NAME);
  const rb = stageRank(b.STAGE_NAME);
  if (ra !== rb) return ra > rb ? a : b;
  const da = a.REFERRAL_DECISION ? 1 : 0;
  const db = b.REFERRAL_DECISION ? 1 : 0;
  if (da !== db) return da > db ? a : b;
  return (a.OBJECTID ?? 0) >= (b.OBJECTID ?? 0) ? a : b;
}

async function findLatestRawFile(): Promise<string> {
  const files = (await readdir(RAW_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort();
  const latest = files[files.length - 1];
  if (!latest) throw new Error(`no raw files found in ${RAW_DIR}`);
  return `${RAW_DIR}/${latest}`;
}

async function main(): Promise<void> {
  const runId = isoDate();
  const rawPath = await findLatestRawFile();
  console.log(`parse: reading ${rawPath}`);

  const raw = await readJSON<RawFile>(rawPath);
  if (!raw) throw new Error(`failed to read ${rawPath}`);

  // Dedupe by referenceNumber on the raw features (which carry OBJECTID +
  // stage), keeping the most-advanced record per reference. Deterministic, so a
  // reordered ArcGIS response can't flip which record we keep. See pickBetter.
  const bestByRef = new Map<string, RawArcGisAttributes>();
  for (const f of raw.features) {
    const ref = f.attributes.REFERENCE_NUMBER;
    if (!ref) continue;
    const cur = bestByRef.get(ref);
    bestByRef.set(ref, cur ? pickBetter(cur, f.attributes) : f.attributes);
  }
  const collapsed = raw.features.filter((f) => f.attributes.REFERENCE_NUMBER).length - bestByRef.size;
  const deduped = [...bestByRef.values()]
    .map(parseAttributes)
    .sort((a, b) => a.referenceNumber.localeCompare(b.referenceNumber));
  if (collapsed > 0) console.log(`  collapsed ${collapsed} duplicate reference(s) to their most-advanced record`);

  const snapshotPath = `${SNAPSHOT_DIR}/${runId}.json`;
  await writeJSON(snapshotPath, {
    runId,
    fetchedAt: raw.fetchedAt,
    sourceEndpoint: raw.endpoint,
    count: deduped.length,
    referrals: deduped,
  });
  console.log(`parse: wrote ${deduped.length} referrals to ${snapshotPath}`);

  // basic sanity stats so we'd catch a future schema break
  const nullNames = deduped.filter((r) => !r.name).length;
  const nullStatus = deduped.filter((r) => !r.status).length;
  const nullJurisdiction = deduped.filter((r) => !r.jurisdiction).length;
  console.log(`  null names: ${nullNames}, null status: ${nullStatus}, null jurisdiction: ${nullJurisdiction}`);
}

main().catch((err) => {
  console.error("parse failed:", err);
  process.exit(1);
});
