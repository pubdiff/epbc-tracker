import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// Subpath deployment to pubdiff.github.io/epbc-tracker. When a custom domain
// is configured (epbc.pubdiff.com), set NEXT_BASE_PATH="" to serve from root.
const BASE_PATH = process.env.NEXT_BASE_PATH ?? "/epbc-tracker";

const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  outputFileTracingRoot: here,
  basePath: BASE_PATH,
  // env exposes BASE_PATH to Server Components for raw <a>/<link> tags
  env: {
    NEXT_PUBLIC_BASE_PATH: BASE_PATH,
  },
};

export default config;
