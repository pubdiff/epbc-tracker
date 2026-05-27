import Link from "next/link";
import { pageUrl } from "@/lib/pagination";

export function Pager({ page, total }: { page: number; total: number }) {
  if (total <= 1) return null;
  return (
    <nav className="flex items-center justify-between mt-6 text-sm">
      <div className="text-[var(--color-muted)]">
        Page {page} of {total}
      </div>
      <div className="flex gap-3">
        {page > 1 ? (
          <Link href={pageUrl(page - 1)}>← Prev</Link>
        ) : (
          <span className="text-[var(--color-muted)]">← Prev</span>
        )}
        {page < total ? (
          <Link href={pageUrl(page + 1)}>Next →</Link>
        ) : (
          <span className="text-[var(--color-muted)]">Next →</span>
        )}
      </div>
    </nav>
  );
}
