// Paginated fetcher for the EPBC Public Portal entity-grid-data.json endpoint.
//
// Polite pacing (default 5s between requests). Stops on first 4xx/5xx so we
// never punch through rate limiting. Caller is responsible for resume logic.

import { GRID_ENDPOINT, PORTAL_HOST, PORTAL_REFERER, USER_AGENT } from "./constants.ts";
import type { PortalListResponse, PortalSession } from "./types.ts";

export interface FetchPageOptions {
  page: number;
  pageSize?: number;
  timezoneOffset?: number;
}

export async function fetchPage(
  session: PortalSession,
  opts: FetchPageOptions,
): Promise<PortalListResponse> {
  const body = {
    base64SecureConfiguration: session.base64SecureConfiguration,
    sortExpression: "createdon DESC",
    search: "",
    page: opts.page,
    pageSize: opts.pageSize ?? 50,
    pagingCookie: "",
    filter: null,
    metaFilter: null,
    nlSearchFilter: "",
    timezoneOffset: opts.timezoneOffset ?? 0,
    customParameters: [],
  };

  const response = await fetch(GRID_ENDPOINT, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/json; charset=utf-8",
      "X-Requested-With": "XMLHttpRequest",
      "Origin": PORTAL_HOST,
      "Referer": PORTAL_REFERER,
      "__RequestVerificationToken": session.requestVerificationToken,
      "Cookie": session.cookieHeader,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const snippet = (await response.text()).slice(0, 300);
    throw new PortalFetchError(
      `Portal returned ${response.status} on page ${opts.page}: ${snippet}`,
      response.status,
    );
  }

  const text = await response.text();
  if (!text) {
    throw new PortalFetchError(
      `Portal returned empty body on page ${opts.page} (HTTP 200). ` +
        `Session may have expired - re-bootstrap.`,
      200,
    );
  }
  return JSON.parse(text) as PortalListResponse;
}

export class PortalFetchError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PortalFetchError";
    this.status = status;
  }
}

export interface CrawlOptions {
  pageSize: number;
  startPage: number;
  maxPages?: number;
  delayMs: number;
  onPage?: (page: number, response: PortalListResponse) => Promise<void> | void;
}

export async function crawlAll(
  session: PortalSession,
  opts: CrawlOptions,
): Promise<void> {
  let page = opts.startPage;
  let processed = 0;
  while (true) {
    if (opts.maxPages != null && processed >= opts.maxPages) {
      console.log(`reached maxPages=${opts.maxPages}, stopping`);
      return;
    }
    const response = await fetchPage(session, { page, pageSize: opts.pageSize });
    if (opts.onPage) await opts.onPage(page, response);
    if (!response.MoreRecords || response.Records.length === 0) {
      console.log(`no more records after page ${page}`);
      return;
    }
    page++;
    processed++;
    if (opts.delayMs > 0) await sleep(opts.delayMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
