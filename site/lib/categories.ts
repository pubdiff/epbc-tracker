// Category slug helpers. Categories are free-form strings from DCCEEW
// (e.g. "Energy Generation and Supply (renewable)"), so we slug them
// for URL paths and rely on a build-time slug→name map to invert.

export function categorySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
