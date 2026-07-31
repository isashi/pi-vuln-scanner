import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { CACHE_PATH } from "./config.ts";
import type { ScanReport } from "./types.ts";

export async function loadCachedReport(): Promise<ScanReport | undefined> {
  try {
    const text = await readFile(CACHE_PATH, "utf8");
    const parsed = JSON.parse(text) as ScanReport;
    if (parsed.version !== 1) return undefined;
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return undefined;
  }
}

export async function saveCachedReport(report: ScanReport): Promise<void> {
  await mkdir(dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export async function clearCache(): Promise<void> {
  await rm(CACHE_PATH, { force: true });
}
