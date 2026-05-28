"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { DecisionFilter, SortKey } from "./useFilters";

// ---- Text search (debounced) ----

export function TextSearch({
  value,
  onChange,
  placeholder = "Search name or reference",
  delay = 200,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  delay?: number;
}) {
  const [local, setLocal] = useState(value);
  const initial = useRef(true);

  // sync external -> local (e.g. clear-all button)
  useEffect(() => {
    setLocal(value);
  }, [value]);

  // debounce local -> external
  useEffect(() => {
    if (initial.current) {
      initial.current = false;
      return;
    }
    const t = setTimeout(() => {
      if (local !== value) onChange(local);
    }, delay);
    return () => clearTimeout(t);
  }, [local, value, onChange, delay]);

  return (
    <input
      type="search"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      placeholder={placeholder}
      className="px-3 py-1.5 text-sm border border-[var(--color-rule)] rounded bg-white min-w-0 flex-1 max-w-xs"
    />
  );
}

// ---- Chip multi-select ----

export function ChipMulti({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const selSet = new Set(selected);
  const toggle = (v: string) => {
    if (selSet.has(v)) onChange(selected.filter((s) => s !== v));
    else onChange([...selected, v].sort());
  };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs uppercase tracking-wider text-[var(--color-muted)]">{label}</span>
      {options.map((opt) => {
        const on = selSet.has(opt);
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(opt)}
            className={
              on
                ? "px-2 py-0.5 text-xs rounded border border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                : "px-2 py-0.5 text-xs rounded border border-[var(--color-rule)] bg-white hover:border-[var(--color-accent)]"
            }
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// ---- Dropdown multi-select with in-list search ----

export function DropdownMulti({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const id = useId();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const selSet = new Set(selected);
  const visible = q
    ? options.filter((o) => o.toLowerCase().includes(q.toLowerCase()))
    : options;

  const toggle = (v: string) => {
    if (selSet.has(v)) onChange(selected.filter((s) => s !== v));
    else onChange([...selected, v].sort());
  };

  const buttonLabel =
    selected.length === 0
      ? label
      : selected.length === 1
        ? `${label}: ${selected[0]}`
        : `${label}: ${selected.length} selected`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        className={
          selected.length > 0
            ? "px-2 py-1 text-xs rounded border border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
            : "px-2 py-1 text-xs rounded border border-[var(--color-rule)] bg-white hover:border-[var(--color-accent)]"
        }
      >
        {buttonLabel} ▾
      </button>
      {open ? (
        <div
          id={id}
          role="listbox"
          aria-multiselectable
          className="absolute z-10 mt-1 max-h-72 w-72 overflow-y-auto rounded border border-[var(--color-rule)] bg-white shadow-lg p-2"
        >
          <input
            type="search"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}…`}
            className="w-full px-2 py-1 text-sm border border-[var(--color-rule)] rounded mb-2"
          />
          <ul>
            {visible.map((opt) => {
              const on = selSet.has(opt);
              return (
                <li key={opt}>
                  <label className="flex items-center gap-2 px-1 py-0.5 text-sm cursor-pointer hover:bg-[var(--color-rule)]">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(opt)}
                    />
                    <span className="flex-1">{opt}</span>
                  </label>
                </li>
              );
            })}
            {visible.length === 0 ? (
              <li className="text-xs text-[var(--color-muted)] px-1 py-2">No matches</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// ---- Year range ----

export function YearRange({
  yearMin,
  yearMax,
  from,
  to,
  onChange,
}: {
  yearMin: number;
  yearMax: number;
  from: number | null;
  to: number | null;
  onChange: (next: { from: number | null; to: number | null }) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs uppercase tracking-wider text-[var(--color-muted)]">Year</span>
      <input
        type="number"
        inputMode="numeric"
        min={yearMin}
        max={yearMax}
        value={from ?? ""}
        placeholder={String(yearMin)}
        onChange={(e) => {
          const v = e.target.value;
          onChange({ from: v === "" ? null : Number(v), to });
        }}
        className="w-20 px-2 py-1 text-sm border border-[var(--color-rule)] rounded"
        aria-label="Year from"
      />
      <span className="text-[var(--color-muted)]">–</span>
      <input
        type="number"
        inputMode="numeric"
        min={yearMin}
        max={yearMax}
        value={to ?? ""}
        placeholder={String(yearMax)}
        onChange={(e) => {
          const v = e.target.value;
          onChange({ from, to: v === "" ? null : Number(v) });
        }}
        className="w-20 px-2 py-1 text-sm border border-[var(--color-rule)] rounded"
        aria-label="Year to"
      />
    </div>
  );
}

// ---- Decision toggle (Any / Decided / Pending) ----

export function DecisionToggle({
  value,
  onChange,
}: {
  value: DecisionFilter;
  onChange: (v: DecisionFilter) => void;
}) {
  const opts: { value: DecisionFilter; label: string }[] = [
    { value: "any", label: "Any" },
    { value: "decided", label: "Decided" },
    { value: "pending", label: "Pending" },
  ];
  return (
    <div className="inline-flex border border-[var(--color-rule)] rounded overflow-hidden" role="group" aria-label="Decision filter">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={
            value === o.value
              ? "px-2 py-1 text-xs bg-[var(--color-accent)] text-white"
              : "px-2 py-1 text-xs bg-white hover:bg-[var(--color-rule)]"
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- Sort selector ----

export function SortSelect({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (v: SortKey) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
      Sort
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortKey)}
        className="px-1.5 py-1 text-xs border border-[var(--color-rule)] rounded bg-white"
      >
        <option value="last">Last observed</option>
        <option value="first">First observed</option>
        <option value="year">Year</option>
        <option value="name">Name</option>
      </select>
    </label>
  );
}

// ---- Clear button ----

export function ClearButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2 py-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)] underline"
    >
      Clear all
    </button>
  );
}

// ---- CSV download button ----

export function CsvDownloadButton({
  onClick,
  count,
}: {
  onClick: () => void;
  count: number;
}) {
  const disabled = count === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        disabled
          ? "px-2 py-1 text-xs border border-[var(--color-rule)] rounded bg-white text-[var(--color-muted)] cursor-not-allowed"
          : "px-2 py-1 text-xs border border-[var(--color-rule)] rounded bg-white hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
      }
      title={
        disabled
          ? "Nothing to download"
          : `Download ${count.toLocaleString()} referral${count === 1 ? "" : "s"} as CSV`
      }
    >
      Download CSV
    </button>
  );
}
