import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normaliseEntityName,
  parseCsv,
  isLikelyDonorEntity,
  toDonationMatch,
} from "./donations.ts";

test("normaliseEntityName strips legal suffixes and punctuation", () => {
  assert.equal(normaliseEntityName("ABC Strategies Pty. Ltd."), "ABC STRATEGIES");
  assert.equal(normaliseEntityName("Castile Resources Ltd"), "CASTILE RESOURCES");
  assert.equal(normaliseEntityName("CSR Limited"), "CSR");
});

test("normaliseEntityName collapses subsidiary/variant forms to one key", () => {
  // A project entity and its parent's name should normalise to the same key so
  // exact matching bridges them without an alias.
  const sub = normaliseEntityName("Woodside Energy (Victoria) Pty Ltd");
  const parent = normaliseEntityName("Woodside Energy Group Ltd");
  assert.equal(sub, "WOODSIDE ENERGY");
  assert.equal(parent, "WOODSIDE ENERGY");
});

test("normaliseEntityName drops trustee and care-of clauses", () => {
  assert.equal(
    normaliseEntityName("Capital Hunter Pty Limited (as Trustee for Capital Hunter Unit Trust)"),
    "CAPITAL HUNTER",
  );
  assert.equal(
    normaliseEntityName("DEPARTMENT OF TRANSPORT AND PLANNING c/o VIDA Roads"),
    "DEPARTMENT OF TRANSPORT AND PLANNING",
  );
});

test("isLikelyDonorEntity excludes government and councils", () => {
  assert.equal(isLikelyDonorEntity("Melton City Council"), false);
  assert.equal(isLikelyDonorEntity("Department of Transport and Main Roads"), false);
  assert.equal(isLikelyDonorEntity("MAIN ROADS"), false);
  assert.equal(isLikelyDonorEntity("Azure Minerals Pty Ltd"), true);
  assert.equal(isLikelyDonorEntity("Woodside Energy Ltd"), true);
});

test("parseCsv handles quotes, embedded commas/newlines and doubled quotes", () => {
  const csv = 'a,b,c\r\n"1,000","line\nbreak","say ""hi"""\r\n';
  const rows = parseCsv(csv);
  assert.deepEqual(rows[0], ["a", "b", "c"]);
  assert.deepEqual(rows[1], ["1,000", "line\nbreak", 'say "hi"']);
});

test("toDonationMatch aggregates total, dedupes recipients, sorts FY desc", () => {
  const m = toDonationMatch(
    {
      raw: "Acme Pty Ltd",
      records: [
        { financialYear: "2022-23", recipient: "Party A", date: null, value: 1000 },
        { financialYear: "2024-25", recipient: "Party B", date: null, value: 500 },
        { financialYear: "2023-24", recipient: "Party A", date: null, value: 250 },
      ],
    },
    "exact",
  );
  assert.equal(m.donorName, "Acme Pty Ltd");
  assert.equal(m.matchType, "exact");
  assert.equal(m.total, 1750);
  assert.equal(m.count, 3);
  assert.deepEqual(m.recipients, ["Party A", "Party B"]);
  assert.equal(m.records[0]!.financialYear, "2024-25"); // newest first
});
