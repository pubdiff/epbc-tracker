// Build-time constants shared by Server Components.
// Sourced from next.config.ts via process.env.

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Helper for plain <a> / <link> tags that Next.js doesn't auto-prefix.
// Next.js's <Link> component prepends basePath automatically; this helper is
// only needed for raw HTML elements (mostly the RSS auto-discovery <link>s
// in app/layout.tsx and any external-style hrefs).
export function withBase(path: string): string {
  if (path.startsWith("http")) return path;
  return BASE_PATH + path;
}
