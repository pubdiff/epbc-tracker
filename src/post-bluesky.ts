// Post the latest diff to Bluesky.
// Behaviour:
// - Reads the latest diff file
// - Skips the bootstrap diff (first run)
// - For each new referral and each material change, posts one entry
// - Threads the run when there are >1 posts
// - Idempotency: writes data/_posted.json so reruns never repost
//
// Env:
//   BSKY_HANDLE         e.g. pubdiff.com or pubdiff.bsky.social
//   BSKY_APP_PASSWORD   from Bluesky Settings - Privacy - App Passwords
//   BSKY_DRY_RUN=1      print posts instead of sending (for testing)

import { readdir } from "node:fs/promises";
import { AtpAgent, RichText } from "@atproto/api";
import type { Change, Diff, PostedRecord, Referral, ReferralIndex } from "./schema.ts";
import {
  DIFF_DIR,
  INDEX_PATH,
  POSTED_PATH,
  readJSON,
  writeJSON,
} from "./lib.ts";

const MAX_POSTS_PER_RUN = 25; // hard cap; we'd never want a 100-post thread on a weird week

function isBootstrap(d: Diff): boolean {
  return d.stats.totalPrevious === 0 && d.stats.addedCount > 1000;
}

function fmtAdded(r: Referral): string {
  const lines: string[] = [];
  lines.push(`NEW: ${r.name ?? r.referenceNumber}`);
  const meta: string[] = [];
  if (r.jurisdiction) meta.push(r.jurisdiction);
  if (r.category) meta.push(r.category);
  if (r.referralType) meta.push(r.referralType);
  if (meta.length) lines.push(meta.join(" - "));
  lines.push(`Ref: ${r.referenceNumber}`);
  if (r.status) lines.push(`Status: ${r.status}`);
  return truncate(lines.join("\n"), 300);
}

