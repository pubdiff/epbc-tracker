// Joins data/_donations-enrichment.json into data/_index.json.
//
// The enrichment is keyed by normalised proponent name; here we attach the
// matched DonationMatch to every referral whose proponent normalises to that
// key, plus a donationsEnrichedAt timestamp. Referrals with no proponent, a
// government/council proponent, or an unmatched proponent are left untouched.

import type { ReferralIndex } from "./schema.ts";
import { DATA_DIR, INDEX_PATH, isoDate, readJSON, writeJSON } from "./lib.ts";
import { normaliseEntityName, type DonationsEnrichmentFile } from "./donations.ts";

const ENRICHMENT_PATH = `${DATA_DIR}/_donations-enrichment.json`;

async function main(): Promise<void> {
  const idx = await readJSON<ReferralIndex>(INDEX_PATH);
  if (!idx) throw new Error(`${INDEX_PATH} not found`);

  const enrichment = await readJSON<DonationsEnrichmentFile>(ENRICHMENT_PATH);
  if (!enrichment) throw new Error(`${ENRICHMENT_PATH} not found - run enrich-donations first`);

  const today = isoDate();
  let merged = 0;
  const matchedRefs = new Set<string>();

  for (const ref of Object.values(idx)) {
    const p = ref.proponent?.trim();
    if (!p) {
      // Clear any stale match if the proponent was removed.
      if (ref.donations) {
        ref.donations = null;
        ref.donationsEnrichedAt = today;
      }
      continue;
    }
    const match = enrichment.records[normaliseEntityName(p)];
    if (match) {
      ref.donations = match;
      ref.donationsEnrichedAt = today;
      merged++;
      matchedRefs.add(ref.referenceNumber);
    } else if (ref.donations) {
      // Proponent no longer matches (e.g. AEC data refreshed) - drop the stale match.
      ref.donations = null;
      ref.donationsEnrichedAt = today;
    }
  }

  await writeJSON(INDEX_PATH, idx);

  console.log(`merged donations into _index.json`);
  console.log(`  matched proponents: ${enrichment.count}`);
  console.log(`  referrals with disclosed donations: ${merged}`);
}

main().catch((err) => {
  console.error("merge-donations failed:", err);
  process.exit(1);
});
