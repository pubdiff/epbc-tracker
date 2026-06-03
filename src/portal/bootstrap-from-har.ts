// Extracts a PortalSession from a Firefox/Chrome HAR file.
//
// The HAR must contain at least one successful POST to
// /_services/entity-grid-data.json/<list-guid> from a logged-out browser
// session. We pull the auth cookies, __RequestVerificationToken header, and
// the server-encrypted base64SecureConfiguration from the captured request.
//
// Designed for one-shot backfills. For ongoing weekly runs, use the
// playwright bootstrap.

import { readFile } from "node:fs/promises";
import type { PortalSession } from "./types.ts";

interface HarHeader { name: string; value: string }
interface HarRequest { method: string; url: string; headers: HarHeader[]; postData?: { text: string } }
interface HarResponse { status: number }
interface HarEntry { request: HarRequest; response: HarResponse }
interface HarFile { log: { entries: HarEntry[] } }

export async function bootstrapFromHar(harPath: string): Promise<PortalSession> {
  const text = await readFile(harPath, "utf8");
  const har = JSON.parse(text) as HarFile;

  const entry = har.log.entries.find(
    (e) =>
      e.request.method === "POST" &&
      e.request.url.includes("/_services/entity-grid-data.json/") &&
      e.response.status === 200,
  );
  if (!entry) {
    throw new Error(
      `No successful POST to entity-grid-data.json found in ${harPath}. ` +
        `Re-capture the HAR with the listing page loaded.`,
    );
  }

  const headers = Object.fromEntries(
    entry.request.headers.map((h) => [h.name.toLowerCase(), h.value] as const),
  );

  const cookieHeader = headers["cookie"];
  const requestVerificationToken = headers["__requestverificationtoken"];
  if (!cookieHeader) throw new Error("HAR entry missing Cookie header");
  if (!requestVerificationToken) {
    throw new Error("HAR entry missing __RequestVerificationToken header");
  }

  if (!entry.request.postData?.text) {
    throw new Error("HAR entry missing POST body");
  }
  const body = JSON.parse(entry.request.postData.text) as {
    base64SecureConfiguration: string;
  };
  if (!body.base64SecureConfiguration) {
    throw new Error("POST body missing base64SecureConfiguration");
  }

  return {
    cookieHeader,
    requestVerificationToken,
    base64SecureConfiguration: body.base64SecureConfiguration,
  };
}
