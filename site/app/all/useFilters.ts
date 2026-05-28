"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export type ReferralLite = {
  ref: string;
  name: string | null;
  juris: string | null;
  cat: string | null;
  yr: number | null;
  stage: string | null;
  status: string | null;
  decided: boolean;
  first: string;
  last: string;
};

export type DecisionFilter = "any" | "decided" | "pending";
export type SortKey = "last" | "first" | "year" | "name";

export interface Filters {
  q: string;
  jurisdictions: string[];
  categories: string[];
  stages: string[];
  statuses: string[];
  yearFrom: number | null;
  yearTo: number | null;
  decision: DecisionFilter;
  sort: SortKey;
}

export const EMPTY_FILTERS: Filters = {
  q: "",
  jurisdictions: [],
  categories: [],
  stages: [],
  statuses: [],
  yearFrom: null,
  yearTo: null,
  decision: "any",
  sort: "last",
};

// URL param keys. Kept short to keep shared URLs readable.
const KEY = {
  q: "q",
  j: "j",
  c: "c",
  stage: "stage",
  status: "status",
  yf: "yf",
  yt: "yt",
  d: "d",
  s: "s",
} as const;

function parseList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseInt_(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function parseDecision(value: string | null): DecisionFilter {
  if (value === "decided" || value === "pending") return value;
  return "any";
}

function parseSort(value: string | null): SortKey {
  if (value === "first" || value === "year" || value === "name") return value;
  return "last";
}

export function filtersFromParams(params: URLSearchParams): Filters {
  return {
    q: params.get(KEY.q) ?? "",
    jurisdictions: parseList(params.get(KEY.j)),
    categories: parseList(params.get(KEY.c)),
    stages: parseList(params.get(KEY.stage)),
    statuses: parseList(params.get(KEY.status)),
    yearFrom: parseInt_(params.get(KEY.yf)),
    yearTo: parseInt_(params.get(KEY.yt)),
    decision: parseDecision(params.get(KEY.d)),
    sort: parseSort(params.get(KEY.s)),
  };
}

function filtersToParams(filters: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.q) p.set(KEY.q, filters.q);
  if (filters.jurisdictions.length) p.set(KEY.j, filters.jurisdictions.join(","));
  if (filters.categories.length) p.set(KEY.c, filters.categories.join(","));
  if (filters.stages.length) p.set(KEY.stage, filters.stages.join(","));
  if (filters.statuses.length) p.set(KEY.status, filters.statuses.join(","));
  if (filters.yearFrom != null) p.set(KEY.yf, String(filters.yearFrom));
  if (filters.yearTo != null) p.set(KEY.yt, String(filters.yearTo));
  if (filters.decision !== "any") p.set(KEY.d, filters.decision);
  if (filters.sort !== "last") p.set(KEY.s, filters.sort);
  return p;
}

export function isActive(filters: Filters): boolean {
  return (
    filters.q !== "" ||
    filters.jurisdictions.length > 0 ||
    filters.categories.length > 0 ||
    filters.stages.length > 0 ||
    filters.statuses.length > 0 ||
    filters.yearFrom != null ||
    filters.yearTo != null ||
    filters.decision !== "any"
  );
}

export function applyFilters(items: ReferralLite[], filters: Filters): ReferralLite[] {
  const q = filters.q.toLowerCase().trim();
  const hasQ = q.length > 0;

  const jSet = filters.jurisdictions.length ? new Set(filters.jurisdictions) : null;
  const cSet = filters.categories.length ? new Set(filters.categories) : null;
  const stageSet = filters.stages.length ? new Set(filters.stages) : null;
  const statusSet = filters.statuses.length ? new Set(filters.statuses) : null;

  const filtered = items.filter((it) => {
    if (jSet && (!it.juris || !jSet.has(it.juris))) return false;
    if (cSet && (!it.cat || !cSet.has(it.cat))) return false;
    if (stageSet && (!it.stage || !stageSet.has(it.stage))) return false;
    if (statusSet && (!it.status || !statusSet.has(it.status))) return false;
    if (filters.yearFrom != null && (it.yr == null || it.yr < filters.yearFrom)) return false;
    if (filters.yearTo != null && (it.yr == null || it.yr > filters.yearTo)) return false;
    if (filters.decision === "decided" && !it.decided) return false;
    if (filters.decision === "pending" && it.decided) return false;
    if (hasQ) {
      const inName = it.name ? it.name.toLowerCase().includes(q) : false;
      const inRef = it.ref.toLowerCase().includes(q);
      if (!inName && !inRef) return false;
    }
    return true;
  });

  return sortItems(filtered, filters.sort);
}

function sortItems(items: ReferralLite[], key: SortKey): ReferralLite[] {
  const sorted = [...items];
  switch (key) {
    case "last":
      sorted.sort((a, b) => (a.last !== b.last ? (a.last > b.last ? -1 : 1) : a.ref.localeCompare(b.ref)));
      break;
    case "first":
      sorted.sort((a, b) => (a.first !== b.first ? (a.first > b.first ? -1 : 1) : a.ref.localeCompare(b.ref)));
      break;
    case "year":
      sorted.sort((a, b) => {
        if (a.yr === b.yr) return a.ref.localeCompare(b.ref);
        if (a.yr == null) return 1;
        if (b.yr == null) return -1;
        return b.yr - a.yr;
      });
      break;
    case "name":
      sorted.sort((a, b) => {
        const an = a.name ?? "";
        const bn = b.name ?? "";
        return an.localeCompare(bn) || a.ref.localeCompare(b.ref);
      });
      break;
  }
  return sorted;
}

export interface UseFiltersResult {
  filters: Filters;
  setFilters: (next: Filters | ((prev: Filters) => Filters)) => void;
  clear: () => void;
  active: boolean;
}

export function useFilters(): UseFiltersResult {
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters = useMemo(
    () => filtersFromParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const setFilters = useCallback(
    (next: Filters | ((prev: Filters) => Filters)) => {
      const resolved = typeof next === "function" ? next(filters) : next;
      const params = filtersToParams(resolved);
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, filters],
  );

  const clear = useCallback(() => {
    router.replace("?", { scroll: false });
  }, [router]);

  return { filters, setFilters, clear, active: isActive(filters) };
}
