// Deterministic dedup of EPBC referrals that share a REFERENCE_NUMBER.
//
// A reference can appear under multiple OBJECTIDs at different lifecycle points
// (e.g. a referral decision and its later approval phase). We keep the
// most-advanced record so the tracker shows the current state - and do it
// deterministically, so a reordered ArcGIS response can't flip which record we
// keep and emit a spurious diff. See notes/E1-duplicate-refs.md.
//
// Pure (no I/O) so it's unit-testable; parse.ts consumes it.

import type { RawArcGisAttributes } from "./schema.ts";

// EPBC lifecycle stages, most-advanced first (higher rank wins).
export const STAGE_RANK: Record<string, number> = {
  Completed: 100,
  "Post-Approval": 90,
  Approval: 80,
  Assessment: 70,
  "Assessment Approach": 65,
  "Further Information Request": 60,
  "Final PD": 55,
  "Proposed Decision Comment": 52,
  "Proposed Decision": 50,
  "Guidelines Issued": 45,
  "Direction to Publish": 42,
  "Referral Decision": 40,
  "Referral Publication": 30,
};

export function stageRank(stage: string | null | undefined): number {
  return STAGE_RANK[(stage ?? "").trim()] ?? 0;
}

// Returns the record that better represents the reference's current state:
// most-advanced stage, then a recorded decision, then highest OBJECTID as a
// stable final tiebreak (so the choice never depends on fetch order).
export function pickBetter(
  a: RawArcGisAttributes,
  b: RawArcGisAttributes,
): RawArcGisAttributes {
  const ra = stageRank(a.STAGE_NAME);
  const rb = stageRank(b.STAGE_NAME);
  if (ra !== rb) return ra > rb ? a : b;
  const da = a.REFERRAL_DECISION ? 1 : 0;
  const db = b.REFERRAL_DECISION ? 1 : 0;
  if (da !== db) return da > db ? a : b;
  return (a.OBJECTID ?? 0) >= (b.OBJECTID ?? 0) ? a : b;
}

// Collapse features sharing a REFERENCE_NUMBER to one best record each.
// Returns the kept attributes (caller parses/sorts) and how many were collapsed.
export function dedupeByReference(
  features: { attributes: RawArcGisAttributes }[],
): { kept: RawArcGisAttributes[]; collapsed: number } {
  const bestByRef = new Map<string, RawArcGisAttributes>();
  let withRef = 0;
  for (const f of features) {
    const ref = f.attributes.REFERENCE_NUMBER;
    if (!ref) continue;
    withRef++;
    const cur = bestByRef.get(ref);
    bestByRef.set(ref, cur ? pickBetter(cur, f.attributes) : f.attributes);
  }
  return { kept: [...bestByRef.values()], collapsed: withRef - bestByRef.size };
}
