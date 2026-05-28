import { Suspense } from "react";
import { AllClient } from "./AllClient";

export const dynamic = "force-static";

export default function AllPage() {
  return (
    <Suspense fallback={<div className="py-8 text-sm text-[var(--color-muted)]">Loading…</div>}>
      <AllClient />
    </Suspense>
  );
}
