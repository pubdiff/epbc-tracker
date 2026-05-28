"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { BASE_PATH } from "@/lib/site-config";
import { refSlug } from "@/lib/slug";
import {
  applyFilters,
  useFilters,
  type ReferralLite,
} from "./useFilters";
import {
  ChipMulti,
  ClearButton,
  DecisionToggle,
  DropdownMulti,
  SortSelect,
  TextSearch,
  YearRange,
} from "./filters";

interface ReferralsFile {
  generatedAt: string;
  count: number;
  facets: {
    jurisdictions: string[];
    categories: string[];
    stages: string[];
    statuses: string[];
    yearMin: number | null;
    yearMax: number | null;
  };
  items: ReferralLite[];
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ReferralsFile };

const ROW_HEIGHT = 56;

export function AllClient() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const { filters, setFilters, clear, active } = useFilters();

  useEffect(() => {
    const url = `${BASE_PATH}/data/referrals.json`;
    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as ReferralsFile;
      })
      .then((data) => setLoad({ status: "ready", data }))
      .catch((err: unknown) =>
        setLoad({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        }),
      );
  }, []);

  const filtered = useMemo(() => {
    if (load.status !== "ready") return [];
    return applyFilters(load.data.items, filters);
  }, [load, filters]);

  if (load.status === "loading") {
    return (
      <div className="py-8 text-sm text-[var(--color-muted)]">
        Loading {/* SSR-stable text */}referrals…
      </div>
    );
  }
  if (load.status === "error") {
    return (
      <div className="py-8 text-sm text-red-700">
        Failed to load referrals: {load.message}
      </div>
    );
  }

  const { data } = load;
  const total = data.count;
  const showing = filtered.length;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">All referrals</h1>
      <p className="text-[var(--color-muted)] mb-4" aria-live="polite">
        {active
          ? `Showing ${showing.toLocaleString()} of ${total.toLocaleString()} referrals`
          : `${total.toLocaleString()} tracked. Sorted by most recent observation.`}
      </p>

      <FilterStrip
        filters={filters}
        setFilters={setFilters}
        clear={clear}
        active={active}
        facets={data.facets}
      />

      <ResultsList items={filtered} />
    </div>
  );
}

function FilterStrip({
  filters,
  setFilters,
  clear,
  active,
  facets,
}: {
  filters: ReturnType<typeof useFilters>["filters"];
  setFilters: ReturnType<typeof useFilters>["setFilters"];
  clear: () => void;
  active: boolean;
  facets: ReferralsFile["facets"];
}) {
  const yearMin = facets.yearMin ?? 2000;
  const yearMax = facets.yearMax ?? new Date().getFullYear();

  return (
    <div className="border-y border-[var(--color-rule)] py-3 mb-4 space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <TextSearch
          value={filters.q}
          onChange={(q) => setFilters((f) => ({ ...f, q }))}
        />
        <DecisionToggle
          value={filters.decision}
          onChange={(decision) => setFilters((f) => ({ ...f, decision }))}
        />
        <YearRange
          yearMin={yearMin}
          yearMax={yearMax}
          from={filters.yearFrom}
          to={filters.yearTo}
          onChange={({ from, to }) =>
            setFilters((f) => ({ ...f, yearFrom: from, yearTo: to }))
          }
        />
        <SortSelect
          value={filters.sort}
          onChange={(sort) => setFilters((f) => ({ ...f, sort }))}
        />
        {active ? <ClearButton onClick={clear} /> : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <DropdownMulti
          label="Category"
          options={facets.categories}
          selected={filters.categories}
          onChange={(categories) => setFilters((f) => ({ ...f, categories }))}
        />
        <DropdownMulti
          label="Status"
          options={facets.statuses}
          selected={filters.statuses}
          onChange={(statuses) => setFilters((f) => ({ ...f, statuses }))}
        />
      </div>

      <ChipMulti
        label="Jurisdiction"
        options={facets.jurisdictions}
        selected={filters.jurisdictions}
        onChange={(jurisdictions) => setFilters((f) => ({ ...f, jurisdictions }))}
      />

      <ChipMulti
        label="Stage"
        options={facets.stages}
        selected={filters.stages}
        onChange={(stages) => setFilters((f) => ({ ...f, stages }))}
      />
    </div>
  );
}

function ResultsList({ items }: { items: ReferralLite[] }) {
  const parentRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-[var(--color-muted)] border-t border-[var(--color-rule)]">
        No referrals match these filters.
      </div>
    );
  }

  return (
    <div className="border-t border-[var(--color-rule)]">
      <div
        className="grid text-xs uppercase tracking-wider text-[var(--color-muted)] border-b border-[var(--color-rule)] py-2"
        style={{ gridTemplateColumns: "9rem 1fr 5rem 4rem 8rem 8rem" }}
      >
        <div>Reference</div>
        <div>Name</div>
        <div>Juris.</div>
        <div>Year</div>
        <div>Stage</div>
        <div>Status</div>
      </div>

      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ height: "min(70vh, 800px)" }}
      >
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: "relative",
            width: "100%",
          }}
        >
          {virtualizer.getVirtualItems().map((v) => {
            const it = items[v.index];
            if (!it) return null;
            return (
              <div
                key={it.ref}
                className="grid items-center border-b border-[var(--color-rule)] py-2 text-sm"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${v.size}px`,
                  transform: `translateY(${v.start}px)`,
                  gridTemplateColumns: "9rem 1fr 5rem 4rem 8rem 8rem",
                  gap: "0.5rem",
                }}
              >
                <div className="font-mono whitespace-nowrap overflow-hidden text-ellipsis">
                  <Link href={`/r/${refSlug(it.ref)}/`}>{it.ref}</Link>
                </div>
                <div className="whitespace-nowrap overflow-hidden text-ellipsis pr-2">
                  {it.name ?? "(unnamed)"}
                </div>
                <div className="whitespace-nowrap">{it.juris ?? "-"}</div>
                <div className="font-mono">{it.yr ?? "-"}</div>
                <div className="whitespace-nowrap overflow-hidden text-ellipsis pr-1">
                  {it.stage ?? "-"}
                </div>
                <div className="whitespace-nowrap overflow-hidden text-ellipsis pr-1">
                  {it.status ?? "-"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
