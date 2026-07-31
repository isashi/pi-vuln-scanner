import { performance } from "node:perf_hooks";
import { discoverInstalledPackages } from "./inventory.ts";
import { SEVERITY_RANK, emptySeverityCounts, finalizePackageResult, maxSeverity, mergeUniqueFindings } from "./risk.ts";
import { getDependencyCoordinates } from "./scanners/dependencies.ts";
import { scanDepsDevPackage } from "./scanners/deps-dev.ts";
import { scanNpmAuditRoot } from "./scanners/npm-audit.ts";
import { scanNpmRegistryPackage } from "./scanners/npm-registry.ts";
import { scanOssIndexDependencies } from "./scanners/oss-index.ts";
import { scanOsvDependencies, scanOsvPackage } from "./scanners/osv.ts";
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

    const dependencyCoordinates = await getDependencyCoordinates(pkg, options.config.providers.osvTransitive || options.config.providers.ossIndex);

    if (options.config.providers.packageMetadata) {
      signals.push(...await scanPackageMetadata(pkg));
    }

    if (options.config.privacy.allowNetwork && options.config.privacy.sendNpmPackageNames) {
      if (options.config.providers.npmRegistry) {
        const result = await scanNpmRegistryPackage(pkg);
        findings.push(...result.findings);
        signals.push(...result.signals);
        if (result.error) errors.push(result.error);
      }

      if (options.config.providers.depsDev) {
        const result = await scanDepsDevPackage(pkg);
        findings.push(...result.findings);
        signals.push(...result.signals);
        if (result.error) errors.push(result.error);
      }

      if (options.config.providers.osv) {
        const result = options.config.providers.osvTransitive
          ? await scanOsvDependencies(pkg, dependencyCoordinates)
          : await scanOsvPackage(pkg);
        findings.push(...result.findings);
        if (result.error) errors.push(result.error);
      }

      if (options.config.providers.ossIndex) {
        const result = await scanOssIndexDependencies(pkg, dependencyCoordinates, options.config);
        findings.push(...result.findings);
        if (result.error) errors.push(result.error);
      }
    }

    if (options.config.providers.npmAudit) {
      const auditRoot = pkg.hasLockfile
        ? pkg.rootPath
        : (pkg.sourceKind === "npm" && pkg.installRoot && installRootCounts.get(pkg.installRoot) === 1 ? pkg.installRoot : undefined);
      if (auditRoot) {
        const result = await scanNpmAuditRoot(auditRoot, pkg.name);
        findings.push(...result.findings);
        if (result.error) errors.push(result.error);
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
