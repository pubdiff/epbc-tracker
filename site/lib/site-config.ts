// Build-time constants shared by Server Components.
// Sourced from next.config.ts via process.env.

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Absolute site origin (no trailing slash), used as metadataBase for OpenGraph
// / canonical URLs. Mirrors SITE_URL in src/feed.ts; override via env when the
// custom domain (epbc.pubdiff.com) is configured.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://pubdiff.github.io/epbc-tracker";

// Helper for plain <a> / <link> tags that Next.js doesn't auto-prefix.
// Next.js's <Link> component prepends basePath automatically; this helper is
// only needed for raw HTML elements (mostly the RSS auto-discovery <link>s
// in app/layout.tsx and any external-style hrefs).
export function withBase(path: string): string {
  if (path.startsWith("http")) return path;
  return BASE_PATH + path;
}
