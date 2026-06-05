import { test } from "node:test";
import assert from "node:assert/strict";
import type { RawArcGisAttributes } from "./schema.ts";
import { stageRank, pickBetter, dedupeByReference } from "./referral-dedup.ts";

function attrs(p: Partial<RawArcGisAttributes>): RawArcGisAttributes {
  return {
    OBJECTID: 0,
    REFERENCE_NUMBER: "2021/0001",
    PROPOSAL_ID: null,
    NAME: null,
    PRIMARY_JURISDICTION: null,
    REFERRAL_DECISION: null,
    STANDARD_DETERMINATION: null,
    STATUS_DESCRIPTION: null,
    STAGE_NAME: null,
    REFERRAL_TYPE: null,
    YEAR: null,
    CATEGORY: null,
    REFERRAL_URL: null,
    CRM_ID: null,
    ...p,
  };
}

test("stageRank orders lifecycle, unknown/null lowest", () => {
  assert.ok(stageRank("Completed") > stageRank("Post-Approval"));
  assert.ok(stageRank("Post-Approval") > stageRank("Assessment"));
  assert.ok(stageRank("Assessment") > stageRank("Referral Publication"));
  assert.equal(stageRank("Something New"), 0);
  assert.equal(stageRank(null), 0);
});

test("pickBetter prefers the most-advanced stage", () => {
  const a = attrs({ OBJECTID: 1, STAGE_NAME: "Assessment Approach" });
  const b = attrs({ OBJECTID: 2, STAGE_NAME: "Post-Approval" });
  assert.equal(pickBetter(a, b).OBJECTID, 2);
  assert.equal(pickBetter(b, a).OBJECTID, 2); // order-independent
});

test("pickBetter tiebreaks on recorded decision then highest OBJECTID", () => {
  const noDecision = attrs({ OBJECTID: 5, STAGE_NAME: "Completed", REFERRAL_DECISION: null });
  const withDecision = attrs({ OBJECTID: 4, STAGE_NAME: "Completed", REFERRAL_DECISION: "Controlled Action" });
  assert.equal(pickBetter(noDecision, withDecision).OBJECTID, 4);

  const lo = attrs({ OBJECTID: 7, STAGE_NAME: "Completed", REFERRAL_DECISION: "X" });
  const hi = attrs({ OBJECTID: 9, STAGE_NAME: "Completed", REFERRAL_DECISION: "X" });
  assert.equal(pickBetter(lo, hi).OBJECTID, 9);
});

test("dedupeByReference collapses duplicates to the advanced record and counts", () => {
  const features = [
    { attributes: attrs({ REFERENCE_NUMBER: "A", OBJECTID: 1, STAGE_NAME: "Referral Publication" }) },
    { attributes: attrs({ REFERENCE_NUMBER: "A", OBJECTID: 2, STAGE_NAME: "Post-Approval" }) },
    { attributes: attrs({ REFERENCE_NUMBER: "B", OBJECTID: 3, STAGE_NAME: "Assessment" }) },
    { attributes: attrs({ REFERENCE_NUMBER: "", OBJECTID: 4 }) }, // no ref, ignored
  ];
  const { kept, collapsed } = dedupeByReference(features);
  assert.equal(kept.length, 2);
  assert.equal(collapsed, 1);
  const a = kept.find((k) => k.REFERENCE_NUMBER === "A");
  assert.equal(a!.STAGE_NAME, "Post-Approval");
});
