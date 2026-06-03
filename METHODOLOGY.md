# Methodology

## What this tracks

Every referral submitted under the Environment Protection and Biodiversity Conservation Act 1999 (EPBC Act). The primary source records the spatial extent and basic metadata for each referral. A second source (the EPBC Act Public Portal) adds the **proponent**, location and a "valid date" at the listing level. Deeper per-referral detail (conditions, full decision text, exact decision dates) sits behind a login on the portal and is out of scope.

## Source

Primary data source is the DCCEEW EPBC_Referrals MapServer:

```
https://gis.environment.gov.au/gispubmap/rest/services/ogc_services/EPBC_Referrals/MapServer/0/query
```

This is the web service backing [the Referrals Spatial Database - Public](https://fed.dcceew.gov.au/datasets/erin::epbc-referrals-public-dataset/about). DCCEEW updates it weekly. A quarterly bulk download is published on [data.gov.au](https://data.gov.au/data/dataset/referrals-spatial-database).

The secondary source is the [EPBC Act Public Portal](https://epbcpublicportal.environment.gov.au/all-referrals/), a Microsoft Power Apps portal over the same underlying Dynamics 365 CRM. Its listing grid (the `entity-grid-data.json` service behind the all-referrals page) returns the **proponent / approval holder**, a free-text **location**, and a **valid date** per referral - fields the ArcGIS layer omits. We read only the public, logged-out listing view. Per-referral detail pages require authentication and are not accessed.

## Schema

The ArcGIS layer exposes these attributes. We map them to a stable internal schema:

| Source field | Type | Internal field | Notes |
|---|---|---|---|
| REFERENCE_NUMBER | string | referenceNumber | Primary key (e.g. `2020/8686`). Zero-padding varies in newer years. |
| PROPOSAL_ID | int | proposalId | DCCEEW-internal numeric id |
| NAME | string | name | Project name |
| PRIMARY_JURISDICTION | string | jurisdiction | State / territory code |
| REFERRAL_DECISION | string \| null | decision | Final decision text where reached |
| STANDARD_DETERMINATION | string \| null | determination | Determination class. Often "NA" - we normalise to null. |
| STATUS_DESCRIPTION | string | status | Free-form status, e.g. "Referral Decision Made" |
| STAGE_NAME | string | stage | High-level stage, e.g. "Assessment", "Completed" |
| REFERRAL_TYPE | string | referralType | e.g. "Referral (S68)" |
| YEAR | int | year | Submission year (no exact date) |
| CATEGORY | string | category | Industry category, e.g. "Mining" |
| REFERRAL_URL | string | portalUrl | Generic landing page only - not a deep link |
| CRM_ID | string | crmId | DCCEEW CRM identifier |

Geometry is fetched with `returnGeometry=false` - the tracker does not depend on polygon data for v1.

### Portal enrichment fields

The Public Portal listing adds these, joined to the index by reference number (`ticketnumber` → `referenceNumber`):

| Portal field (CRM logical name) | Internal field | Notes |
|---|---|---|
| mara_proposerapprovalholdername | proponent | Applicant / approval holder entity, e.g. "BHP Pty Ltd" |
| mara_location | location | Free-text site location, e.g. street + suburb + state |
| mara_validdate | validDate | A single portal date (ISO). Semantics not yet pinned to "submitted" vs "validated" - surfaced as-is, labelled "Valid date". |
| statuscode | statusReason | More granular status than the ArcGIS `status` |
| title | portalProjectTitle | Portal's project title; shown only when it differs from `name` |
| incidentid | incidentId | CRM GUID, retained for re-fetch |

Each enriched record carries an `enrichedAt` date. Records with no `enrichedAt` were never matched in the portal (e.g. too old for the portal's window, or not yet enriched). The site degrades gracefully: the "Project details" block only renders when `enrichedAt` is present.

## Pipeline

```
fetch              paged ArcGIS query -> data/raw/YYYY-MM-DD.json
parse              raw -> normalised  -> data/snapshots/YYYY-MM-DD.json
index-update       update data/_index.json with first/last-seen + per-record history
diff               latest snapshot vs prior -> data/diffs/YYYY-MM-DD.json
feed               recent diffs -> site/public/feed.xml + feed.json
build-site-data    _index.json -> site/public/data/referrals.json (filter UI payload)
post               latest diff -> Bluesky thread, with idempotency via data/_posted.json
```

Each step is idempotent and rerunnable. The git commit at the end of each scrape run is the durable record.

Portal enrichment runs as a **separate** pipeline so a portal outage never breaks the core tracker:

```
enrich-portal            portal listing -> data/_portal-enrichment.json (resumable)
merge-portal-enrichment  join enrichment into data/_index.json by reference number
```

`index-update` preserves enrichment fields across weekly ArcGIS refreshes (it spreads the prior record and only overwrites ArcGIS-sourced fields), so enrichment persists once merged. The enrichment crawler bootstraps a portal session two ways: from a captured browser HAR (one-shot backfill, `--bootstrap har`) or via headless Playwright (unattended weekly, `--bootstrap playwright`). The portal's anti-forgery token and encrypted view config are produced by client-side JS, so the session must come from a real browser request rather than being reconstructed.

## Diff semantics

We treat a referral as **changed** if any of these tracked fields differ between snapshots:

```
name, jurisdiction, decision, determination, status, stage, referralType, category
```

The cumulative index (`data/_index.json`) appends a history entry whenever any of `status / stage / decision / determination` differs from the most recent observation. Other field changes are reflected in the current state but do not create new history entries (they're more typically data corrections than substantive process events).

## What is in the feed

The RSS / JSON Feed and the Bluesky posts surface:

- **New referrals**: any record present in the latest snapshot that wasn't in the prior snapshot.
- **Decisions**: a `decision` field change, typically when a referral moves from pending to decided.
- **Stage transitions to "Completed"**: a clear signal the process has terminated.

Routine `status` / `stage` shuffles that are not material progressions are recorded in the per-referral history but are not pushed to the feed or Bluesky.

## Bootstrap behaviour

The very first scrape run has no prior snapshot to compare to. Every record will look "new". This is treated as a baseline and excluded from the feed and Bluesky posts (detected as: prior snapshot total of 0, current additions > 1000). Subsequent runs reflect real changes only.

## Known limitations

- **Proponent comes from a second source.** The ArcGIS layer doesn't expose the applicant; we add it from the Public Portal listing. Records older than the portal's listing window (or not yet enriched) have no proponent - check `enrichedAt`.
- **No exact decision dates.** The ArcGIS layer gives submission year only. The portal exposes a single "valid date" at the listing level (surfaced as-is); exact submission and decision dates live on login-gated detail pages and are not scraped.
- **Portal "valid date" semantics unconfirmed.** It is labelled "Valid date" verbatim rather than asserted as the submission or decision date, pending confirmation against DCCEEW documentation.
- **No deep-link to per-referral portal page.** REFERRAL_URL is a generic landing page. Users need to search the portal for the reference number.
- **History begins from first observation.** Records observed before this tracker existed have no captured pre-history. A v1.1 backfill from the data.gov.au quarterly snapshot is planned.
- **Polygon data omitted.** v1 does not include the spatial layer. A future map view would need to re-enable geometry in the query.

## Auditing

Every snapshot, diff and index update is committed to this repo by the scrape workflow. To reproduce the dataset at any point:

```bash
git log --oneline data/snapshots/
git show <commit-sha>:data/snapshots/YYYY-MM-DD.json
```

To re-derive the parsed snapshot from a raw response:

```bash
# raw is gitignored, but recoverable by re-running fetch (the dataset is destructive,
# so old raw snapshots cannot be re-acquired - only the latest is fetchable)
pnpm run parse
```

## Posting cadence and rate limits

Bluesky posts are capped at 25 per scrape run (a hard ceiling against a misbehaving diff). In practice a typical week has fewer than 10 material changes. The bot threads multi-post runs.

## License and attribution

- DCCEEW data: `EPBC Referrals Spatial Database © Australian Government Department of Climate Change, Energy, the Environment and Water`. We mirror and derive from this under fair-use / open-data norms; the original is government-published.
- Portal enrichment: derived from the public, logged-out listing view of the EPBC Act Public Portal, also © Australian Government DCCEEW. Same open-data basis.
- This tracker's derived dataset, code and presentation: CC-BY-4.0 (data) / MIT (code).
