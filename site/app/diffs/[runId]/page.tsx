import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadDiffs, refSlug, type Change, type Diff } from "@/lib/data";

interface ParamsArg {
  params: Promise<{ runId: string }>;
}

export const dynamic = "force-static";
export const dynamicParams = false;

const ADDED_CAP = 200;

let cache: Map<string, Diff> | null = null;
async function getDiffMap(): Promise<Map<string, Diff>> {
  if (cache) return cache;
  const diffs = await loadDiffs();
  cache = new Map(diffs.map((d) => [d.runId, d]));
  return cache;
}

function isBootstrap(d: Diff): boolean {
  return d.stats.totalPrevious === 0 && d.stats.addedCount > 1000;
}

export async function generateStaticParams() {
  const map = await getDiffMap();
  return [...map.keys()].map((runId) => ({ runId }));
}

export async function generateMetadata({ params }: ParamsArg): Promise<Metadata> {
  const { runId } = await params;
  return {
    title: `Diff ${runId}`,
    description: `EPBC referral changes recorded on ${runId}.`,
  };
}

function changeRows(c: Change): Array<{ field: string; from: string; to: string }> {
  const fields: Array<keyof Change["to"]> = [
    "status",
    "stage",
    "decision",
    "determination",
    "name",
    "jurisdiction",
    "category",
    "referralType",
  ];
  const rows: Array<{ field: string; from: string; to: string }> = [];
  for (const f of fields) {
    if (c.from[f] !== undefined || c.to[f] !== undefined) {
      rows.push({
        field: f,
        from: c.from[f] ?? "(none)",
        to: c.to[f] ?? "(none)",
      });
    }
  }
  return rows;
}

export default async function DiffDetailPage({ params }: ParamsArg) {
  const { runId } = await params;
  const map = await getDiffMap();
  const diff = map.get(runId);
  if (!diff) notFound();

  const boot = isBootstrap(diff);
  const { added, changed, removed, stats } = diff;

  return (
    <article className="space-y-8">
      <header>
        <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
          Weekly diff
        </div>
        <h1 className="text-3xl font-semibold mt-1 font-mono">{runId}</h1>
        <div className="text-sm text-[var(--color-muted)] mt-2">
          <Link href="/diffs/">← All diffs</Link>
        </div>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-y border-[var(--color-rule)] py-5">
        <Stat label="New" value={stats.addedCount.toLocaleString()} />
        <Stat label="Changed" value={stats.changedCount.toLocaleString()} />
        <Stat label="Removed" value={stats.removedCount.toLocaleString()} />
        <Stat label="Total tracked" value={stats.totalCurrent.toLocaleString()} />
      </section>

      {boot ? (
        <p className="text-[var(--color-muted)]">
          This is the baseline run - the first time the tracker recorded the dataset.
          All {stats.addedCount.toLocaleString()} referrals appear as &quot;new&quot;
          here because there was no prior snapshot to compare against. It is excluded
          from the feed and Bluesky. Individual referrals are browsable from{" "}
          <Link href="/all/">the full list</Link>.
        </p>
      ) : (
        <>
          <section>
            <h2 className="text-xl font-semibold mb-3">
              New referrals ({stats.addedCount.toLocaleString()})
            </h2>
            {added.length === 0 ? (
              <p className="text-[var(--color-muted)] text-sm">None this week.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {added.slice(0, ADDED_CAP).map((r) => (
                  <li key={r.referenceNumber} className="border-b border-[var(--color-rule)] pb-2">
                    <Link href={`/r/${refSlug(r.referenceNumber)}/`} className="font-medium">
                      {r.name ?? r.referenceNumber}
                    </Link>{" "}
                    <span className="text-[var(--color-muted)] font-mono">
                      {r.referenceNumber}
                    </span>
                    <div className="text-[var(--color-muted)] flex flex-wrap gap-x-3">
                      {r.jurisdiction ? <span>{r.jurisdiction}</span> : null}
                      {r.category ? <span>{r.category}</span> : null}
                      {r.status ? <span>{r.status}</span> : null}
                    </div>
                  </li>
                ))}
                {added.length > ADDED_CAP ? (
                  <li className="text-[var(--color-muted)] pt-1">
                    + {(added.length - ADDED_CAP).toLocaleString()} more
                  </li>
                ) : null}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              Changes ({stats.changedCount.toLocaleString()})
            </h2>
            {changed.length === 0 ? (
              <p className="text-[var(--color-muted)] text-sm">None this week.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {changed.map((c) => (
                  <li key={c.referenceNumber} className="border-b border-[var(--color-rule)] pb-3">
                    <Link href={`/r/${refSlug(c.referenceNumber)}/`} className="font-mono">
                      {c.referenceNumber}
                    </Link>
                    <ul className="mt-1 space-y-0.5">
                      {changeRows(c).map((row) => (
                        <li key={row.field}>
                          <span className="text-[var(--color-muted)]">{row.field}:</span>{" "}
                          <span className="text-[var(--color-muted)]">{row.from}</span> →{" "}
                          <span>{row.to}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {removed.length > 0 ? (
            <section>
              <h2 className="text-xl font-semibold mb-3">
                Removed ({stats.removedCount.toLocaleString()})
              </h2>
              <ul className="text-sm font-mono flex flex-wrap gap-x-4 gap-y-1">
                {removed.map((ref) => (
                  <li key={ref} className="text-[var(--color-muted)]">{ref}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
        {label}
      </div>
      <div className="text-lg font-semibold font-mono">{value}</div>
    </div>
  );
}
