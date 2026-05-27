import { loadIndex, refSlug, type ReferralIndexed } from "@/lib/data";
import { notFound } from "next/navigation";

// Module-scoped slug -> referral map. Built once per build, shared across the
// 7,600+ generateStaticParams invocations. Without this we'd do an O(n) find()
// per page, which is O(n²) = ~58M ops at our scale.
let slugMapCache: Map<string, ReferralIndexed> | null = null;
async function getSlugMap(): Promise<Map<string, ReferralIndexed>> {
  if (slugMapCache) return slugMapCache;
  const idx = await loadIndex();
  const map = new Map<string, ReferralIndexed>();
  for (const r of Object.values(idx)) {
    map.set(refSlug(r.referenceNumber), r);
  }
  slugMapCache = map;
  return map;
}

export async function generateStaticParams() {
  const map = await getSlugMap();
  return [...map.keys()].map((slug) => ({ slug }));
}

export const dynamicParams = false;

export default async function ReferralPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const map = await getSlugMap();
  const entry = map.get(slug);
  if (!entry) notFound();
  return <ReferralDetail r={entry} />;
}

function ReferralDetail({ r }: { r: ReferralIndexed }) {
  return (
    <article className="space-y-8">
      <header>
        <div className="font-mono text-sm text-[var(--color-muted)]">
          {r.referenceNumber}
        </div>
        <h1 className="text-2xl font-semibold mt-1">{r.name ?? "(unnamed referral)"}</h1>
        <div className="text-sm text-[var(--color-muted)] mt-1">
          First observed by tracker {r.firstSeen} - last observed {r.lastSeen}
        </div>
      </header>

      <section>
        <h2 className="text-lg font-semibold mb-3">Current state</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 text-sm">
          <Row k="Jurisdiction" v={r.jurisdiction} />
          <Row k="Year" v={r.year != null ? String(r.year) : null} />
          <Row k="Category" v={r.category} />
          <Row k="Referral type" v={r.referralType} />
          <Row k="Stage" v={r.stage} />
          <Row k="Status" v={r.status} />
          <Row k="Decision" v={r.decision} />
          <Row k="Determination" v={r.determination} />
        </dl>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Observed history</h2>
        {r.history.length === 0 ? (
          <p className="text-[var(--color-muted)] text-sm">No history recorded.</p>
        ) : (
          <ol className="space-y-3 text-sm">
            {[...r.history].reverse().map((h, i) => (
              <li
                key={`${h.observedAt}-${i}`}
                className="border-l-2 border-[var(--color-rule)] pl-3"
              >
                <div className="font-mono text-[var(--color-muted)]">{h.observedAt}</div>
                <div>Stage: {h.stage ?? "-"}</div>
                <div>Status: {h.status ?? "-"}</div>
                {h.decision ? <div>Decision: {h.decision}</div> : null}
                {h.determination ? <div>Determination: {h.determination}</div> : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Source</h2>
        <p className="text-sm">
          {r.portalUrl ? (
            <a href={r.portalUrl} rel="noopener noreferrer">
              EPBC Act Public Notices portal
            </a>
          ) : (
            <span className="text-[var(--color-muted)]">No source link.</span>
          )}{" "}
          <span className="text-[var(--color-muted)]">
            (the portal does not deep-link to individual referrals; search there
            for the reference number)
          </span>
        </p>
      </section>
    </article>
  );
}

function Row({ k, v }: { k: string; v: string | null }) {
  return (
    <>
      <dt className="text-[var(--color-muted)]">{k}</dt>
      <dd>{v ?? "-"}</dd>
    </>
  );
}
