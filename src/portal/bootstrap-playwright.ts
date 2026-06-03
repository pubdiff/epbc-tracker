// Captures a PortalSession by driving a real headless browser.
//
// The portal's anti-forgery token and base64SecureConfiguration are produced
// by client-side Power Apps JS (the secure config is server-encrypted and not
// present in the static HTML), so we can't reconstruct the request with plain
// fetch. Instead we load the listing page, let the portal fire its own
// entity-grid-data.json POST, and lift the session triple straight off that
// request. This is what makes unattended weekly runs possible without a
// human-captured HAR.
//
// Playwright is an OPTIONAL dependency, imported dynamically and typed locally
// so the rest of the toolchain type-checks without it installed. To enable:
//   pnpm add -D playwright && pnpm exec playwright install firefox

import { GRID_ENDPOINT, PORTAL_REFERER, USER_AGENT } from "./constants.ts";
import type { PortalSession } from "./types.ts";

// Minimal structural types for the slice of the Playwright API we touch. Kept
// local so `playwright` need not be installed to compile.
interface PwRequest {
  method(): string;
  url(): string;
  headers(): Record<string, string>;
  postData(): string | null;
}
interface PwPage {
  on(event: "request", handler: (req: PwRequest) => void): void;
  goto(url: string, opts: { waitUntil: string; timeout: number }): Promise<unknown>;
}
interface PwContext {
  newPage(): Promise<PwPage>;
  cookies(): Promise<Array<{ name: string; value: string }>>;
}
interface PwBrowser {
  newContext(opts: { userAgent: string }): Promise<PwContext>;
  close(): Promise<void>;
}
interface PwFirefox {
  launch(opts: { headless: boolean }): Promise<PwBrowser>;
}

export interface PlaywrightBootstrapOptions {
  headless?: boolean;
  timeoutMs?: number;
}

export async function bootstrapWithPlaywright(
  opts: PlaywrightBootstrapOptions = {},
): Promise<PortalSession> {
  const headless = opts.headless ?? true;
  const timeoutMs = opts.timeoutMs ?? 60_000;

  let firefox: PwFirefox;
  try {
    // Non-literal specifier so tsc doesn't statically resolve the optional dep.
    const spec = "playwright";
    const mod = (await import(spec)) as unknown as { firefox: PwFirefox };
    firefox = mod.firefox;
  } catch {
    throw new Error(
      "playwright is not installed. Run: pnpm add -D playwright && pnpm exec playwright install firefox",
    );
  }

  const browser = await firefox.launch({ headless });
  try {
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();

    const captured = new Promise<{ token: string; secureConfig: string; cookieFromReq: string | null }>(
      (resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("timed out waiting for entity-grid-data.json POST")),
          timeoutMs,
        );
        page.on("request", (req: PwRequest) => {
          if (req.method() !== "POST") return;
          if (!req.url().startsWith(GRID_ENDPOINT)) return;
          const headers = req.headers();
          const token = headers["__requestverificationtoken"];
          const postData = req.postData();
          if (!token || !postData) return;
          let secureConfig: string;
          try {
            secureConfig = (JSON.parse(postData) as { base64SecureConfiguration: string })
              .base64SecureConfiguration;
          } catch {
            return;
          }
          if (!secureConfig) return;
          clearTimeout(timer);
          resolve({ token, secureConfig, cookieFromReq: headers["cookie"] ?? null });
        });
      },
    );

    await page.goto(PORTAL_REFERER, { waitUntil: "networkidle", timeout: timeoutMs });
    const { token, secureConfig, cookieFromReq } = await captured;

    // Prefer the cookie header the browser actually sent; fall back to
    // serialising the context jar.
    const cookieHeader =
      cookieFromReq ??
      (await context.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");

    return {
      cookieHeader,
      requestVerificationToken: token,
      base64SecureConfiguration: secureConfig,
    };
  } finally {
    await browser.close();
  }
}
