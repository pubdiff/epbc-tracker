// Fetch all EPBC referrals from the DCCEEW ArcGIS MapServer.
// Writes raw paged responses to data/raw/<isoDate>.json as a single combined file.
//
// Source: https://gis.environment.gov.au/gispubmap/rest/services/ogc_services/EPBC_Referrals/MapServer/0
// Layer max record count: 10000 - so we paginate by OBJECTID.

import { setDefaultResultOrder } from "node:dns";
import { setDefaultAutoSelectFamily } from "node:net";
import type { RawArcGisFeature, RawArcGisResponse } from "./schema.ts";
import { ENDPOINT, RAW_DIR, isoDate, writeJSON } from "./lib.ts";

// gis.environment.gov.au advertises AAAA records that hang on some networks
// (and CI runners). Force IPv4-only resolution + disable Happy Eyeballs to keep
// connect deterministic.
setDefaultResultOrder("ipv4first");
setDefaultAutoSelectFamily(false);

const PAGE_SIZE = 2000; // well under the 10k server limit; smaller pages are safer

async function fetchPage(offset: number): Promise<RawArcGisResponse> {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "*",
    returnGeometry: "false",
    orderByFields: "OBJECTID ASC",
    resultOffset: String(offset),
    resultRecordCount: String(PAGE_SIZE),
    f: "json",
  });

  const url = `${ENDPOINT}?${params.toString()}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`ArcGIS query failed: ${response.status} ${response.statusText} (offset=${offset})`);
  }

  const body = (await response.json()) as RawArcGisResponse | { error: unknown };
  if ("error" in body) {
    throw new Error(`ArcGIS returned error: ${JSON.stringify(body.error)}`);
  }
  return body as RawArcGisResponse;
}

async function fetchAll(): Promise<RawArcGisFeature[]> {
  const all: RawArcGisFeature[] = [];
  let offset = 0;
  let pageCount = 0;

  while (true) {
    pageCount++;
    const page = await fetchPage(offset);
    all.push(...page.features);
    console.log(`  page ${pageCount}: +${page.features.length} (total: ${all.length})`);

    const more = page.exceededTransferLimit || page.features.length === PAGE_SIZE;
    if (!more || page.features.length === 0) break;
    offset += page.features.length;
  }

  return all;
}

async function main(): Promise<void> {
  const runId = isoDate();
  console.log(`fetch: starting run ${runId}`);
  console.log(`endpoint: ${ENDPOINT}`);

  const features = await fetchAll();
  console.log(`fetched ${features.length} referrals`);

  const path = `${RAW_DIR}/${runId}.json`;
  await writeJSON(path, {
    fetchedAt: new Date().toISOString(),
    runId,
    endpoint: ENDPOINT,
    count: features.length,
    features,
  });
  console.log(`wrote ${path}`);
}

main().catch((err) => {
  console.error("fetch failed:", err);
  process.exit(1);
});
