import { performance } from "node:perf_hooks";
import { discoverInstalledPackages } from "./inventory.ts";
import { SEVERITY_RANK, emptySeverityCounts, finalizePackageResult, maxSeverity, mergeUniqueFindings } from "./risk.ts";
import { scanNpmAuditRoot } from "./scanners/npm-audit.ts";
import { scanOsvPackage } from "./scanners/osv.ts";
import { scanPackageMetadata } from "./scanners/package-metadata.ts";
import type { PackageScanResult, RiskSignal, ScanReport, ScannerConfig, VulnerabilityFinding } from "./types.ts";

export async function runScan(options: {
  cwd: string;
  includeProject: boolean;
  config: ScannerConfig;
}): Promise<ScanReport> {
  const started = performance.now();
  const errors: string[] = [];
  const packages = await discoverInstalledPackages(options.cwd, options.includeProject);
  const installRootCounts = new Map<string, number>();
  for (const pkg of packages) {
    if (pkg.installRoot) installRootCounts.set(pkg.installRoot, (installRootCounts.get(pkg.installRoot) ?? 0) + 1);
  }

  const results: PackageScanResult[] = [];
  for (const pkg of packages) {
    const findings: VulnerabilityFinding[] = [];
    const signals: RiskSignal[] = [];

    if (options.config.providers.packageMetadata) {
      signals.push(...await scanPackageMetadata(pkg));
    }

    if (options.config.providers.osv && options.config.privacy.allowNetwork && options.config.privacy.sendNpmPackageNames) {
      const result = await scanOsvPackage(pkg);
      findings.push(...result.findings);
      if (result.error) errors.push(result.error);
    }

    if (options.config.providers.npmAudit) {
      const auditRoot = pkg.hasLockfile
        ? pkg.rootPath
        : (pkg.sourceKind === "npm" && pkg.installRoot && installRootCounts.get(pkg.installRoot) === 1 ? pkg.installRoot : undefined);
      if (auditRoot) {
        const result = await scanNpmAuditRoot(auditRoot, pkg.name);
        findings.push(...result.findings);
        if (result.error) errors.push(result.error);
      } else if (pkg.sourceKind === "npm" && pkg.installRoot && (installRootCounts.get(pkg.installRoot) ?? 0) > 1) {
        signals.push({
          severity: "info",
          label: "shared npm install root",
          details: "Transitive npm audit attribution is skipped because multiple pi packages share the same install root.",
        });
      }
    }

    results.push(finalizePackageResult({
      pkg,
      findings: mergeUniqueFindings(findings),
      signals,
    }));
  }

  const counts = emptySeverityCounts();
  let totalFindings = 0;
  for (const result of results) {
    totalFindings += result.findings.length;
    for (const finding of result.findings) counts[finding.severity] += 1;
  }

  const summary = {
    totalPackages: packages.length,
    totalFindings,
    counts,
    worstSeverity: maxSeverity(results.map((result) => result.worstSeverity)),
    scannedAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - started),
  };

  return {
    version: 1,
    config: options.config,
    summary,
    packages: results.sort((a, b) => {
      const severity = SEVERITY_RANK[b.worstSeverity] - SEVERITY_RANK[a.worstSeverity];
      if (severity !== 0) return severity;
      return a.pkg.name.localeCompare(b.pkg.name);
    }),
    errors,
  };
}
