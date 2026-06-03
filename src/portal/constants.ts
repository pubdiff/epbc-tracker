export const PORTAL_HOST = "https://epbcpublicportal.environment.gov.au";
export const PORTAL_REFERER = `${PORTAL_HOST}/all-referrals/`;
export const ENTITY_LIST_ID = "2ab10dab-d681-4911-b881-cc99413f07b6";
export const GRID_ENDPOINT = `${PORTAL_HOST}/_services/entity-grid-data.json/${ENTITY_LIST_ID}`;

// Per-record fields in the listing response (CRM logical names).
export const FIELDS = {
  ticketNumber: "ticketnumber",
  title: "title",
  proponent: "mara_proposerapprovalholdername",
  location: "mara_location",
  industry: "mara_industrytype",
  validDate: "mara_validdate",
  statusCode: "statuscode",
  projectStatus: "incident_statuscode",
  jurisdiction: "mara_primarymarajurisdiction",
} as const;

// Identify ourselves transparently to the portal.
export const USER_AGENT =
  "Mozilla/5.0 (compatible; PubdiffBot/1.0; +https://pubdiff.github.io/epbc-tracker/)";
