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
import type { Change, Diff, Referral } from "./schema.ts";
import {
  DIFF_DIR,
  FEED_DIR,
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

function renderRss(items: FeedItem[]): string {
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
    <title>${escapeXml(FEED_TITLE)}</title>
    <link>${escapeXml(SITE_URL)}</link>
    <atom:link href="${escapeXml(SITE_URL)}/feed.xml" rel="self" type="application/rss+xml" />
    <description>${escapeXml(FEED_DESCRIPTION)}</description>
    <language>en-au</language>
    <lastBuildDate>${now}</lastBuildDate>
    <copyright>EPBC referrals data © Commonwealth of Australia (DCCEEW). Feed CC-BY-4.0 pubdiff.</copyright>
${itemsXml}
  </channel>
</rss>
`;
}

function renderJsonFeed(items: FeedItem[]): unknown {
  return {
    version: "https://jsonfeed.org/version/1.1",
    title: FEED_TITLE,
    home_page_url: SITE_URL,
    feed_url: `${SITE_URL}/feed.json`,
    description: FEED_DESCRIPTION,
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

async function main(): Promise<void> {
  const items = await buildItems();
  console.log(`feed: ${items.length} items (capped at ${MAX_ITEMS})`);

  const rss = renderRss(items);
  const jsonFeed = renderJsonFeed(items);

  await writeText(`${FEED_DIR}/feed.xml`, rss);
  await writeJSON(`${FEED_DIR}/feed.json`, jsonFeed);

  console.log(`feed: wrote ${FEED_DIR}/feed.xml and ${FEED_DIR}/feed.json`);
  void isoDate;
}

main().catch((err) => {
  console.error("feed failed:", err);
  process.exit(1);
});
