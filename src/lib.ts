import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const ENDPOINT =
  "https://gis.environment.gov.au/gispubmap/rest/services/ogc_services/EPBC_Referrals/MapServer/0/query";

export const DATA_DIR = "data";
export const RAW_DIR = `${DATA_DIR}/raw`;
export const SNAPSHOT_DIR = `${DATA_DIR}/snapshots`;
export const DIFF_DIR = `${DATA_DIR}/diffs`;
export const INDEX_PATH = `${DATA_DIR}/_index.json`;
export const POSTED_PATH = `${DATA_DIR}/_posted.json`;
export const FEED_DIR = "site/public";

export function isoDate(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function writeJSON(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export async function readJSON<T>(path: string): Promise<T | null> {
  try {
    const content = await readFile(path, "utf8");
    return JSON.parse(content) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
