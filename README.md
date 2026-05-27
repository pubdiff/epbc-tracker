# epbc-tracker

Weekly diff of every EPBC Act referral. A [pubdiff](https://github.com/pubdiff) tracker.

The Department of Climate Change, Energy, the Environment and Water (DCCEEW) publishes Australia's EPBC Act referrals via the EPBC Act Public Portal and the Referrals Spatial Database. Both feeds expose only the current state - when a referral progresses, the older state is lost. This tracker snapshots the dataset weekly, commits each snapshot to git, and surfaces every status change, stage transition and decision.

- Live site: https://epbc.pubdiff.com (pending DNS)
- Bluesky: [@pubdiff.bsky.social](https://bsky.app/profile/pubdiff.bsky.social) (migrating to `@pubdiff.com`)
- RSS / JSON Feed: `/feed.xml`, `/feed.json` on the site
- Methodology: [METHODOLOGY.md](./METHODOLOGY.md)

## Architecture

```
.github/workflows/   - weekly cron + deploy
src/                 - scraper pipeline (fetch -> parse -> index -> diff -> feed -> post)
data/                - JSON snapshots, diffs and cumulative index (git-tracked)
site/                - Next.js static-export site
```

The scraping pattern follows the [pubdiff template](https://github.com/pubdiff): GitHub Actions runs the pipeline weekly, commits the new data back to the repo, and triggers a site rebuild. Git history is the snapshot history. Diffs come for free.

## Local development

```bash
pnpm install
pnpm run fetch         # query the live ArcGIS endpoint, save raw
pnpm run parse         # raw -> normalised snapshot
pnpm run index-update  # update cumulative _index.json
pnpm run diff          # diff vs prior snapshot
pnpm run feed          # generate feed.xml / feed.json
BSKY_DRY_RUN=1 pnpm run post   # preview Bluesky posts without sending

# or the whole chain:
pnpm run scrape        # everything except post
pnpm run scrape:full   # everything including post

# typecheck
pnpm run typecheck

# site
pnpm run site:dev      # local dev server
pnpm run site:build    # static export to site/out/
```

## Environment

| Variable | Used by | Purpose |
|---|---|---|
| `BSKY_HANDLE` | `post` | Bluesky account handle (e.g. `pubdiff.bsky.social` or `pubdiff.com`) |
| `BSKY_APP_PASSWORD` | `post` | App password from Bluesky Settings > Privacy > App Passwords |
| `BSKY_DRY_RUN=1` | `post` | Print posts instead of sending |

## License

- Code: [MIT](./LICENSE)
- Data: [CC-BY-4.0](./LICENSE-DATA) (underlying DCCEEW data © Commonwealth of Australia)

## Contributing

Issues, corrections and forks welcome. This is intentionally a minimal-dependency tracker so anyone can fork and self-host.

## Operator notes

### Pre-launch manual setup

Things that must be done in the GitHub UI before the first deploy succeeds:

1. **Repo Settings -> Pages -> Source: "GitHub Actions"** (not the default "Deploy from a branch"). Without this the deploy workflow has nowhere to publish.
2. **Repo Settings -> Secrets and variables -> Actions -> Repository secrets**: confirm `BSKY_HANDLE` and `BSKY_APP_PASSWORD` are set.
3. **Settings -> Actions -> General -> Workflow permissions**: confirm "Read and write permissions" is selected (needed for the bot to commit data back).

### Migrating to a custom domain

The initial deploy lives at `https://pubdiff.github.io/epbc-tracker/`. The site is configured for that subpath via `basePath: "/epbc-tracker"` in `site/next.config.ts`, and `src/feed.ts` hardcodes the same root in feed item URLs. To move to `https://epbc.pubdiff.com/`:

1. **DNS** (Namecheap): add CNAME `epbc` -> `pubdiff.github.io`.
2. **GitHub repo Settings -> Pages -> Custom domain**: enter `epbc.pubdiff.com`. Wait for the DNS check to go green. Tick "Enforce HTTPS" once it's available.
3. **Set the `NEXT_BASE_PATH` repo variable to empty** (Settings -> Secrets and variables -> Actions -> Variables). The `deploy.yml` workflow reads this; an empty value disables the subpath.
4. **Update `SITE_URL` in `src/feed.ts`** to `https://epbc.pubdiff.com` (or set a `SITE_URL` repo variable that the scrape workflow exports - currently the constant is the single source of truth).
5. **Update the Bluesky profile link in `site/app/layout.tsx`** to `@epbc.pubdiff.com` once that project handle is registered (deferred to v2; the rollup `@pubdiff.bsky.social` / `@pubdiff.com` is fine for v1).
6. **Push.** The deploy workflow rebuilds; feeds re-emit with the new domain. Existing RSS subscribers' feed URLs continue to resolve because GitHub Pages serves both the github.io and custom-domain URLs.

### Migrating the Bluesky handle

When `pubdiff.com` DNS is set up:

1. Bluesky Settings -> Account -> Handle -> Change handle -> "I have my own domain" -> follow the DNS TXT instructions
2. Update the `BSKY_HANDLE` repo secret from `pubdiff.bsky.social` to `pubdiff.com`
