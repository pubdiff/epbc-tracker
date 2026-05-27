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

  const referrals = raw.features.map((f) => parseAttributes(f.attributes));

  // dedupe by referenceNumber, keep latest occurrence
  const byRef = new Map<string, Referral>();
  for (const r of referrals) {
    if (r.referenceNumber) byRef.set(r.referenceNumber, r);
  }
  const deduped = [...byRef.values()].sort((a, b) =>
    a.referenceNumber.localeCompare(b.referenceNumber),
  );

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
