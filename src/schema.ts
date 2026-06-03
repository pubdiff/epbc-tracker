// Schema for EPBC referral records.
//
// ArcGIS is the primary data layer (`Referral` fields). The EPBC Public Portal
// adds proponent + location + a single "valid date" via listing-level scrape;
// these land on `ReferralIndexed` as portal-prefixed fields with an
// `enrichedAt` timestamp. Detail pages (longer description, exact decision
// dates, conditions) require login and are out of scope for v1.

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

  // Portal-derived enrichment (listing-level only, optional).
  // Present when we've successfully matched this referral to the EPBC Public
  // Portal entity-grid response. Absent for records older than what the portal
  // exposes (5000-record cap, ~2009-onwards) or runs that haven't enriched yet.
  proponent?: string | null;       // mara_proposerapprovalholdername
  location?: string | null;        // mara_location, free-text
  portalProjectTitle?: string | null;
  validDate?: string | null;       // mara_validdate, ISO date
  statusReason?: string | null;    // statuscode, granular
  incidentId?: string | null;      // CRM GUID for re-fetch
  enrichedAt?: string | null;      // ISO date of last portal enrichment
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
