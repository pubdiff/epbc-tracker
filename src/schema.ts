// Schema for EPBC referral records.
//
// Field availability is constrained by what the DCCEEW EPBC_Referrals MapServer
// publishes. The ArcGIS layer does NOT include proponent name or exact submitted/
// decision dates - only the year. Those fields require scraping the EPBC Act
// Public Portal per-referral and are parked as v1.1 work.

export interface RawArcGisAttributes {
  OBJECTID: number;
  REFERENCE_NUMBER: string;
  PROPOSAL_ID: number | null;
  NAME: string | null;
  PRIMARY_JURISDICTION: string | null;
  REFERRAL_DECISION: string | null;
  STANDARD_DETERMINATION: string | null;
  STATUS_DESCRIPTION: string | null;
  STAGE_NAME: string | null;
  REFERRAL_TYPE: string | null;
  YEAR: number | null;
  CATEGORY: string | null;
  REFERRAL_URL: string | null;
  CRM_ID: string | null;
}

export interface RawArcGisFeature {
  attributes: RawArcGisAttributes;
  // geometry omitted - we fetch with returnGeometry=false
}

export interface RawArcGisResponse {
  features: RawArcGisFeature[];
  exceededTransferLimit?: boolean;
}

export interface Referral {
  referenceNumber: string;       // e.g. "EPBC 2024/9876" - our primary key
  proposalId: number | null;
  name: string | null;
  jurisdiction: string | null;   // PRIMARY_JURISDICTION
  decision: string | null;       // REFERRAL_DECISION
  determination: string | null;  // STANDARD_DETERMINATION
  status: string | null;         // STATUS_DESCRIPTION
  stage: string | null;          // STAGE_NAME
  referralType: string | null;   // REFERRAL_TYPE
  year: number | null;
  category: string | null;
  portalUrl: string | null;      // REFERRAL_URL
  crmId: string | null;
}

export interface ReferralHistoryEntry {
  observedAt: string;            // ISO date (YYYY-MM-DD)
  status: string | null;
  stage: string | null;
  decision: string | null;
  determination: string | null;
}

export interface ReferralIndexed extends Referral {
  firstSeen: string;             // ISO date (YYYY-MM-DD)
  lastSeen: string;              // ISO date (YYYY-MM-DD)
  history: ReferralHistoryEntry[];
}

export type ReferralIndex = Record<string, ReferralIndexed>;

export type ChangedFields = Partial<Pick<
  Referral,
  "name" | "jurisdiction" | "decision" | "determination" | "status" | "stage" | "referralType" | "category"
>>;

export interface Change {
  referenceNumber: string;
  from: ChangedFields;
  to: ChangedFields;
}

export interface Diff {
  runId: string;                 // ISO date of this run (YYYY-MM-DD)
  added: Referral[];
  changed: Change[];
  removed: string[];             // referenceNumbers no longer present
  stats: {
    totalCurrent: number;
    totalPrevious: number;
    addedCount: number;
    changedCount: number;
    removedCount: number;
  };
}

export interface PostedRecord {
  // referenceNumber -> { eventType -> postedAt }
  // Tracks which Bluesky posts we've already made so reruns are idempotent.
  [referenceNumber: string]: {
    added?: string;
    decision?: string;
  };
}
