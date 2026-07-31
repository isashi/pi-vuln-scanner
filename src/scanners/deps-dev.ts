import { normalizeSeverity } from "../risk.ts";
import type { InstalledPackage, RiskSignal, VulnerabilityFinding } from "../types.ts";

interface DepsDevVersionResponse {
  advisoryKeys?: Array<{ id?: string } | string>;
  isDeprecated?: boolean;
  deprecatedReason?: string;
  publishedAt?: string;
  licenses?: string[];
  slsaProvenances?: unknown[];
  attestations?: unknown[];
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

function packageUrl(pkg: InstalledPackage): string {
  return `https://api.deps.dev/v3/systems/npm/packages/${encodeURIComponent(pkg.name)}/versions/${encodeURIComponent(pkg.version ?? "")}`;
}

function advisoryId(key: { id?: string } | string): string {
  return typeof key === "string" ? key : key.id ?? "deps.dev advisory";
}

export async function scanDepsDevPackage(pkg: InstalledPackage): Promise<{ findings: VulnerabilityFinding[]; signals: RiskSignal[]; error?: string }> {
  if (pkg.sourceKind !== "npm" || !pkg.version) return { findings: [], signals: [] };

  try {
    const response = await fetchWithTimeout(packageUrl(pkg), 20_000);
    if (response.status === 404) return { findings: [], signals: [] };
    if (!response.ok) return { findings: [], signals: [], error: `deps.dev request failed for ${pkg.name}: HTTP ${response.status}` };
    const data = await response.json() as DepsDevVersionResponse;

    const findings = (data.advisoryKeys ?? []).map((key): VulnerabilityFinding => {
      const id = advisoryId(key);
      return {
        source: "deps-dev",
        packageName: pkg.name,
        dependencyName: pkg.name,
        severity: normalizeSeverity(id.includes("CRITICAL") ? "critical" : "info"),
        id,
        title: `deps.dev advisory ${id}`,
        url: `https://deps.dev/npm/${encodeURIComponent(pkg.name)}/${encodeURIComponent(pkg.version ?? "")}`,
        direct: true,
      };
    });

    const signals: RiskSignal[] = [];
    if (data.isDeprecated) {
      signals.push({ severity: "high", label: "deps.dev package deprecated", details: data.deprecatedReason });
    }
    if (data.licenses && data.licenses.length === 0) {
      signals.push({ severity: "low", label: "deps.dev missing license data" });
    }

    return { findings, signals };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { findings: [], signals: [], error: `deps.dev request failed for ${pkg.name}: ${message}` };
  }
}
