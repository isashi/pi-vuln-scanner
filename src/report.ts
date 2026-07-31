import { isAtLeast, SEVERITY_RANK, SEVERITIES } from "./risk.ts";
import type { PackageScanResult, ScanReport, Severity } from "./types.ts";

const LABELS: Record<Severity, string> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
  info: "INFO",
  none: "OK",
};

function countsText(counts: Record<Severity, number>): string {
  return SEVERITIES
    .filter((severity) => severity !== "none" && counts[severity] > 0)
    .map((severity) => `${counts[severity]} ${severity}`)
    .join(", ") || "0 vulnerabilities";
}

function signalCount(report: ScanReport): number {
  return report.packages.reduce((total, result) => total + result.signals.length, 0);
}

function packageHeader(result: PackageScanResult): string {
  const source = result.pkg.source ?? result.pkg.sourceKind;
  const version = result.pkg.version ? `@${result.pkg.version}` : "";
  return `${LABELS[result.worstSeverity].padEnd(8)} ${result.pkg.name}${version}  ${result.pkg.scope} ${source}`;
}

export function renderScanReport(report: ScanReport): string {
  const lines: string[] = [];
  lines.push("pi vulnerability scan report");
  lines.push("============================");
  lines.push("");
  lines.push(`Scanned: ${report.summary.scannedAt}`);
  lines.push(`Duration: ${report.summary.durationMs}ms`);
  lines.push(`Packages: ${report.summary.totalPackages}`);
  lines.push(`Vulnerabilities: ${countsText(report.summary.counts)}`);
  lines.push(`Risk signals: ${signalCount(report)}`);
  lines.push(`Worst severity: ${LABELS[report.summary.worstSeverity]}`);
  lines.push("");

  const noteworthy = report.packages.filter((result) => result.findings.length > 0 || result.signals.length > 0);
  if (noteworthy.length === 0) {
    lines.push("No vulnerable or risky pi packages found.");
  } else {
    lines.push("Packages with vulnerabilities or signals:");
    lines.push("");
    for (const result of noteworthy) {
      lines.push(packageHeader(result));
      lines.push(`  Path: ${result.pkg.rootPath}`);
      if (result.findings.length > 0) lines.push(`  Vulnerabilities: ${countsText(result.counts)}`);
      if (result.pkg.removalCommand && isAtLeast(result.worstSeverity, report.config.thresholds.showRemoveCommand)) {
        lines.push(`  Remove: ${result.pkg.removalCommand}`);
      }
      for (const finding of result.findings.slice(0, 12).sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])) {
        const dependency = finding.dependencyName && finding.dependencyName !== result.pkg.name ? ` (${finding.dependencyName})` : "";
        const id = finding.id ? `${finding.id}: ` : "";
        lines.push(`  - [${LABELS[finding.severity]}] ${id}${finding.title}${dependency} [${finding.source}]`);
        if (finding.url) lines.push(`    ${finding.url}`);
        if (finding.fixAvailable) lines.push(`    fix available: ${finding.fixAvailable}`);
      }
      if (result.findings.length > 12) lines.push(`  - ... ${result.findings.length - 12} more findings`);
      for (const signal of result.signals.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])) {
        lines.push(`  - [${LABELS[signal.severity]}] ${signal.label}${signal.details ? `: ${signal.details}` : ""}`);
      }
      lines.push("");
    }
  }

  const clean = report.packages.filter((result) => result.worstSeverity === "none");
  if (clean.length > 0) {
    lines.push(`Clean packages: ${clean.map((result) => result.pkg.name).join(", ")}`);
    lines.push("");
  }

  if (report.errors.length > 0) {
    lines.push("Scanner errors/warnings:");
    for (const error of report.errors) lines.push(`  - ${error}`);
    lines.push("");
  }

  lines.push("Notes:");
  lines.push("  - Report is advisory only; pi package loading is not blocked.");
  lines.push("  - Network providers send npm package names and versions only when enabled.");
  lines.push("  - Socket.dev is not queried automatically in this MVP; public pages are not scraped.");
  return lines.join("\n");
}

export function renderSummaryLine(report: ScanReport): string {
  const counts = report.summary.counts;
  const vuln = countsText(counts);
  const signals = signalCount(report);
  const signalsText = signals === 1 ? "1 signal" : `${signals} signals`;
  return `pi packages: ${report.summary.totalPackages}, ${vuln}, ${signalsText}, worst ${LABELS[report.summary.worstSeverity]}`;
}

export function renderStartupWarning(report: ScanReport): string | undefined {
  if (!isAtLeast(report.summary.worstSeverity, report.config.thresholds.startupWarning)) return undefined;
  const top = report.packages
    .filter((result) => isAtLeast(result.worstSeverity, report.config.thresholds.startupWarning))
    .slice(0, 5)
    .map((result) => `${result.pkg.name} (${LABELS[result.worstSeverity]})`)
    .join(", ");
  return `Risky pi packages detected: ${top}. Run /pi-scan-report for details.`;
}
