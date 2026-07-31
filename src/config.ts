import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { ScannerConfig } from "./types.ts";

export const EXTENSION_NAME = "pi-vuln-scanner";
export const GLOBAL_PI_AGENT_DIR = join(homedir(), ".pi", "agent");
export const CONFIG_PATH = join(GLOBAL_PI_AGENT_DIR, `${EXTENSION_NAME}.json`);
export const CACHE_PATH = join(GLOBAL_PI_AGENT_DIR, `${EXTENSION_NAME}-cache.json`);

export const DEFAULT_CONFIG: ScannerConfig = {
  scanOnStartup: true,
  scanIntervalHours: 24,
  providers: {
    npmAudit: true,
    osv: true,
    osvTransitive: true,
    depsDev: true,
    ossIndex: false,
    npmRegistry: true,
    packageMetadata: true,
  },
  thresholds: {
    startupWarning: "high",
    showRemoveCommand: "high",
  },
  privacy: {
    allowNetwork: true,
    sendNpmPackageNames: true,
    sendLocalPackagePaths: false,
  },
  ossIndex: {
    usernameEnv: "OSS_INDEX_USERNAME",
    tokenEnv: "OSS_INDEX_TOKEN",
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeConfig(raw: unknown): ScannerConfig {
  if (!isObject(raw)) return DEFAULT_CONFIG;
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    providers: {
      ...DEFAULT_CONFIG.providers,
      ...(isObject(raw.providers) ? raw.providers : {}),
    },
    thresholds: {
      ...DEFAULT_CONFIG.thresholds,
      ...(isObject(raw.thresholds) ? raw.thresholds : {}),
    },
    privacy: {
      ...DEFAULT_CONFIG.privacy,
      ...(isObject(raw.privacy) ? raw.privacy : {}),
    },
    ossIndex: {
      ...DEFAULT_CONFIG.ossIndex,
      ...(isObject(raw.ossIndex) ? raw.ossIndex : {}),
    },
  } as ScannerConfig;
}

export async function loadConfig(): Promise<ScannerConfig> {
  try {
    const text = await readFile(CONFIG_PATH, "utf8");
    return mergeConfig(JSON.parse(text));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return DEFAULT_CONFIG;
    throw error;
  }
}

export async function saveConfig(config: ScannerConfig): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function cacheIsFresh(scannedAt: string | undefined, config: ScannerConfig): boolean {
  if (!scannedAt) return false;
  const scannedMs = Date.parse(scannedAt);
  if (!Number.isFinite(scannedMs)) return false;
  return Date.now() - scannedMs < config.scanIntervalHours * 60 * 60 * 1000;
}
