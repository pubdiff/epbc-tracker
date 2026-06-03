// Generate RSS 2.0 + JSON Feed 1.1 from the recent diffs.
// Writes site/public/feed.xml and site/public/feed.json.
//
// Behaviour:
// - Reads the most recent N weeks of diffs.
// - Skips the bootstrap diff (the first one ever, where prior was empty) - that's
//   not "news", it's the baseline backfill.
// - Emits feed items for: new referrals, decisions reached, and stage transitions.
// - Caps total feed length at MAX_ITEMS most-recent items.

import { readdir } from "node:fs/promises";
import type { Change, Diff, Referral, ReferralIndex } from "./schema.ts";
import {
  DIFF_DIR,
  FEED_DIR,
  INDEX_PATH,
  isoDate,
  readJSON,
  writeJSON,
} from "./lib.ts";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

// Initial deploy lives at pubdiff.github.io/epbc-tracker. When custom domain
// epbc.pubdiff.com is configured, set SITE_URL env var (or change this constant).
const SITE_URL = process.env.SITE_URL ?? "https://pubdiff.github.io/epbc-tracker";
const FEED_TITLE = "EPBC Tracker - pubdiff";
const FEED_DESCRIPTION =
  "Weekly diff of every EPBC Act referral. Tracks new submissions, decisions, and status changes. A pubdiff tracker.";
const MAX_ITEMS = 100;
const WEEKS_BACK = 12;

interface FeedItem {
  id: string;
  url: string;
  title: string;
  contentText: string;
  contentHtml: string;
  datePublished: string; // ISO 8601
  tags: string[];
  // Grouping keys for per-jurisdiction / per-category feeds (not serialised).
  jurisdiction: string | null;
  category: string | null;
}

// Slug for per-category feed filenames. Mirrors site/lib/categories.ts.
function categorySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function refSlug(referenceNumber: string): string {
  return referenceNumber.replace(/[^a-zA-Z0-9]/g, "-");
}

function refUrl(referenceNumber: string): string {
  return `${SITE_URL}/r/${refSlug(referenceNumber)}`;
}

function itemForAdded(r: Referral, runId: string): FeedItem {
  const title = `New referral: ${r.name ?? r.referenceNumber}`;
  const parts: string[] = [];
  parts.push(`Reference ${r.referenceNumber}`);
  if (r.jurisdiction) parts.push(`Jurisdiction: ${r.jurisdiction}`);
  if (r.category) parts.push(`Category: ${r.category}`);
  if (r.referralType) parts.push(`Type: ${r.referralType}`);
  if (r.status) parts.push(`Status: ${r.status}`);
  const text = parts.join(" - ");
  return {
    id: `urn:epbc-tracker:added:${r.referenceNumber}:${runId}`,
    url: refUrl(r.referenceNumber),
    title,
    contentText: text,
    contentHtml: `<p>${escapeXml(text)}</p>`,
    datePublished: `${runId}T00:00:00Z`,
    tags: ["added", r.jurisdiction, r.category].filter((t): t is string => !!t),
    jurisdiction: r.jurisdiction,
    category: r.category,
  };
}

function itemForChange(c: Change, current: Referral | null, runId: string): FeedItem | null {
  const name = current?.name ?? c.referenceNumber;
  const changes: string[] = [];

  if (c.from.status !== undefined || c.to.status !== undefined) {
    changes.push(`status: "${c.from.status ?? "(none)"}" → "${c.to.status ?? "(none)"}"`);
  }
  if (c.from.stage !== undefined || c.to.stage !== undefined) {
    changes.push(`stage: "${c.from.stage ?? "(none)"}" → "${c.to.stage ?? "(none)"}"`);
  }
  if (c.from.decision !== undefined || c.to.decision !== undefined) {
    changes.push(`decision: "${c.from.decision ?? "(none)"}" → "${c.to.decision ?? "(none)"}"`);
  }
  if (c.from.determination !== undefined || c.to.determination !== undefined) {
    changes.push(
      `determination: "${c.from.determination ?? "(none)"}" → "${c.to.determination ?? "(none)"}"`,
    );
  }

  if (changes.length === 0) return null;

  const headline = c.to.decision || c.to.status || c.to.stage || "Update";
  const title = `${headline}: ${name}`;
  const text = `${c.referenceNumber} - ${changes.join("; ")}`;

  return {
    id: `urn:epbc-tracker:change:${c.referenceNumber}:${runId}:${changes.length}`,
    url: refUrl(c.referenceNumber),
    title,
    contentText: text,
    contentHtml: `<p>${escapeXml(text)}</p>`,
    datePublished: `${runId}T00:00:00Z`,
    tags: ["change", current?.jurisdiction, current?.category].filter(
      (t): t is string => !!t,
    ),
    jurisdiction: current?.jurisdiction ?? c.to.jurisdiction ?? null,
    category: current?.category ?? c.to.category ?? null,
  };
}

