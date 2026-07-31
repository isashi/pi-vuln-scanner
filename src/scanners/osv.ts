import { normalizeSeverity } from "../risk.ts";
import type { InstalledPackage, OsvVulnerability, VulnerabilityFinding } from "../types.ts";

interface OsvQueryResponse {
  vulns?: OsvVulnerability[];
}

function bestReference(vulnerability: OsvVulnerability): string | undefined {
  return vulnerability.references?.find((reference) => reference.type === "ADVISORY")?.url
    ?? vulnerability.references?.find((reference) => reference.type === "WEB")?.url
    ?? vulnerability.references?.[0]?.url
    ?? `https://osv.dev/vulnerability/${encodeURIComponent(vulnerability.id)}`;
}

function severityFromOsv(vulnerability: OsvVulnerability) {
  const databaseSeverity = vulnerability.database_specific?.severity;
  if (databaseSeverity) return normalizeSeverity(databaseSeverity);
  const alias = vulnerability.aliases?.join(" ").toLowerCase() ?? "";
  if (alias.includes("critical")) return "critical" as const;
  return "info" as const;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function scanOsvPackage(pkg: InstalledPackage): Promise<{ findings: VulnerabilityFinding[]; error?: string }> {
  if (pkg.sourceKind !== "npm" || !pkg.name || !pkg.version) return { findings: [] };

  try {
    const response = await fetchWithTimeout("https://api.osv.dev/v1/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        package: { ecosystem: "npm", name: pkg.name },
        version: pkg.version,
      }),
    }, 20_000);

    if (!response.ok) return { findings: [], error: `OSV request failed for ${pkg.name}: HTTP ${response.status}` };
    const data = await response.json() as OsvQueryResponse;
    const findings = (data.vulns ?? []).map((vulnerability): VulnerabilityFinding => ({
      source: "osv",
      packageName: pkg.name,
      dependencyName: pkg.name,
      severity: severityFromOsv(vulnerability),
      id: vulnerability.id,
      title: vulnerability.summary ?? vulnerability.id,
      url: bestReference(vulnerability),
      direct: true,
    }));
    return { findings };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { findings: [], error: `OSV request failed for ${pkg.name}: ${message}` };
  }
}
