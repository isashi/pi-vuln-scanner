import type { PackageScanResult, Severity, VulnerabilityFinding } from "./types.ts";

export const SEVERITY_RANK: Record<Severity, number> = {
  none: 0,
  info: 1,
  low: 2,
  medium: 3,
  high: 4,
  critical: 5,
};

export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info", "none"];

export function normalizeSeverity(value: unknown): Severity {
  if (typeof value !== "string") return "info";
  const lowered = value.toLowerCase();
  if (lowered === "critical" || lowered === "high" || lowered === "medium" || lowered === "low") return lowered;
  if (lowered === "moderate") return "medium";
  if (lowered === "none") return "none";
  return "info";
}

export function maxSeverity(values: Iterable<Severity>): Severity {
  let max: Severity = "none";
  for (const value of values) {
    if (SEVERITY_RANK[value] > SEVERITY_RANK[max]) max = value;
  }
  return max;
}

export function isAtLeast(severity: Severity, threshold: Severity): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[threshold];
}

export function emptySeverityCounts(): Record<Severity, number> {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0, none: 0 };
}

export function countFindings(findings: VulnerabilityFinding[]): Record<Severity, number> {
  const counts = emptySeverityCounts();
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}

export function finalizePackageResult(result: Omit<PackageScanResult, "worstSeverity" | "counts">): PackageScanResult {
  const counts = countFindings(result.findings);
  const findingWorst = maxSeverity(result.findings.map((finding) => finding.severity));
  const signalWorst = maxSeverity(result.signals.map((signal) => signal.severity));
  return {
    ...result,
    counts,
    worstSeverity: maxSeverity([findingWorst, signalWorst]),
  };
}

export function mergeUniqueFindings(findings: VulnerabilityFinding[]): VulnerabilityFinding[] {
  const seen = new Set<string>();
  const unique: VulnerabilityFinding[] = [];
  for (const finding of findings) {
    const key = [finding.source, finding.packageName, finding.dependencyName ?? "", finding.id ?? finding.title].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(finding);
  }
  return unique;
}
