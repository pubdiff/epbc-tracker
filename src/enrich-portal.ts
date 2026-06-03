// Enriches our referral index with proponent + location + valid date + status
// pulled from the EPBC Public Portal (Power Apps Portal). Listing-level only,
// no per-record fetches (detail pages are login-gated).
//
// Usage:
//   pnpm tsx src/enrich-portal.ts --har notes/portal-auth.har          # one-shot
//   pnpm tsx src/enrich-portal.ts --har notes/portal-auth.har --resume
//   pnpm tsx src/enrich-portal.ts --bootstrap playwright               # unattended
//   pnpm tsx src/enrich-portal.ts --har notes/portal-auth.har --max-pages 5  # smoke
//
// Outputs:
//   data/_portal-enrichment.json   - raw enrichment keyed by ticketNumber
//   data/_enrichment-progress.json - resume state (last completed page + count)

import { bootstrapFromHar } from "./portal/bootstrap-from-har.ts";
import { bootstrapWithPlaywright } from "./portal/bootstrap-playwright.ts";
import { crawlAll, PortalFetchError } from "./portal/fetch.ts";
import { normalizeRecord } from "./portal/normalize.ts";
import type { PortalEnrichment, PortalSession } from "./portal/types.ts";
import { DATA_DIR, readJSON, writeJSON } from "./lib.ts";

const ENRICHMENT_PATH = `${DATA_DIR}/_portal-enrichment.json`;
const PROGRESS_PATH = `${DATA_DIR}/_enrichment-progress.json`;
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_DELAY_MS = 5000;

interface Progress {
  lastCompletedPage: number;
  recordCount: number;
  startedAt: string;
  lastSavedAt: string;
}

interface EnrichmentFile {
  generatedAt: string;
  source: "epbc-public-portal";
  count: number;
  records: Record<string, PortalEnrichment>;
}

interface Args {
  bootstrap: "har" | "playwright";
  harPath: string;
  resume: boolean;
  maxPages?: number;
  pageSize: number;
  delayMs: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    bootstrap: "har",
    harPath: "",
    resume: false,
    pageSize: DEFAULT_PAGE_SIZE,
    delayMs: DEFAULT_DELAY_MS,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const nextArg = (): string => {
      const v = argv[++i];
      if (!v) throw new Error(`Missing value for ${a}`);
      return v;
    };
    if (a === "--har") {
      args.harPath = nextArg();
      args.bootstrap = "har";
    } else if (a === "--bootstrap") {
      const v = nextArg();
      if (v !== "har" && v !== "playwright") {
        throw new Error(`--bootstrap must be 'har' or 'playwright', got '${v}'`);
      }
      args.bootstrap = v;
    } else if (a === "--resume") args.resume = true;
    else if (a === "--max-pages") args.maxPages = Number(nextArg());
    else if (a === "--page-size") args.pageSize = Number(nextArg());
    else if (a === "--delay-ms") args.delayMs = Number(nextArg());
  }
  if (args.bootstrap === "har" && !args.harPath) {
    throw new Error("Missing --har <path> (or pass --bootstrap playwright)");
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log("enrich-portal:", args);

  let session: PortalSession;
  if (args.bootstrap === "playwright") {
    session = await bootstrapWithPlaywright();
    console.log("bootstrapped session via playwright");
  } else {
    session = await bootstrapFromHar(args.harPath);
    console.log(`bootstrapped session from ${args.harPath}`);
  }

  const existing =
    (await readJSON<EnrichmentFile>(ENRICHMENT_PATH))?.records ?? {};
  const progress =
    args.resume ? await readJSON<Progress>(PROGRESS_PATH) : null;

  const startPage = progress ? progress.lastCompletedPage + 1 : 1;
  const records: Record<string, PortalEnrichment> = { ...existing };
  let pageCounter = 0;
  const startedAt = new Date().toISOString();

  console.log(
    `starting at page ${startPage}, ${Object.keys(records).length} existing enrichments`,
  );

  try {
    await crawlAll(session, {
      pageSize: args.pageSize,
      startPage,
      maxPages: args.maxPages,
      delayMs: args.delayMs,
      onPage: async (page, response) => {
        let added = 0;
        for (const rec of response.Records) {
          const norm = normalizeRecord(rec);
          if (!norm) continue;
          records[norm.ticketNumber] = norm;
          added++;
        }
        pageCounter++;
        console.log(
          `  page ${page}: +${added} (total: ${Object.keys(records).length}, more=${response.MoreRecords})`,
        );

        // Save after every page so an interrupt loses at most one page of work.
        await saveAll(records, page, startedAt);
      },
    });
  } catch (err) {
    if (err instanceof PortalFetchError) {
      console.error(`portal fetch error (${err.status}):`, err.message);
      // Still persist what we have so the next run can resume.
      await saveAll(records, startPage + pageCounter - 1, startedAt);
      process.exit(2);
    }
    throw err;
  }

  await saveAll(records, startPage + pageCounter - 1, startedAt);
  console.log(
    `done: ${Object.keys(records).length} enriched records in ${pageCounter} new pages`,
  );
}

async function saveAll(
  records: Record<string, PortalEnrichment>,
  lastCompletedPage: number,
  startedAt: string,
): Promise<void> {
  const out: EnrichmentFile = {
    generatedAt: new Date().toISOString(),
    source: "epbc-public-portal",
    count: Object.keys(records).length,
    records,
  };
  await writeJSON(ENRICHMENT_PATH, out);
  const progress: Progress = {
    lastCompletedPage,
    recordCount: Object.keys(records).length,
    startedAt,
    lastSavedAt: new Date().toISOString(),
  };
  await writeJSON(PROGRESS_PATH, progress);
}

main().catch((err) => {
  console.error("enrich-portal failed:", err);
  process.exit(1);
});
