// Joins data/_portal-enrichment.json into data/_index.json.
//
// Matches by referenceNumber → ticketNumber. Adds proponent, location,
// portalProjectTitle, validDate, statusReason, incidentId and a per-record
// enrichedAt timestamp. Records not present in the portal export are left
// untouched.

import type { PortalEnrichment } from "./portal/types.ts";
import type { ReferralIndex } from "./schema.ts";
import { DATA_DIR, INDEX_PATH, isoDate, readJSON, writeJSON } from "./lib.ts";

const ENRICHMENT_PATH = `${DATA_DIR}/_portal-enrichment.json`;

interface EnrichmentFile {
  generatedAt: string;
  source: "epbc-public-portal";
  count: number;
  records: Record<string, PortalEnrichment>;
}

async function main(): Promise<void> {
  const idx = await readJSON<ReferralIndex>(INDEX_PATH);
  if (!idx) throw new Error(`${INDEX_PATH} not found`);

  const enrichment = await readJSON<EnrichmentFile>(ENRICHMENT_PATH);
  if (!enrichment) throw new Error(`${ENRICHMENT_PATH} not found - run enrich-portal first`);

  const today = isoDate();
  let merged = 0;
  let unmatchedPortal = 0;

  for (const [ticket, portal] of Object.entries(enrichment.records)) {
    const ref = idx[ticket];
    if (!ref) {
      unmatchedPortal++;
      continue;
    }
    ref.proponent = portal.proponent;
    ref.location = portal.location;
    ref.portalProjectTitle = portal.projectTitle;
    ref.validDate = portal.validDate;
    ref.statusReason = portal.statusReason;
    ref.incidentId = portal.incidentId;
    ref.enrichedAt = today;
    merged++;
  }

  await writeJSON(INDEX_PATH, idx);

  const totalIndex = Object.keys(idx).length;
  const enrichedCount = Object.values(idx).filter((r) => r.enrichedAt).length;
  console.log(`merged ${merged} portal records into _index.json`);
  console.log(`  unmatched portal records: ${unmatchedPortal} (newer than ArcGIS snapshot)`);
  console.log(`  total enriched: ${enrichedCount} / ${totalIndex} (${((enrichedCount / totalIndex) * 100).toFixed(1)}%)`);
}

main().catch((err) => {
  console.error("merge-portal-enrichment failed:", err);
  process.exit(1);
});
