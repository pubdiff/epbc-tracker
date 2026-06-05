// Enriches proponents with disclosed AEC political donations (roadmap B4, Tier 1).
//
// Downloads the AEC Transparency Register annual data (a ZIP of CSVs), builds a
// normalised donor-name index, and joins it to the distinct proponents already
// in data/_index.json (populated by enrich-portal + merge-portal-enrichment).
// High-precision: exact normalised matches + a curated alias table only.
//
// Usage:
//   pnpm tsx src/enrich-donations.ts                 # download live AEC data
//   pnpm tsx src/enrich-donations.ts --zip /tmp/aec-annual.zip   # use a local ZIP
//
// Output: data/_donations-enrichment.json (keyed by normalised proponent name).
// Then run merge-donations to attach matches to _index.json.

import { readFile } from "node:fs/promises";
import type { ReferralIndex } from "./schema.ts";
import { DATA_DIR, INDEX_PATH, isoDate, readJSON, writeJSON } from "./lib.ts";
import {
  AEC_ANNUAL_URL,
  AEC_THRESHOLD_NOTE,
  AEC_USER_AGENT,
  buildDonorIndex,
  DONOR_ALIASES,
  isLikelyDonorEntity,
  normaliseEntityName,
  readZipEntries,
  toDonationMatch,
  type DonationMatch,
  type DonationsEnrichmentFile,
} from "./donations.ts";

const OUT_PATH = `${DATA_DIR}/_donations-enrichment.json`;

function parseArgs(argv: string[]): { zipPath?: string } {
  const out: { zipPath?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--zip") {
      const v = argv[++i];
      if (!v) throw new Error("Missing value for --zip");
      out.zipPath = v;
    }
  }
  return out;
}

async function loadZip(zipPath?: string): Promise<Buffer> {
  if (zipPath) {
    console.log(`reading AEC zip from ${zipPath}`);
    return readFile(zipPath);
  }
  console.log(`downloading AEC annual data from ${AEC_ANNUAL_URL}`);
  const res = await fetch(AEC_ANNUAL_URL, { headers: { "User-Agent": AEC_USER_AGENT } });
  if (!res.ok) throw new Error(`AEC download failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main(): Promise<void> {
  const { zipPath } = parseArgs(process.argv.slice(2));

  const zip = readZipEntries(await loadZip(zipPath));
  const donors = buildDonorIndex(zip);
  console.log(`AEC: ${donors.size} unique normalised donor names`);

  const idx = await readJSON<ReferralIndex>(INDEX_PATH);
  if (!idx) throw new Error(`${INDEX_PATH} not found - run the scrape + portal enrichment first`);

  // Distinct proponents (verbatim), keeping a representative original spelling.
  const proponents = new Map<string, string>(); // normalised -> representative raw
  for (const ref of Object.values(idx)) {
    const p = ref.proponent?.trim();
    if (!p || !isLikelyDonorEntity(p)) continue;
    const norm = normaliseEntityName(p);
    if (norm && !proponents.has(norm)) proponents.set(norm, p);
  }
  console.log(`proponents (donor-eligible, distinct): ${proponents.size}`);

  const records: Record<string, DonationMatch> = {};
  let exact = 0;
  let alias = 0;
  for (const [norm] of proponents) {
    const aliasTarget = DONOR_ALIASES[norm];
    if (aliasTarget && donors.has(aliasTarget)) {
      records[norm] = toDonationMatch(donors.get(aliasTarget)!, "alias");
      alias++;
    } else if (donors.has(norm)) {
      records[norm] = toDonationMatch(donors.get(norm)!, "exact");
      exact++;
    }
  }

  const file: DonationsEnrichmentFile = {
    generatedAt: isoDate(),
    source: "aec-transparency-register-annual",
    sourceUrl: AEC_ANNUAL_URL,
    thresholdNote: AEC_THRESHOLD_NOTE,
    count: Object.keys(records).length,
    records,
  };
  await writeJSON(OUT_PATH, file);

  const totalDollars = Object.values(records).reduce((n, m) => n + m.total, 0);
  console.log(`matched ${file.count} proponents to donors (${exact} exact, ${alias} alias)`);
  console.log(`  total disclosed donations across matches: $${totalDollars.toLocaleString("en-AU")}`);
  console.log(`  wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("enrich-donations failed:", err);
  process.exit(1);
});