function fmtChange(c: Change, idx: ReferralIndex): string {
  const cur = idx[c.referenceNumber];
  const name = cur?.name ?? c.referenceNumber;
  const lines: string[] = [];

  // headline
  if (c.to.decision !== undefined && c.to.decision !== c.from.decision) {
    lines.push(`DECISION: ${name}`);
    lines.push(`→ ${c.to.decision ?? "(cleared)"}`);
  } else if (c.to.stage !== undefined && c.to.stage !== c.from.stage) {
    lines.push(`STAGE: ${name}`);
    lines.push(`${c.from.stage ?? "(none)"} → ${c.to.stage ?? "(none)"}`);
  } else if (c.to.status !== undefined && c.to.status !== c.from.status) {
    lines.push(`STATUS: ${name}`);
    lines.push(`${c.from.status ?? "(none)"} → ${c.to.status ?? "(none)"}`);
  } else {
    lines.push(`UPDATE: ${name}`);
  }

  lines.push(`Ref: ${c.referenceNumber}`);
  if (cur?.jurisdiction) lines.push(`Jurisdiction: ${cur.jurisdiction}`);

  return truncate(lines.join("\n"), 300);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function isPriorityChange(c: Change): boolean {
  // We post when a decision is reached OR when the stage moves into/out of "Completed".
  if (c.to.decision !== undefined && c.to.decision !== c.from.decision) return true;
  if (c.to.stage !== undefined && c.to.stage === "Completed" && c.from.stage !== "Completed") {
    return true;
  }
  return false;
}

async function listDiffs(): Promise<string[]> {
  return (await readdir(DIFF_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort();
}

interface Plan {
  posts: { kind: "added" | "decision"; refKey: string; text: string }[];
  runId: string;
}

async function buildPlan(): Promise<Plan> {
  const files = await listDiffs();
  const latestFile = files[files.length - 1];
  if (!latestFile) throw new Error("no diffs to post");

  const diff = await readJSON<Diff>(`${DIFF_DIR}/${latestFile}`);
  if (!diff) throw new Error(`failed to read latest diff: ${latestFile}`);

  if (isBootstrap(diff)) {
    console.log(`post: skipping bootstrap diff (${diff.stats.addedCount} initial records)`);
    return { posts: [], runId: diff.runId };
  }

  const idx = (await readJSON<ReferralIndex>(INDEX_PATH)) ?? {};
  const posted = (await readJSON<PostedRecord>(POSTED_PATH)) ?? {};

  const posts: Plan["posts"] = [];

  for (const a of diff.added) {
    if (posted[a.referenceNumber]?.added) continue;
    posts.push({ kind: "added", refKey: a.referenceNumber, text: fmtAdded(a) });
  }

  for (const c of diff.changed) {
    if (!isPriorityChange(c)) continue;
    if (posted[c.referenceNumber]?.decision) continue;
    posts.push({ kind: "decision", refKey: c.referenceNumber, text: fmtChange(c, idx) });
  }

  return { posts: posts.slice(0, MAX_POSTS_PER_RUN), runId: diff.runId };
}

async function postThread(plan: Plan): Promise<void> {
  if (plan.posts.length === 0) {
    console.log("post: nothing to post");
    return;
  }

  const dryRun = process.env.BSKY_DRY_RUN === "1";
  const handle = process.env.BSKY_HANDLE;
  const password = process.env.BSKY_APP_PASSWORD;

  if (dryRun) {
    console.log(`post: DRY RUN - would post ${plan.posts.length} items:`);
    for (const p of plan.posts) {
      console.log("---");
      console.log(p.text);
    }
    return;
  }

  if (!handle || !password) {
    throw new Error("BSKY_HANDLE and BSKY_APP_PASSWORD must be set (or BSKY_DRY_RUN=1)");
  }

  const agent = new AtpAgent({ service: "https://bsky.social" });
  await agent.login({ identifier: handle, password });

  const did = agent.session?.did;
  if (!did) throw new Error("Bluesky login succeeded but session has no DID");

  // Load existing _posted.json once; persist after each successful post so a
  // mid-thread failure leaves the items that DID post recorded as posted.
  const posted = (await readJSON<PostedRecord>(POSTED_PATH)) ?? {};

  let root: { uri: string; cid: string } | null = null;
  let parent: { uri: string; cid: string } | null = null;

  for (const p of plan.posts) {
    const rt = new RichText({ text: p.text });
    await rt.detectFacets(agent);
    const post: Record<string, unknown> = {
      $type: "app.bsky.feed.post",
      text: rt.text,
      facets: rt.facets,
      createdAt: new Date().toISOString(),
    };
    if (root && parent) {
      post.reply = { root, parent };
    }

    const res = await agent.com.atproto.repo.createRecord({
      repo: did,
      collection: "app.bsky.feed.post",
      record: post,
    });

    const ref = { uri: res.data.uri, cid: res.data.cid };
    if (!root) root = ref;
    parent = ref;

    const entry = posted[p.refKey] ?? {};
    if (p.kind === "added") entry.added = plan.runId;
    if (p.kind === "decision") entry.decision = plan.runId;
    posted[p.refKey] = entry;
    await writeJSON(POSTED_PATH, posted);

    console.log(`posted: ${p.kind} ${p.refKey} (${res.data.uri})`);
  }
}

async function main(): Promise<void> {
  const plan = await buildPlan();
  console.log(`post: plan has ${plan.posts.length} items for run ${plan.runId}`);
  await postThread(plan);
}

main().catch((err: unknown) => {
  // Log only the message + optional status code. Never log the raw error
  // object - some SDK errors include the request body, which could expose
  // the app password in public workflow logs.
  const msg = err instanceof Error ? err.message : String(err);
  const status =
    err && typeof err === "object" && "status" in err
      ? ` (status ${String((err as { status: unknown }).status)})`
      : "";
  console.error(`post failed: ${msg}${status}`);
  process.exit(1);
});
