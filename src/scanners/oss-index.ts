import type { InstalledPackage, ScannerConfig, VulnerabilityFinding } from "../types.ts";
import type { DependencyCoordinate } from "./dependencies.ts";

interface OssIndexVulnerability {
  id?: string;
  title?: string;
  description?: string;
  cvssScore?: number;
  reference?: string;
  cve?: string;
}

interface OssIndexComponentReport {
  coordinates?: string;
  reference?: string;
  vulnerabilities?: OssIndexVulnerability[];
}

function severityFromCvss(score: unknown) {
  if (typeof score !== "number") return "info" as const;
  if (score >= 9) return "critical" as const;
  if (score >= 7) return "high" as const;
  if (score >= 4) return "medium" as const;
  if (score > 0) return "low" as const;
  return "info" as const;
}

function purl(coordinate: DependencyCoordinate): string {
  const name = coordinate.name.startsWith("@") ? coordinate.name.replace(/^@/, "%40") : coordinate.name;
  return `pkg:npm/${name}@${coordinate.version}`;
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

export async function scanOssIndexDependencies(
  pkg: InstalledPackage,
  coordinates: DependencyCoordinate[],
  config: ScannerConfig,
): Promise<{ findings: VulnerabilityFinding[]; error?: string }> {
  const username = process.env[config.ossIndex.usernameEnv];
  const token = process.env[config.ossIndex.tokenEnv];
  if (!username || !token) {
    return { findings: [], error: `OSS Index enabled but ${config.ossIndex.usernameEnv}/${config.ossIndex.tokenEnv} are not set` };
  }

  const byPurl = new Map(coordinates.map((coordinate) => [purl(coordinate), coordinate]));
  const findings: VulnerabilityFinding[] = [];

  try {
    for (let index = 0; index < coordinates.length; index += 128) {
      const chunk = coordinates.slice(index, index + 128).map(purl);
      const response = await fetchWithTimeout("https://ossindex.sonatype.org/api/v3/component-report", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Basic ${Buffer.from(`${username}:${token}`).toString("base64")}`,
          "user-agent": "pi-vuln-scanner",
        },
        body: JSON.stringify({ coordinates: chunk }),
      }, 30_000);

      if (!response.ok) return { findings, error: `OSS Index request failed for ${pkg.name}: HTTP ${response.status}` };
      const reports = await response.json() as OssIndexComponentReport[];
      for (const report of reports) {
        const coordinate = report.coordinates ? byPurl.get(report.coordinates) : undefined;
        if (!coordinate) continue;
        for (const vulnerability of report.vulnerabilities ?? []) {
          findings.push({
            source: "oss-index",
            packageName: pkg.name,
            dependencyName: coordinate.name,
            severity: severityFromCvss(vulnerability.cvssScore),
            id: vulnerability.cve ?? vulnerability.id,
            title: vulnerability.title ?? vulnerability.id ?? "OSS Index vulnerability",
            url: vulnerability.reference ?? report.reference,
            direct: coordinate.root || coordinate.direct,
          });
        }
      }
    }
    return { findings };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { findings, error: `OSS Index request failed for ${pkg.name}: ${message}` };
  }
}
