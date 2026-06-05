import { loadIndex, refSlug, type DonationMatch, type ReferralIndexed } from "@/lib/data";
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

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = (await getSlugMap()).get(slug);
  if (!r) return {};
  const title = `${r.referenceNumber}${r.name ? ` - ${r.name}` : ""}`;
  const bits = [
    r.proponent ? `Proponent: ${r.proponent}` : null,
    r.jurisdiction,
    r.year != null ? String(r.year) : null,
  ].filter(Boolean);
  const description = `EPBC Act referral. ${bits.join(". ")}.`;
  return {
    title,
    description,
    openGraph: { title: `${title} - EPBC Tracker`, description },
    twitter: { title: `${title} - EPBC Tracker`, description },
  };
}

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
        <div className="text-sm text-[var(--color-muted)] mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {r.year != null ? <span>Submitted {r.year}</span> : null}
          <span>First observed by tracker {r.firstSeen}</span>
          <span>Last observed {r.lastSeen}</span>
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

      {r.enrichedAt ? (
        <section>
          <h2 className="text-lg font-semibold mb-3">
            Project details{" "}
            <span className="text-xs font-normal text-[var(--color-muted)]">
              via EPBC Public Portal
            </span>
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 text-sm">
            <Row k="Proponent" v={r.proponent ?? null} />
            <Row k="Valid date" v={r.validDate ?? null} />
            <Row k="Location" v={r.location ?? null} />
            <Row k="Status reason" v={r.statusReason ?? null} />
            {r.portalProjectTitle && r.portalProjectTitle !== r.name ? (
              <Row k="Portal title" v={r.portalProjectTitle} />
            ) : null}
          </dl>
        </section>
      ) : null}

      {r.donations ? <DonationsSection proponent={r.proponent ?? null} d={r.donations} /> : null}

      <RelatedSearches r={r} />

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

const AUD = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

// Disclosed political donations by this referral's proponent, joined from the
// AEC Transparency Register by normalised entity name. We surface the data
// without editorialising; every figure links back to the AEC source.
function DonationsSection({ proponent, d }: { proponent: string | null; d: DonationMatch }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">
        Disclosed political donations{" "}
        <span className="text-xs font-normal text-[var(--color-muted)]">
          via AEC Transparency Register
        </span>
      </h2>
      <p className="text-sm text-[var(--color-muted)] mb-3">
        This proponent
        {proponent && proponent.trim().toUpperCase() !== d.donorName.toUpperCase() ? (
          <>
            {" "}({proponent}){" "}matches the disclosed donor{" "}
            <span className="text-[var(--color-ink)]">{d.donorName}</span>
          </>
        ) : (
          <>
            {" "}is recorded as the disclosed donor{" "}
            <span className="text-[var(--color-ink)]">{d.donorName}</span>
          </>
        )}
        . Matched by {d.matchType === "exact" ? "exact normalised name" : "a curated name alias"}; verify
        identity before relying on it. The AEC discloses only donations above an annually indexed threshold
        (&gt;$16,900 for 2024-25), so smaller or more recent gifts may not appear.
      </p>
      <p className="text-sm mb-3">
        <span className="font-semibold">{AUD.format(d.total)}</span> across {d.count}{" "}
        disclosed {d.count === 1 ? "donation" : "donations"} to{" "}
        {d.recipients.length} {d.recipients.length === 1 ? "recipient" : "recipients"}.
      </p>
      <div className="overflow-x-auto">
        <table className="text-sm w-full border-collapse">
          <thead>
            <tr className="text-left text-[var(--color-muted)] border-b border-[var(--color-rule)]">
              <th className="py-1 pr-4 font-normal">Financial year</th>
              <th className="py-1 pr-4 font-normal">Recipient</th>
              <th className="py-1 font-normal text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {d.records.map((rec, i) => (
              <tr key={`${rec.financialYear}-${rec.recipient}-${i}`} className="border-b border-[var(--color-rule)]">
                <td className="py-1 pr-4 font-mono whitespace-nowrap">{rec.financialYear}</td>
                <td className="py-1 pr-4">{rec.recipient}</td>
                <td className="py-1 text-right whitespace-nowrap">{AUD.format(rec.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--color-muted)] mt-3">
        Source:{" "}
        <a href="https://transparency.aec.gov.au/" target="_blank" rel="noopener noreferrer">
          AEC Transparency Register
        </a>{" "}
        (annual returns). Donations are filed under the donor&apos;s own name; a project-specific
        subsidiary may donate under its parent entity, and vice versa.
      </p>
    </section>
  );
}

interface SearchLink {
  label: string;
  url: string;
}

function projectSearchLinks(name: string): SearchLink[] {
  const phrase = `"${name}"`;
  return [
    { label: "Google", url: `https://www.google.com/search?q=${encodeURIComponent(phrase)}` },
    { label: "Google News", url: `https://news.google.com/search?q=${encodeURIComponent(phrase)}` },
    { label: "AustLII", url: `https://www.austlii.edu.au/cgi-bin/sinosrch.cgi?method=auto&query=${encodeURIComponent(name)}` },
  ];
}

function proponentSearchLinks(proponent: string): SearchLink[] {
  const phrase = `"${proponent}"`;
  return [
    { label: "Google", url: `https://www.google.com/search?q=${encodeURIComponent(phrase)}` },
    { label: "Google News", url: `https://news.google.com/search?q=${encodeURIComponent(phrase)}` },
    { label: "ABN Lookup", url: `https://abr.business.gov.au/Search/ResultsActive?SearchText=${encodeURIComponent(proponent)}` },
    { label: "AustLII", url: `https://www.austlii.edu.au/cgi-bin/sinosrch.cgi?method=auto&query=${encodeURIComponent(proponent)}` },
  ];
}

function RelatedSearches({ r }: { r: ReferralIndexed }) {
  const name = r.name?.trim() || null;
  const proponent = r.proponent?.trim() || null;
  if (!name && !proponent) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Related searches</h2>
      <p className="text-sm text-[var(--color-muted)] mb-4">
        Pre-formed queries against external sources for further research.
      </p>
      <div className="space-y-4 text-sm">
        {name ? <SearchGroup label="Project" value={name} links={projectSearchLinks(name)} /> : null}
        {proponent ? (
          <SearchGroup label="Proponent" value={proponent} links={proponentSearchLinks(proponent)} />
        ) : null}
      </div>
    </section>
  );
}

function SearchGroup({ label, value, links }: { label: string; value: string; links: SearchLink[] }) {
  return (
    <div>
      <div className="text-[var(--color-muted)] mb-1">
        {label}: <span className="text-[var(--color-ink)]">{value}</span>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {links.map((l) => (
          <li key={l.url}>
            <a href={l.url} target="_blank" rel="noopener noreferrer">
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
