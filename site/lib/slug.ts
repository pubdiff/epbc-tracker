// Client-safe utilities. No Node-only imports - safe to import from
// "use client" components.

export function refSlug(referenceNumber: string): string {
  return referenceNumber.replace(/[^a-zA-Z0-9]/g, "-");
}
