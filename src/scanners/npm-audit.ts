import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { normalizeSeverity } from "../risk.ts";
import type { Severity, VulnerabilityFinding } from "../types.ts";

interface NpmAuditVulnerability {
  name: string;
  severity: string;
  isDirect?: boolean;
  via?: Array<string | { source?: number; name?: string; title?: string; severity?: string; url?: string }>;
  effects?: string[];
  range?: string;
  nodes?: string[];
  fixAvailable?: boolean | { name?: string; version?: string; isSemVerMajor?: boolean };
}

interface NpmAuditJson {
  auditReportVersion?: number;
  vulnerabilities?: Record<string, NpmAuditVulnerability>;
  metadata?: {
    vulnerabilities?: Partial<Record<Severity, number>>;
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function hasNpmAuditLockfile(rootPath: string): Promise<boolean> {
  return (await exists(join(rootPath, "package-lock.json"))) || (await exists(join(rootPath, "npm-shrinkwrap.json")));
}

function execFileText(command: string, args: string[], cwd: string, timeoutMs: number): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    execFile(command, args, { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
      const code = (error as NodeJS.ErrnoException | null)?.code;
      resolve({ stdout, stderr, code: typeof code === "number" ? code : null });
    });
  });
}

function fixAvailableText(fixAvailable: NpmAuditVulnerability["fixAvailable"]): string | boolean | undefined {
  if (typeof fixAvailable === "boolean") return fixAvailable;
  if (fixAvailable?.name && fixAvailable.version) return `${fixAvailable.name}@${fixAvailable.version}`;
  return undefined;
}

function viaTitle(vulnerability: NpmAuditVulnerability): string {
  const advisory = vulnerability.via?.find((via) => typeof via === "object" && via.title);
  if (typeof advisory === "object" && advisory.title) return advisory.title;
  return `npm audit vulnerability in ${vulnerability.name}`;
}

function viaUrl(vulnerability: NpmAuditVulnerability): string | undefined {
  const advisory = vulnerability.via?.find((via) => typeof via === "object" && via.url);
  return typeof advisory === "object" ? advisory.url : undefined;
}

function viaId(vulnerability: NpmAuditVulnerability): string | undefined {
  const advisory = vulnerability.via?.find((via) => typeof via === "object" && via.source);
  if (typeof advisory === "object" && advisory.source) return `npm-${advisory.source}`;
  return undefined;
}

export async function scanNpmAuditRoot(rootPath: string, packageName: string): Promise<{ findings: VulnerabilityFinding[]; error?: string }> {
  if (!await hasNpmAuditLockfile(rootPath)) return { findings: [] };

  const result = await execFileText("npm", ["audit", "--json", "--omit=dev"], rootPath, 60_000);
  const jsonText = result.stdout.trim();
  if (!jsonText) {
    return {
      findings: [],
      error: result.stderr.trim() || `npm audit failed in ${rootPath}`,
    };
  }

  let parsed: NpmAuditJson;
  try {
    parsed = JSON.parse(jsonText) as NpmAuditJson;
  } catch {
    return { findings: [], error: `npm audit returned invalid JSON in ${rootPath}` };
  }

  const vulnerabilities = Object.values(parsed.vulnerabilities ?? {});
  const findings = vulnerabilities.map((vulnerability): VulnerabilityFinding => ({
    source: "npm-audit",
    packageName,
    dependencyName: vulnerability.name,
    severity: normalizeSeverity(vulnerability.severity),
    id: viaId(vulnerability),
    title: viaTitle(vulnerability),
    url: viaUrl(vulnerability),
    direct: Boolean(vulnerability.isDirect || vulnerability.name === packageName),
    fixAvailable: fixAvailableText(vulnerability.fixAvailable),
  }));

  return { findings };
}
