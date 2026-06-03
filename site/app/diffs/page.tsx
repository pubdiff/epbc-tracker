import Link from "next/link";
import type { Metadata } from "next";
import { loadDiffs, type Diff } from "@/lib/data";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Diff archive",
  description: "Every weekly snapshot of EPBC Act referral changes, oldest to newest.",
};

function isBootstrap(d: Diff): boolean {
  return d.stats.totalPrevious === 0 && d.stats.addedCount > 1000;
}

function materialCount(d: Diff): number {
  return d.stats.addedCount + d.stats.changedCount + d.stats.removedCount;
}

export default async function DiffArchivePage() {
  const diffs = await loadDiffs();
  // newest first
  const ordered = [...diffs].reverse();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold mb-2">Diff archive</h1>
        <p className="text-[var(--color-muted)] max-w-2xl">
          One entry per weekly run. Each records what changed in the EPBC referral
          dataset since the prior week: new referrals, decisions, stage and status
          changes, and removals. This is the audit trail - the tracker&apos;s reason
          for existing.
        </p>
      </header>

      {ordered.length === 0 ? (
        <p className="text-[var(--color-muted)]">No runs recorded yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-rule)] border-y border-[var(--color-rule)]">
          {ordered.map((d) => {
            const boot = isBootstrap(d);
            const count = materialCount(d);
            return (
              <li key={d.runId} className="py-3">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <Link href={`/diffs/${d.runId}/`} className="font-mono font-medium">
                    {d.runId}
                  </Link>
                  <div className="text-sm text-[var(--color-muted)]">
                    {boot ? (
                      <span>Baseline: {d.stats.addedCount.toLocaleString()} referrals first recorded</span>
                    ) : count === 0 ? (
                      <span>No changes</span>
                    ) : (
                      <span className="flex gap-3 flex-wrap">
                        {d.stats.addedCount > 0 ? <span>+{d.stats.addedCount} new</span> : null}
                        {d.stats.changedCount > 0 ? <span>{d.stats.changedCount} changed</span> : null}
                        {d.stats.removedCount > 0 ? <span>-{d.stats.removedCount} removed</span> : null}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
