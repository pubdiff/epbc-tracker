export default function AboutPage() {
  return (
    <article className="space-y-6 max-w-2xl">
      <header>
        <h1 className="text-2xl font-semibold">About</h1>
        <p className="text-[var(--color-muted)] mt-2">
          What this tracks, where the data comes from, and how to verify
          everything yourself.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">What is the EPBC Act</h2>
        <p>
          The Environment Protection and Biodiversity Conservation Act 1999
          (EPBC Act) is the Australian Government&apos;s main piece of national
          environmental legislation. Any project that may significantly impact
          matters of national environmental significance must be referred to
          the Department of Climate Change, Energy, the Environment and Water
          (DCCEEW) for assessment.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">What this tool tracks</h2>
        <p>
          DCCEEW publishes every referral via the EPBC Act Public Portal and
          the Referrals Spatial Database. Both feeds expose only the current
          state: when a referral progresses, the older state is lost.
        </p>
        <p>
          This tracker snapshots the dataset weekly and commits each snapshot
          to a public git repository. The resulting history makes it possible
          to see when each referral was submitted, how its assessment stage
          evolved, and what decision (if any) was reached.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Data source</h2>
        <ul className="space-y-1">
          <li>
            Primary endpoint:{" "}
            <a href="https://gis.environment.gov.au/gispubmap/rest/services/ogc_services/EPBC_Referrals/MapServer">
              gis.environment.gov.au EPBC_Referrals MapServer
            </a>
          </li>
          <li>
            Browseable portal:{" "}
            <a href="https://epbcpublicportal.environment.gov.au/all-referrals/">
              EPBC Act Public Portal
            </a>
          </li>
          <li>
            Quarterly bulk download:{" "}
            <a href="https://data.gov.au/data/dataset/referrals-spatial-database">
              data.gov.au Referrals Spatial Database
            </a>
          </li>
          <li>
            Political donations:{" "}
            <a href="https://transparency.aec.gov.au/">
              AEC Transparency Register
            </a>{" "}
            (annual financial-disclosure returns)
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Methodology</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm">
          <li>
            Weekly cron (Thursday 06:00 AEST) runs a paged ArcGIS query and
            saves the raw response.
          </li>
          <li>
            The response is normalised into a stable schema and committed as a
            weekly snapshot.
          </li>
          <li>
            A health check aborts the run rather than publish a snapshot that
            is empty or has dropped sharply, so a broken fetch can&apos;t
            masquerade as &quot;everything changed&quot;.
          </li>
          <li>
            Each snapshot is diffed against the prior snapshot. New referrals,
            status changes, stage transitions and decisions are surfaced.
          </li>
          <li>
            A separate enrichment adds the <strong>proponent</strong> and
            location from the EPBC Act Public Portal listing, and
            cross-references each proponent against disclosed{" "}
            <strong>political donations</strong> in the AEC Transparency
            Register (matched by normalised name; every figure links to the
            AEC source).
          </li>
          <li>
            Material changes are posted to Bluesky and emitted as RSS / JSON
            Feed items.
          </li>
          <li>
            The first observed snapshot is treated as a baseline, not as news,
            and is excluded from feed output.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Known limitations</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm">
          <li>
            The proponent comes from the EPBC Act Public Portal listing, not
            the ArcGIS layer, so referrals older than the portal&apos;s window
            (or not yet enriched) have no proponent. Exact submission and
            decision dates remain login-gated and are not captured - only the
            submission year.
          </li>
          <li>
            Donation matches are by <strong>normalised name</strong>, not a
            verified identifier (the AEC publishes no ABN), so a match is a
            strong lead rather than proof the proponent and donor are the same
            entity. Sub-threshold gifts (under ~$16.9k) and subsidiary/parent
            name differences are invisible, so a missing match is not proof of
            no donations.
          </li>
          <li>
            DCCEEW&apos;s portal URL is a generic landing page, not a
            deep-link to each referral. We link out where possible but you
            will need to search the portal manually for full detail.
          </li>
          <li>
            History begins from this tracker&apos;s first observation. Prior
            state changes cannot be reconstructed unless a historical
            snapshot is back-filled (planned for v1.1).
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">License and source</h2>
        <p>
          Source code:{" "}
          <a href="https://github.com/pubdiff/epbc-tracker">
            github.com/pubdiff/epbc-tracker
          </a>{" "}
          (MIT). Data: CC-BY-4.0 (underlying DCCEEW data © Commonwealth of
          Australia). Issues, corrections and forks welcome.
        </p>
      </section>
    </article>
  );
}
