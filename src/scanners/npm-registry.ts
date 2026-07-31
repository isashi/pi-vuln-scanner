import type { InstalledPackage, RiskSignal, VulnerabilityFinding } from "../types.ts";

interface NpmRegistryVersion {
  deprecated?: string;
  license?: string;
  repository?: unknown;
  scripts?: Record<string, string>;
  dist?: { integrity?: string; signatures?: unknown[]; attestations?: { url?: string } };
}

interface NpmRegistryPackage {
  name?: string;
  time?: Record<string, string>;
  versions?: Record<string, NpmRegistryVersion>;
  maintainers?: unknown[];
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function registryUrl(name: string): string {
  return `https://registry.npmjs.org/${encodeURIComponent(name).replace(/^%40/, "@")}`;
}

export async function scanNpmRegistryPackage(pkg: InstalledPackage): Promise<{ findings: VulnerabilityFinding[]; signals: RiskSignal[]; error?: string }> {
  if (pkg.sourceKind !== "npm" || !pkg.version) return { findings: [], signals: [] };

  try {
    const response = await fetchWithTimeout(registryUrl(pkg.name), 20_000);
    if (!response.ok) return { findings: [], signals: [], error: `npm registry request failed for ${pkg.name}: HTTP ${response.status}` };
    const data = await response.json() as NpmRegistryPackage;
    const version = data.versions?.[pkg.version];
    const signals: RiskSignal[] = [];

    if (version?.deprecated) signals.push({ severity: "high", label: "npm registry package deprecated", details: version.deprecated });
    if (!version?.license) signals.push({ severity: "low", label: "npm registry missing license" });
    if (!version?.repository) signals.push({ severity: "low", label: "npm registry missing repository" });

    const publishTime = data.time?.[pkg.version];
    if (publishTime) {
      const ageDays = (Date.now() - Date.parse(publishTime)) / 86_400_000;
      if (Number.isFinite(ageDays) && ageDays < 7) {
        signals.push({ severity: "info", label: "recent npm publish", details: `published ${Math.max(0, Math.round(ageDays))} day(s) ago` });
      }
    }

    const created = data.time?.created;
    if (created) {
      const ageDays = (Date.now() - Date.parse(created)) / 86_400_000;
      if (Number.isFinite(ageDays) && ageDays < 30) {
        signals.push({ severity: "low", label: "new npm package", details: `created ${Math.max(0, Math.round(ageDays))} day(s) ago` });
      }
    }

    if (Array.isArray(data.maintainers) && data.maintainers.length === 0) {
      signals.push({ severity: "medium", label: "npm registry has no maintainers" });
    }

    return { findings: [], signals };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { findings: [], signals: [], error: `npm registry request failed for ${pkg.name}: ${message}` };
  }
}
