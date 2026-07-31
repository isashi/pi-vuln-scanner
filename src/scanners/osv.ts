import { normalizeSeverity } from "../risk.ts";
import type { InstalledPackage, OsvVulnerability, VulnerabilityFinding } from "../types.ts";
import type { DependencyCoordinate } from "./dependencies.ts";

interface OsvQueryResponse {
  vulns?: OsvVulnerability[];
}

interface OsvBatchResponse {
  results?: OsvQueryResponse[];
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

function findingFromVulnerability(pkg: InstalledPackage, coordinate: DependencyCoordinate, vulnerability: OsvVulnerability): VulnerabilityFinding {
  return {
    source: "osv",
    packageName: pkg.name,
    dependencyName: coordinate.name,
    severity: severityFromOsv(vulnerability),
    id: vulnerability.id,
    title: vulnerability.summary ?? vulnerability.id,
    url: bestReference(vulnerability),
    direct: coordinate.root || coordinate.direct,
  };
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
    const coordinate = { name: pkg.name, version: pkg.version, direct: true, root: true };
    return { findings: (data.vulns ?? []).map((vulnerability) => findingFromVulnerability(pkg, coordinate, vulnerability)) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { findings: [], error: `OSV request failed for ${pkg.name}: ${message}` };
  }
}

export async function scanOsvDependencies(pkg: InstalledPackage, coordinates: DependencyCoordinate[]): Promise<{ findings: VulnerabilityFinding[]; error?: string }> {
  const npmCoordinates = coordinates.filter((coordinate) => coordinate.name && coordinate.version);
  if (npmCoordinates.length === 0) return { findings: [] };

  const findings: VulnerabilityFinding[] = [];
  try {
    for (let index = 0; index < npmCoordinates.length; index += 100) {
      const chunk = npmCoordinates.slice(index, index + 100);
      const response = await fetchWithTimeout("https://api.osv.dev/v1/querybatch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          queries: chunk.map((coordinate) => ({
            package: { ecosystem: "npm", name: coordinate.name },
            version: coordinate.version,
          })),
        }),
      }, 30_000);

      if (!response.ok) return { findings, error: `OSV batch request failed for ${pkg.name}: HTTP ${response.status}` };
      const data = await response.json() as OsvBatchResponse;
      for (const [offset, result] of (data.results ?? []).entries()) {
        const coordinate = chunk[offset];
        if (!coordinate) continue;
        for (const vulnerability of result.vulns ?? []) findings.push(findingFromVulnerability(pkg, coordinate, vulnerability));
      }
    }
    return { findings };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { findings, error: `OSV batch request failed for ${pkg.name}: ${message}` };
  }
}
