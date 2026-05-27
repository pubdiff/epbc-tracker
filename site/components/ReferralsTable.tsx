import Link from "next/link";
import { refSlug, type ReferralIndexed } from "@/lib/data";

export function ReferralsTable({ items }: { items: ReferralIndexed[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left border-b border-[var(--color-rule)]">
          <tr>
            <th className="py-2 pr-3">Reference</th>
            <th className="py-2 pr-3">Name</th>
            <th className="py-2 pr-3">Jurisdiction</th>
            <th className="py-2 pr-3">Year</th>
            <th className="py-2 pr-3">Stage</th>
            <th className="py-2 pr-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr
              key={r.referenceNumber}
              className="border-b border-[var(--color-rule)] align-top"
            >
              <td className="py-2 pr-3 font-mono whitespace-nowrap">
                <Link href={`/r/${refSlug(r.referenceNumber)}/`}>
                  {r.referenceNumber}
                </Link>
              </td>
              <td className="py-2 pr-3">{r.name ?? "(unnamed)"}</td>
              <td className="py-2 pr-3 whitespace-nowrap">
                {r.jurisdiction ?? "-"}
              </td>
              <td className="py-2 pr-3 font-mono">{r.year ?? "-"}</td>
              <td className="py-2 pr-3">{r.stage ?? "-"}</td>
              <td className="py-2 pr-3">{r.status ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
