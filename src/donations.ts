// Shared helpers for the AEC political-donation enrichment (roadmap B4).
//
// The AEC Transparency Register publishes annual financial-disclosure returns as
// a single ZIP of CSVs at transparency.aec.gov.au. Donation rows expose only a
// free-text donor NAME (no ABN), so we join EPBC proponents to donors by an
// aggressively normalised name. This is deliberately high-precision: we publish
// only exact normalised matches (plus a hand-curated alias table), never fuzzy
// guesses. See notes/B4-SPIKE.md for the feasibility analysis.

import { inflateRawSync } from "node:zlib";
import type { DonationMatch, DonationRecord } from "./schema.ts";

export type { DonationMatch, DonationRecord };

// transparency.aec.gov.au returns HTTP 500 to the default Node/curl UA; a real
// browser UA is required for the download to succeed.
export const AEC_ANNUAL_URL = "https://transparency.aec.gov.au/Download/AllAnnualData";
export const AEC_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Disclosure threshold is CPI-indexed; gifts below it are not itemised, so
// sub-threshold donations are structurally invisible. Surfaced in methodology.
export const AEC_THRESHOLD_NOTE =
  "AEC discloses only donations above an annually indexed threshold (>$16,900 for 2024-25). Smaller gifts are not itemised. Annual returns publish each February, so the most recent financial year lags ~1 year.";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// DonationRecord + DonationMatch are defined in schema.ts (re-exported above)
// so the indexed record shape has a single source of truth.

export interface DonationsEnrichmentFile {
  generatedAt: string;
  source: "aec-transparency-register-annual";
  sourceUrl: string;
  thresholdNote: string;
  count: number; // number of matched proponents
  // keyed by normalised proponent name
  records: Record<string, DonationMatch>;
}

// ---------------------------------------------------------------------------
// Name normalisation (identical on both the proponent and donor sides)
// ---------------------------------------------------------------------------

const LEGAL_NOISE =
  /\b(PTY|PROPRIETARY|LTD|LIMITED|LMITED|INC|INCORPORATED|CO|COMPANY|GROUP|HOLDINGS?|AUSTRALIA|AUST)\b/g;

export function normaliseEntityName(name: string): string {
  let s = String(name).toUpperCase();
  s = s.replace(/\(.*?\)/g, " "); // drop parentheticals (often trustee/subsidiary clauses)
  s = s.replace(/\bAS TRUSTEE FOR\b.*$/, " ");
  s = s.replace(/\bC\/O\b.*$/, " "); // care-of routing
  s = s.replace(LEGAL_NOISE, " ");
  s = s.replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

// Hand-curated subsidiary/variant -> canonical donor aliases. Keyed by the
// NORMALISED proponent name, value is the NORMALISED donor name to join on.
// Exact-normalised already collapses most variants (the noise stripper maps
// "X Energy (Victoria) Pty Ltd" and "X Energy Group Ltd" to the same key);
// this table only covers cases the stripper can't bridge - subsidiary->parent
// where the project entity donates under its parent's name, or a suffix the
// stripper keeps (NL). Generate candidates with `donation-alias-candidates`,
// then add ONLY manually verified same-entity / clear-parent pairs here -
// auto-fuzzy is unsafe (it produces false positives like "Western Power
// Corporation" ~ "Western Mining Corporation"). Each entry verified 2026-06-05.
export const DONOR_ALIASES: Record<string, string> = {
  "WESTERN AREAS": "WESTERN AREAS NL", // Western Areas Limited / N.L (nickel miner)
  "NORTHERN STAR": "NORTHERN STAR RESOURCES", // Northern Star (Carosue Dam / Pilbara) -> parent
  "PACIFIC HYDRO DEVELOPMENTS": "PACIFIC HYDRO",
  "KIMBERLEY DIAMOND": "KIMBERLEY DIAMOND NL",
  "XIANG RONG INVESTMENTS": "XIANG RONG INVESTMENT",
  "BOWEN PIPELINE": "BOWEN PIPELINE ATF BOWEN PIPELINE UNIT TRUST",
};

// Government / council proponents are never political donors; skip them so a
// coincidental name collision can't produce a false "donation" claim.
export function isLikelyDonorEntity(name: string): boolean {
  const u = name.toUpperCase();
  if (/\b(COUNCIL|SHIRE|CITY OF|MUNICIPAL)\b/.test(u)) return false;
  if (/\b(DEPARTMENT|DEPT|MAIN ROADS|MINISTER|COMMISSION|AUTHORITY|UNIVERSITY|CROWN|STATE OF|COMMONWEALTH|GOVERNMENT)\b/.test(u))
    return false;
  return true;
}

// ---------------------------------------------------------------------------
// CSV (RFC-style: quoted fields, embedded commas/newlines, doubled quotes)
// ---------------------------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Minimal ZIP reader (deflate / stored), dependency-free.
// Reads via the central directory for reliable sizes + offsets.
// ---------------------------------------------------------------------------

export function readZipEntries(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  // Locate End Of Central Directory record (sig 0x06054b50), scanning from end.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip: End Of Central Directory not found");
  const entryCount = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // central directory offset

  for (let n = 0; n < entryCount; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("zip: bad central directory header");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    // Jump to the local file header to find the actual data start (its own
    // name/extra lengths can differ from the central directory's).
    if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("zip: bad local file header");
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);
    const data = method === 0 ? comp : inflateRawSync(comp);
    out.set(name, Buffer.from(data));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Donor index: normalised donor name -> aggregated donations
// ---------------------------------------------------------------------------

export interface DonorAggregate {
  raw: string; // representative verbatim donor name
  records: DonationRecord[];
}

// Build a normalised-name -> aggregate map from the AEC "Donations Made" and the
// donation-typed rows of "Detailed Receipts".
export function buildDonorIndex(zip: Map<string, Buffer>): Map<string, DonorAggregate> {
  const donors = new Map<string, DonorAggregate>();
  const add = (rawName: string, rec: DonationRecord) => {
    const key = normaliseEntityName(rawName);
    if (!key) return;
    const agg = donors.get(key) ?? { raw: rawName.trim(), records: [] };
    agg.records.push(rec);
    donors.set(key, agg);
  };

  const made = zip.get("Donations Made.csv");
  if (made) {
    // FY, Donor Name, Donation Made To, Date, Value
    const rows = parseCsv(made.toString("utf8"));
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length < 5) continue;
      add(r[1]!, { financialYear: r[0]!, recipient: r[2]!.trim(), date: r[3] || null, value: Number(r[4]) || 0 });
    }
  }

  const receipts = zip.get("Detailed Receipts.csv");
  if (receipts) {
    // FY, Return Type, Recipient Name, Received From, Receipt Type, Value
    const rows = parseCsv(receipts.toString("utf8"));
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length < 6) continue;
      if (!/donation/i.test(r[4]!)) continue; // exclude "other receipt" rows
      add(r[3]!, { financialYear: r[0]!, recipient: r[2]!.trim(), date: null, value: Number(r[5]) || 0 });
    }
  }

  return donors;
}

export function toDonationMatch(
  agg: DonorAggregate,
  matchType: "exact" | "alias",
): DonationMatch {
  const records = [...agg.records].sort((a, b) => b.financialYear.localeCompare(a.financialYear));
  const recipients = [...new Set(records.map((r) => r.recipient))].sort((a, b) => a.localeCompare(b));
  return {
    donorName: agg.raw,
    matchType,
    total: records.reduce((n, r) => n + r.value, 0),
    count: records.length,
    recipients,
    records,
  };
}
