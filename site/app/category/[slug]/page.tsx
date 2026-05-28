import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadIndex, refSlug, type ReferralIndexed } from "@/lib/data";
import { categorySlug } from "@/lib/categories";
import { jurisdictionName } from "@/lib/jurisdictions";

interface ParamsArg {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-static";
export const dynamicParams = false;

let cache: Map<string, { name: string; referrals: ReferralIndexed[] }> | null = null;

async function getByCategory(): Promise<
  Map<string, { name: string; referrals: ReferralIndexed[] }>
> {
  if (cache) return cache;
  const idx = await loadIndex();
  const map = new Map<string, { name: string; referrals: ReferralIndexed[] }>();
  for (const r of Object.values(idx)) {
    if (!r.category) continue;
    const slug = categorySlug(r.category);
    const entry = map.get(slug) ?? { name: r.category, referrals: [] };
    entry.referrals.push(r);
    map.set(slug, entry);
  }
  cache = map;
  return map;
}

export async function generateStaticParams() {
  const map = await getByCategory();
  return [...map.keys()].map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: ParamsArg): Promise<Metadata> {
  const { slug } = await params;
  const map = await getByCategory();
  const entry = map.get(slug);
  if (!entry) return { title: "Category not found" };
  return {
    title: `${entry.name} referrals`,
    description: `EPBC Act referrals in the ${entry.name} category.`,
  };
}

export default async function CategoryPage({ params }: ParamsArg) {
  const { slug } = await params;
  const map = await getByCategory();
  const entry = map.get(slug);
  if (!entry) notFound();

  const { name, referrals } = entry;
  const total = referrals.length;

  // Stage breakdown
  const byStage = new Map<string, number>();
  for (const r of referrals) {
    const k = r.stage ?? "(unknown)";
    byStage.set(k, (byStage.get(k) ?? 0) + 1);
  }
  const stageRows = [...byStage.entries()].sort((a, b) => b[1] - a[1]);

  // Jurisdiction breakdown
  const byJurisdiction = new Map<string, number>();
  for (const r of referrals) {
    const k = r.jurisdiction ?? "(unknown)";
    byJurisdiction.set(k, (byJurisdiction.get(k) ?? 0) + 1);
  }
  const jurisdictionRows = [...byJurisdiction.entries()].sort((a, b) => b[1] - a[1]);

  // Decision counts
  const decided = referrals.filter((r) => !!r.decision).length;
  const pending = total - decided;

  // Year range
  const years = referrals.map((r) => r.year).filter((y): y is number => y != null);
  const yearMin = years.length ? Math.min(...years) : null;
  const yearMax = years.length ? Math.max(...years) : null;

  // Recent activity - 12 most recently observed
  const recent = [...referrals]
    .sort((a, b) => {
      if (a.lastSeen !== b.lastSeen) return a.lastSeen > b.lastSeen ? -1 : 1;
      return a.referenceNumber.localeCompare(b.referenceNumber);
    })
    .slice(0, 12);

  return (
    <article className="space-y-10">
      <header>
        <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
          Category
        </div>
        <h1 className="text-3xl font-semibold mt-1">{name}</h1>
        <p className="text-[var(--color-muted)] mt-2 max-w-2xl">
          EPBC Act referrals categorised as {name}. Includes referrals across all
          jurisdictions and all stages - browse, filter, or export below.
        </p>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-y border-[var(--color-rule)] py-5">
        <Stat label="Referrals tracked" value={total.toLocaleString()} />
        <Stat label="Decisions reached" value={decided.toLocaleString()} />
        <Stat label="Pending / in process" value={pending.toLocaleString()} />
        <Stat
          label="Year range"
          value={yearMin && yearMax ? (yearMin === yearMax ? String(yearMin) : `${yearMin}–${yearMax}`) : "—"}
        />
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-xl font-semibold">Recently observed</h2>
          <Link
            href={`/all/?c=${encodeURIComponent(name)}`}
            className="text-sm"
          >
            Browse all {total.toLocaleString()} {name} referrals in filter view →
          </Link>
        </div>
        <ul className="space-y-3">
          {recent.map((r) => (
            <li key={r.referenceNumber} className="border-b border-[var(--color-rule)] pb-3">
              <Link
                href={`/r/${refSlug(r.referenceNumber)}/`}
                className="block text-[var(--color-ink)] no-underline hover:underline"
              >
                <div className="font-medium">{r.name ?? r.referenceNumber}</div>
                <div className="text-sm text-[var(--color-muted)] flex flex-wrap gap-x-3 gap-y-1">
                  <span className="font-mono">{r.referenceNumber}</span>
                  {r.year != null ? <span>Submitted {r.year}</span> : null}
                  {r.stage ? <span>{r.stage}</span> : null}
                  {r.jurisdiction ? <span>{r.jurisdiction}</span> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">Breakdown</h2>
        <div className="grid sm:grid-cols-2 gap-6 text-sm">
          <div>
            <h3 className="font-semibold mb-2">By jurisdiction</h3>
            <ul className="space-y-1">
              {jurisdictionRows.map(([j, n]) => (
                <li key={j} className="flex justify-between gap-3">
                  <Link
                    href={`/all/?c=${encodeURIComponent(name)}&j=${encodeURIComponent(j)}`}
                    className="truncate"
                  >
                    {jurisdictionName(j)}{" "}
                    <span className="text-[var(--color-muted)] font-mono text-xs">
                      {j}
                    </span>
                  </Link>
                  <span className="text-[var(--color-muted)] font-mono">
                    {n.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-2">By stage</h3>
            <ul className="space-y-1">
              {stageRows.map(([s, n]) => (
                <li key={s} className="flex justify-between gap-3">
                  <Link
                    href={`/all/?c=${encodeURIComponent(name)}&stage=${encodeURIComponent(s)}`}
                    className="truncate"
                  >
                    {s}
                  </Link>
                  <span className="text-[var(--color-muted)] font-mono">
                    {n.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
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
