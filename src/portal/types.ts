// Types for the EPBC Public Portal (Power Apps Portal / Dynamics 365).
//
// We treat the portal as opaque except for a session triple captured at runtime:
// cookie header string, anti-forgery token, and a server-encrypted view config.

export interface PortalSession {
  cookieHeader: string;
  requestVerificationToken: string;
  base64SecureConfiguration: string;
}

export interface PortalListResponse {
  MoreRecords: boolean;
  Records: PortalRecord[];
  ItemCount: number;
}

export interface PortalRecord {
  Id: string;                  // incidentid GUID
  EntityName: string;          // "incident"
  Attributes: PortalAttribute[];
}

export interface PortalAttribute {
  Name: string;
  Type: string;
  Value: unknown;
  FormattedValue?: string;
  DisplayValue?: unknown;
  DateTimeFormat?: string;
}

// Flattened view of a single record's portal data, keyed by the join field.
export interface PortalEnrichment {
  ticketNumber: string;        // join key, matches Referral.referenceNumber
  incidentId: string;          // CRM GUID for re-fetch
  proponent: string | null;    // mara_proposerapprovalholdername
  location: string | null;     // mara_location, free-text
  projectTitle: string | null; // title, often longer than ArcGIS NAME
  validDate: string | null;    // mara_validdate, ISO date
  statusReason: string | null; // statuscode, more granular than ArcGIS status
  projectStatus: string | null;// incident_statuscode
}
