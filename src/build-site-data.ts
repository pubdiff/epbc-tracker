// Emits site/public/data/referrals.json - a trimmed version of _index.json
// shaped for client-side filtering. Short field names keep the wire size down
// (~150KB gzipped vs 6MB for the full index).
//
// Schema is consumed by site/app/all/AllClient.tsx via fetch().

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ReferralIndex } from "./schema.ts";
import { INDEX_PATH, readJSON } from "./lib.ts";

const OUT_PATH = "site/public/data/referrals.json";

// Compact wire format. The site decodes this back to a typed shape.
export interface ReferralLite {
  ref: string;          // referenceNumber - primary key + display
  name: string | null;
  juris: string | null; // jurisdiction
  cat: string | null;   // category
  yr: number | null;    // year
  stage: string | null;
  status: string | null;
  decided: boolean;     // !!decision (true once a decision is recorded)
  first: string;        // firstSeen (YYYY-MM-DD)
  last: string;         // lastSeen (YYYY-MM-DD)
}

export interface ReferralsLiteFile {
  generatedAt: string;
  count: number;
  // Distinct values found in the data, surfaced so the filter UI doesn't
  // need to compute them client-side every render.
  facets: {
    jurisdictions: string[];
    categories: string[];
    stages: string[];
    statuses: string[];
    yearMin: number | null;
    yearMax: number | null;
  };
  items: ReferralLite[];
}

function uniqSorted(values: Array<string | null>): string[] {
  const set = new Set<string>();
  for (const v of values) if (v) set.add(v);
  return [...set].sort((a, b) => a.localeCompare(b));
}

async function main(): Promise<void> {
  const index = await readJSON<ReferralIndex>(INDEX_PATH);
  if (!index) throw new Error(`failed to read ${INDEX_PATH}`);

  const all = Object.values(index);
  const items: ReferralLite[] = all.map((r) => ({
    ref: r.referenceNumber,
    name: r.name,
    juris: r.jurisdiction,
    cat: r.category,
    yr: r.year,
    stage: r.stage,
    status: r.status,
    decided: !!r.decision,
    first: r.firstSeen,
    last: r.lastSeen,
  }));

  // sort by last observed desc so the file's natural order is useful
  items.sort((a, b) => {
    if (a.last !== b.last) return a.last > b.last ? -1 : 1;
    return a.ref.localeCompare(b.ref);
  });

  const years = items.map((i) => i.yr).filter((y): y is number => y !== null);

  const out: ReferralsLiteFile = {
    generatedAt: new Date().toISOString(),
    count: items.length,
    facets: {
      jurisdictions: uniqSorted(items.map((i) => i.juris)),
      categories: uniqSorted(items.map((i) => i.cat)),
      stages: uniqSorted(items.map((i) => i.stage)),
      statuses: uniqSorted(items.map((i) => i.status)),
      yearMin: years.length ? Math.min(...years) : null,
      yearMax: years.length ? Math.max(...years) : null,
    },
    items,
  };

  // Minified - this file is machine-consumed by the browser. Pretty-printing
  // would triple the wire size for no benefit.
  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(out), "utf8");
  console.log(
    `build-site-data: wrote ${items.length} referrals to ${OUT_PATH}`,
  );
  console.log(
    `  facets: ${out.facets.jurisdictions.length} jurisdictions, ${out.facets.categories.length} categories, ${out.facets.stages.length} stages, ${out.facets.statuses.length} statuses, years ${out.facets.yearMin}-${out.facets.yearMax}`,
  );
}

main().catch((err) => {
  console.error("build-site-data failed:", err);
  process.exit(1);
});
