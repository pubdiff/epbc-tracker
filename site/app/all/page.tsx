import { Suspense } from "react";
import { BASE_PATH } from "@/lib/site-config";
import { AllClient } from "./AllClient";

export const dynamic = "force-static";

export default function AllPage() {
  const dataUrl = `${BASE_PATH}/data/referrals.json`;
  return (
    <>
      {/* Preload the referrals dataset - parallel with HTML/JS download. */}
      <link rel="preload" as="fetch" href={dataUrl} crossOrigin="anonymous" />
      <h1 className="text-2xl font-semibold mb-2">All referrals</h1>
      <Suspense
        fallback={
          <p className="text-[var(--color-muted)] py-2">Loading referrals…</p>
        }
      >
        <AllClient />
      </Suspense>
    </>
  );
}
