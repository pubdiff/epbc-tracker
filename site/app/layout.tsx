import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL, withBase } from "@/lib/site-config";
import "./globals.css";

const DESCRIPTION =
  "Weekly diff of every EPBC Act referral. A neutral evidence tool from pubdiff.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "EPBC Tracker - pubdiff",
    template: "%s - EPBC Tracker",
  },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "EPBC Tracker",
    title: "EPBC Tracker - pubdiff",
    description: DESCRIPTION,
    locale: "en_AU",
  },
  twitter: {
    card: "summary",
    title: "EPBC Tracker - pubdiff",
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <head>
        <link
          rel="alternate"
          type="application/rss+xml"
          title="EPBC Tracker feed"
          href={withBase("/feed.xml")}
        />
        <link
          rel="alternate"
          type="application/feed+json"
          title="EPBC Tracker feed"
          href={withBase("/feed.json")}
        />
      </head>
      <body className="min-h-screen">
        <header className="border-b border-[var(--color-rule)]">
          <div className="max-w-4xl mx-auto px-4 py-5 flex items-baseline justify-between flex-wrap gap-2">
            <Link href="/" className="text-xl font-semibold no-underline text-[var(--color-ink)]">
              EPBC Tracker
            </Link>
            <nav className="text-sm flex gap-5">
              <Link href="/all/">All referrals</Link>
              <Link href="/diffs/">Diffs</Link>
              <Link href="/about/">About</Link>
              <a href={withBase("/feed.xml")}>RSS</a>
              <a href="https://bsky.app/profile/pubdiff.bsky.social">Bluesky</a>
            </nav>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
        <footer className="border-t border-[var(--color-rule)] mt-16">
          <div className="max-w-4xl mx-auto px-4 py-6 text-sm text-[var(--color-muted)]">
            A <a href="https://github.com/pubdiff">pubdiff</a> tracker.
            Data from DCCEEW EPBC referrals. Code MIT, data CC-BY-4.0.
          </div>
        </footer>
      </body>
    </html>
  );
}
