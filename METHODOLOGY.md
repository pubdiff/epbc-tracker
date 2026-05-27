# Methodology

## What this tracks

Every referral submitted under the Environment Protection and Biodiversity Conservation Act 1999 (EPBC Act). The source dataset records the spatial extent and basic metadata for each referral. Per-referral detail (proponent, conditions, full decision text, exact submission/decision dates) lives on the EPBC Act Public Portal and is not currently scraped (planned for v1.1).

## Source

Primary data source is the DCCEEW EPBC_Referrals MapServer:

```
https://gis.environment.gov.au/gispubmap/rest/services/ogc_services/EPBC_Referrals/MapServer/0/query
```

This is the web service backing [the Referrals Spatial Database - Public](https://fed.dcceew.gov.au/datasets/erin::epbc-referrals-public-dataset/about). DCCEEW updates it weekly. A quarterly bulk download is published on [data.gov.au](https://data.gov.au/data/dataset/referrals-spatial-database).

Browseable counterpart for humans: the [EPBC Act Public Portal](https://epbcpublicportal.environment.gov.au/all-referrals/).

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

## Pipeline

```
fetch          paged ArcGIS query -> data/raw/YYYY-MM-DD.json
parse          raw -> normalised  -> data/snapshots/YYYY-MM-DD.json
index-update   update data/_index.json with first/last-seen + per-record history
diff           latest snapshot vs prior -> data/diffs/YYYY-MM-DD.json
feed           recent diffs -> site/public/feed.xml + feed.json
post           latest diff -> Bluesky thread, with idempotency via data/_posted.json
```

Each step is idempotent and rerunnable. The git commit at the end of each scrape run is the durable record.

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

- **No proponent.** The source layer doesn't expose the applicant entity. Would need per-referral scraping of the Public Portal.
- **No exact dates.** Only the submission year is published in this layer; submission and decision dates need the Public Portal.
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
- This tracker's derived dataset, code and presentation: CC-BY-4.0 (data) / MIT (code).