async function listDiffs(): Promise<string[]> {
  return (await readdir(DIFF_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort();
}

function isBootstrapDiff(d: Diff): boolean {
  // First-ever run: prior was empty, everything counts as added. Skip from the feed.
  return d.stats.totalPrevious === 0 && d.stats.addedCount > 1000;
}

async function buildItems(): Promise<FeedItem[]> {
  const diffFiles = (await listDiffs()).slice(-WEEKS_BACK);
  const items: FeedItem[] = [];

  // newest first
  for (const file of [...diffFiles].reverse()) {
    const diff = await readJSON<Diff>(`${DIFF_DIR}/${file}`);
    if (!diff) continue;
    if (isBootstrapDiff(diff)) continue;

    for (const added of diff.added) {
      items.push(itemForAdded(added, diff.runId));
    }
    for (const change of diff.changed) {
      const ref = diff.added.find((r) => r.referenceNumber === change.referenceNumber) ?? null;
      const item = itemForChange(change, ref, diff.runId);
      if (item) items.push(item);
    }
  }

  return items.slice(0, MAX_ITEMS);
}

interface FeedMeta {
  title: string;
  description: string;
  feedPath: string; // e.g. "/feed.xml" or "/feed/wa.xml"
}

function renderRss(items: FeedItem[], meta: FeedMeta): string {
  const now = new Date().toUTCString();
  const itemsXml = items
    .map((i) => {
      const pubDate = new Date(i.datePublished).toUTCString();
      return `    <item>
      <title>${escapeXml(i.title)}</title>
      <link>${escapeXml(i.url)}</link>
      <guid isPermaLink="false">${escapeXml(i.id)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(i.contentText)}</description>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(meta.title)}</title>
    <link>${escapeXml(SITE_URL)}</link>
    <atom:link href="${escapeXml(SITE_URL)}${meta.feedPath}" rel="self" type="application/rss+xml" />
    <description>${escapeXml(meta.description)}</description>
    <language>en-au</language>
    <lastBuildDate>${now}</lastBuildDate>
    <copyright>EPBC referrals data © Commonwealth of Australia (DCCEEW). Feed CC-BY-4.0 pubdiff.</copyright>
${itemsXml}
  </channel>
</rss>
`;
}

function renderJsonFeed(items: FeedItem[], meta: FeedMeta): unknown {
  return {
    version: "https://jsonfeed.org/version/1.1",
    title: meta.title,
    home_page_url: SITE_URL,
    feed_url: `${SITE_URL}${meta.feedPath.replace(/\.xml$/, ".json")}`,
    description: meta.description,
    language: "en-AU",
    items: items.map((i) => ({
      id: i.id,
      url: i.url,
      title: i.title,
      content_text: i.contentText,
      content_html: i.contentHtml,
      date_published: i.datePublished,
      tags: i.tags,
    })),
  };
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

async function writeFeed(items: FeedItem[], meta: FeedMeta): Promise<void> {
  await writeText(`${FEED_DIR}${meta.feedPath}`, renderRss(items, meta));
  await writeJSON(
    `${FEED_DIR}${meta.feedPath.replace(/\.xml$/, ".json")}`,
    renderJsonFeed(items, meta),
  );
}

function groupBy(
  items: FeedItem[],
  key: (i: FeedItem) => string | null,
): Map<string, FeedItem[]> {
  const map = new Map<string, FeedItem[]>();
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

async function main(): Promise<void> {
  const items = await buildItems();
  console.log(`feed: ${items.length} items (capped at ${MAX_ITEMS})`);

  // Main feed.
  await writeFeed(items, {
    title: FEED_TITLE,
    description: FEED_DESCRIPTION,
    feedPath: "/feed.xml",
  });

  // Per-jurisdiction and per-category feeds are emitted for EVERY jurisdiction
  // and category present in the index - not just those with changes this week -
  // so the feed URLs are stable from day one and a subscriber's link never 404s.
  // They simply carry whatever recent-diff items match (often empty early on).
  const { jurisdictions, categories } = await indexFacets();
  const byJurisdiction = groupBy(items, (i) => i.jurisdiction);
  const byCategory = groupBy(items, (i) => i.category);

  for (const code of jurisdictions) {
    await writeFeed(byJurisdiction.get(code) ?? [], {
      title: `EPBC Tracker - ${code} - pubdiff`,
      description: `EPBC Act referral changes where the primary jurisdiction is ${code}.`,
      feedPath: `/feed/${code.toLowerCase()}.xml`,
    });
  }
  for (const category of categories) {
    await writeFeed(byCategory.get(category) ?? [], {
      title: `EPBC Tracker - ${category} - pubdiff`,
      description: `EPBC Act referral changes in the ${category} category.`,
      feedPath: `/feed/${categorySlug(category)}.xml`,
    });
  }

  console.log(
    `feed: wrote main + ${jurisdictions.length} jurisdiction + ${categories.length} category feeds to ${FEED_DIR}/feed*`,
  );
  void isoDate;
}

async function indexFacets(): Promise<{ jurisdictions: string[]; categories: string[] }> {
  const index = await readJSON<ReferralIndex>(INDEX_PATH);
  if (!index) return { jurisdictions: [], categories: [] };
  const j = new Set<string>();
  const c = new Set<string>();
  for (const r of Object.values(index)) {
    if (r.jurisdiction) j.add(r.jurisdiction);
    if (r.category) c.add(r.category);
  }
  return {
    jurisdictions: [...j].sort(),
    categories: [...c].sort(),
  };
}

main().catch((err) => {
  console.error("feed failed:", err);
  process.exit(1);
});
