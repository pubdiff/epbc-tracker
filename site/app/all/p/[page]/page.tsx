import { loadIndex } from "@/lib/data";
import { PAGE_SIZE, sliceFor, totalPages } from "@/lib/pagination";
import { ReferralsTable } from "@/components/ReferralsTable";
import { Pager } from "@/components/Pager";
import { notFound } from "next/navigation";

export async function generateStaticParams() {
  const idx = await loadIndex();
  const total = totalPages(Object.keys(idx).length);
  // page 1 is served by /all/ - so this dynamic route covers 2..total
  const params: { page: string }[] = [];
  for (let p = 2; p <= total; p++) params.push({ page: String(p) });
  return params;
}

export const dynamicParams = false;

export default async function AllPagePaginated({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page: pageStr } = await params;
  const page = Number(pageStr);
  if (!Number.isInteger(page) || page < 2) notFound();

  const idx = await loadIndex();
  const all = Object.values(idx).sort((a, b) => {
    if (a.lastSeen !== b.lastSeen) return a.lastSeen > b.lastSeen ? -1 : 1;
    return a.referenceNumber.localeCompare(b.referenceNumber);
  });
  const total = totalPages(all.length);
  if (page > total) notFound();
  const slice = sliceFor(all, page);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">All referrals</h1>
      <p className="text-[var(--color-muted)] mb-6">
        {all.length.toLocaleString()} tracked. Sorted by most recent
        observation. {PAGE_SIZE} per page.
      </p>
      <ReferralsTable items={slice} />
      <Pager page={page} total={total} />
    </div>
  );
}
