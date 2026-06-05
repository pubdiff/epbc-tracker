// Review tool for curating DONOR_ALIASES (roadmap B4, Tier 2a).
//
// Lists likely subsidiary->parent / name-variant donor matches among the
// proponents that DON'T already exact-normalised-match a donor. A candidate is
// emitted when every distinctive token of the proponent name appears in a donor
// name (i.e. the proponent is the more specific entity). Output is for HUMAN
// review only - auto-applying these is unsafe (token overlap produces false
// positives like "Western Power Corporation" ~ "Western Mining Corporation").
// Verify identity, then hand-add confirmed pairs to DONOR_ALIASES in donations.ts.
//
// Usage: pnpm tsx src/donation-alias-candidates.ts --zip /tmp/aec-annual.zip [--top 60]

import { readFile } from "node:fs/promises";
import type { ReferralIndex } from "./schema.ts";
import { INDEX_PATH, readJSON } from "./lib.ts";
import {
  AEC_ANNUAL_URL,
  AEC_USER_AGENT,
  buildDonorIndex,
  DONOR_ALIASES,
  isLikelyDonorEntity,
  normaliseEntityName,
  readZipEntries,
} from "./donations.ts";

// Generic words that don't identify a specific entity; ignored when comparing.
const STOP = new Set(
  ("THE AND OF PROJECT PROJECTS ENERGY WIND SOLAR FARM POWER MINING RESOURCES " +
    "DEVELOPMENT DEVELOPMENTS PROPERTY INVESTMENTS NO OPERATIONS RENEWABLES " +
    "MINERALS GOLD COAL ASSETS PARK BAY CREEK SERVICES")
    .split(" "),
);
const distinctiveTokens = (norm: string): string[] =>
  norm.split(" ").filter((t) => t.length > 2 && !STOP.has(t));

function parseArgs(argv: string[]): { zipPath?: string; top: number } {
  const out: { zipPath?: string; top: number } = { top: 60 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--zip") out.zipPath = argv[++i];
    else if (argv[i] === "--top") out.top = Number(argv[++i]) || 60;
  }
  return out;
}

async function main(): Promise<void> {
  const { zipPath, top } = parseArgs(process.argv.slice(2));
  const buf = zipPath
    ? await readFile(zipPath)
    : Buffer.from(
        await (await fetch(AEC_ANNUAL_URL, { headers: { "User-Agent": AEC_USER_AGENT } })).arrayBuffer(),
      );
  const donors = buildDonorIndex(readZipEntries(buf));
  const donorList = [...donors.entries()].map(([n, e]) => ({
    n,
    tokens: new Set(distinctiveTokens(n)),
    raw: e.raw,
    total: e.records.reduce((a, b) => a + b.value, 0),
  }));

  const idx = await readJSON<ReferralIndex>(INDEX_PATH);
  if (!idx) throw new Error(`${INDEX_PATH} not found`);

  // Distinct donor-eligible proponents not already matched (exact or alias).
  const proponents = new Map<string, string>();
  for (const ref of Object.values(idx)) {
    const p = ref.proponent?.trim();
    if (!p || !isLikelyDonorEntity(p)) continue;
    const norm = normaliseEntityName(p);
    if (!norm || donors.has(norm) || DONOR_ALIASES[norm]) continue;
    if (!proponents.has(norm)) proponents.set(norm, p);
  }

  const best = new Map<string, { praw: string; donor: string; shared: number; total: number }>();
  for (const [pnorm, praw] of proponents) {
    const pt = distinctiveTokens(pnorm);
    if (pt.length < 1) continue;
    for (const d of donorList) {
      if (d.tokens.size === 0) continue;
      const shared = pt.filter((t) => d.tokens.has(t)).length;
      if (shared !== pt.length) continue; // every proponent token must appear in the donor
      const prev = best.get(pnorm);
      if (!prev || shared > prev.shared || (shared === prev.shared && d.total > prev.total)) {
        best.set(pnorm, { praw, donor: d.raw, shared, total: d.total });
      }
    }
  }

  const ranked = [...best.values()].sort((a, b) => b.shared - a.shared || b.total - a.total);
  console.log(`unmatched donor-eligible proponents: ${proponents.size}`);
  console.log(`subsidiary/variant candidates (REVIEW MANUALLY before adding to DONOR_ALIASES): ${ranked.length}\n`);
  for (const c of ranked.slice(0, top)) {
    console.log(`  [${c.shared}t $${(c.total / 1e6).toFixed(1)}M] "${c.praw}"  ->  "${c.donor}"`);
  }
}

main().catch((err) => {
  console.error("donation-alias-candidates failed:", err);
  process.exit(1);
});
