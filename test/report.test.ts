import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { renderScanReport, renderSummaryLine, renderStartupWarning } from "../src/report.ts";
import type { InstalledPackage, ScanReport } from "../src/types.ts";

const basePackage: InstalledPackage = {
  id: "global:npm:demo:/tmp/demo",
  name: "demo",
  version: "1.0.0",
  source: "npm:demo",
  sourceKind: "npm",
  scope: "global",
  rootPath: "/tmp/demo",
  hasLockfile: true,
};

test("info-only reports are detailed but not startup warnings", () => {
  const report: ScanReport = {
    version: 1,
    config: DEFAULT_CONFIG,
    summary: {
      totalPackages: 1,
      totalFindings: 0,
      counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, none: 0 },
      worstSeverity: "info",
      scannedAt: "2026-07-31T00:00:00.000Z",
      durationMs: 10,
    },
    packages: [{
      pkg: basePackage,
      findings: [],
      signals: [{ severity: "info", label: "shared npm install root", details: "audit attribution skipped" }],
      worstSeverity: "info",
      counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, none: 0 },
    }],
    errors: [],
  };

  assert.equal(renderStartupWarning(report), undefined);
  assert.match(renderSummaryLine(report), /0 vulnerabilities, 1 signal, worst INFO/);
  assert.match(renderScanReport(report), /Packages with vulnerabilities or signals:/);
  assert.match(renderScanReport(report), /shared npm install root/);
});
