// Maps DCCEEW jurisdiction codes to human-readable names.
// Codes not listed here render as-is (we don't pretend to know what we don't).

const NAMES: Record<string, string> = {
  NSW: "New South Wales",
  VIC: "Victoria",
  QLD: "Queensland",
  WA: "Western Australia",
  SA: "South Australia",
  TAS: "Tasmania",
  ACT: "Australian Capital Territory",
  NT: "Northern Territory",
  AAT: "Australian Antarctic Territory",
  CI: "Christmas Island",
  CKI: "Cocos (Keeling) Islands",
  JBT: "Jervis Bay Territory",
  NI: "Norfolk Island",
};

export function jurisdictionName(code: string): string {
  return NAMES[code] ?? code;
}
