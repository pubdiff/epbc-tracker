import Link from "next/link";
import { recentActivity, refSlug, trackerStats } from "@/lib/data";

export default async function HomePage() {
  const [stats, activity] = await Promise.all([trackerStats(), recentActivity(40)]);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-3xl font-semibold mb-2">EPBC Tracker</h1>
        <p className="text-[var(--color-muted)] max-w-2xl">
          A weekly diff of every referral under Australia&apos;s Environment
          Protection and Biodiversity Conservation Act 1999. Sourced from DCCEEW.
          New referrals and decisions are surfaced as they are added or change.
        </p>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-y border-[var(--color-rule)] py-5">
        <Stat label="Tracked referrals" value={stats.total.toLocaleString()} />
        <Stat label="Last update" value={stats.lastUpdate} />
        <Stat label="First tracked" value={stats.firstSeen} />
        <Stat label="Jurisdictions" value={String(stats.byJurisdiction.length)} />
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">Recent activity</h2>
        {activity.length === 0 ? (
          <p className="text-[var(--color-muted)]">
            No diff items yet. Tracking has just started - changes will appear
            from the next weekly run.
          </p>
        ) : (
          <ul className="space-y-3">
            {activity.map((a, i) => (
              <li
                key={`${a.runId}-${a.referenceNumber}-${a.kind}-${i}`}
                className="border-b border-[var(--color-rule)] pb-3"
              >
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="text-sm text-[var(--color-muted)] font-mono">
                    {a.runId}
                  </div>
                  <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
                    {a.headline}
                  </div>
                </div>
                <Link
                  href={`/r/${refSlug(a.referenceNumber)}/`}
                  className="block mt-1 text-[var(--color-ink)] no-underline hover:underline"
                >
                  <span className="font-medium">{a.name ?? a.referenceNumber}</span>{" "}
                  <span className="text-[var(--color-muted)] text-sm">
                    {a.referenceNumber}
                    {a.jurisdiction ? ` - ${a.jurisdiction}` : ""}
                  </span>
                </Link>
                {(a.from || a.to) && a.kind !== "added" ? (
                  <div className="text-sm mt-1">
                    <span className="text-[var(--color-muted)]">
                      {a.from ?? "(none)"}
                    </span>{" "}
                    →{" "}
                    <span>{a.to ?? "(none)"}</span>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">Coverage</h2>
        <div className="grid sm:grid-cols-2 gap-6 text-sm">
          <div>
            <h3 className="font-semibold mb-2">By jurisdiction</h3>
            <ul className="space-y-1">
              {stats.byJurisdiction.map(([j, n]) => (
                <li key={j} className="flex justify-between">
                  <span>{j}</span>
                  <span className="text-[var(--color-muted)]">{n.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-2">By stage</h3>
            <ul className="space-y-1">
              {stats.byStage.slice(0, 10).map(([s, n]) => (
                <li key={s} className="flex justify-between">
                  <span>{s}</span>
                  <span className="text-[var(--color-muted)]">{n.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
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
