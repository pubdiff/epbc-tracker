// Flattens a portal CRM record's Attributes array into a typed enrichment.
//
// Attributes are name-keyed but values come in three forms depending on type:
// - String/option types: { Value: "raw", DisplayValue: "human-readable" }
// - EntityReference: { Value: { Id, LogicalName, Name }, DisplayValue: "Name" }
// - DateTime: ISO string in Value
//
// We prefer DisplayValue (human-readable) and fall back to Value.

import { FIELDS } from "./constants.ts";
import type { PortalAttribute, PortalEnrichment, PortalRecord } from "./types.ts";

function pickString(attrs: PortalAttribute[], name: string): string | null {
  const a = attrs.find((x) => x.Name === name);
  if (!a) return null;
  const candidate = typeof a.DisplayValue === "string" ? a.DisplayValue : null;
  if (candidate) return candidate.trim() || null;
  if (typeof a.Value === "string") return a.Value.trim() || null;
  if (a.Value && typeof a.Value === "object" && "Name" in a.Value) {
    const name = (a.Value as { Name?: string }).Name;
    return name?.trim() || null;
  }
  return null;
}

function pickDate(attrs: PortalAttribute[], name: string): string | null {
  const a = attrs.find((x) => x.Name === name);
  if (!a) return null;
  // Dates may arrive as "/Date(1234567890)/" or "2024-05-29T00:00:00Z" or ISO.
  const raw = typeof a.Value === "string" ? a.Value : null;
  if (!raw) return null;
  const dateMatch = raw.match(/\/Date\((\d+)\)\//);
  if (dateMatch) {
    return new Date(Number(dateMatch[1])).toISOString().slice(0, 10);
  }
  const direct = new Date(raw);
  if (!isNaN(direct.getTime())) return direct.toISOString().slice(0, 10);
  return null;
}

export function normalizeRecord(rec: PortalRecord): PortalEnrichment | null {
  const ticketNumber = pickString(rec.Attributes, FIELDS.ticketNumber);
  if (!ticketNumber) return null;
  return {
    ticketNumber,
    incidentId: rec.Id,
    proponent: pickString(rec.Attributes, FIELDS.proponent),
    location: pickString(rec.Attributes, FIELDS.location),
    projectTitle: pickString(rec.Attributes, FIELDS.title),
    validDate: pickDate(rec.Attributes, FIELDS.validDate),
    statusReason: pickString(rec.Attributes, FIELDS.statusCode),
    projectStatus: pickString(rec.Attributes, FIELDS.projectStatus),
  };
}
