import { loadIndex } from "@/lib/data";
import { PAGE_SIZE, sliceFor, totalPages } from "@/lib/pagination";
import { ReferralsTable } from "@/components/ReferralsTable";
import { Pager } from "@/components/Pager";

export default async function AllPage() {
  const idx = await loadIndex();
  const all = Object.values(idx).sort((a, b) => {
    if (a.lastSeen !== b.lastSeen) return a.lastSeen > b.lastSeen ? -1 : 1;
    return a.referenceNumber.localeCompare(b.referenceNumber);
  });
  const total = totalPages(all.length);
  const slice = sliceFor(all, 1);
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">All referrals</h1>
      <p className="text-[var(--color-muted)] mb-6">
        {all.length.toLocaleString()} tracked. Sorted by most recent
        observation. {PAGE_SIZE} per page.
      </p>
      <ReferralsTable items={slice} />
      <Pager page={1} total={total} />
    </div>
  );
}
