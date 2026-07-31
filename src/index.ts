import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { clearCache, loadCachedReport, saveCachedReport } from "./storage.ts";
import { cacheIsFresh, CACHE_PATH, CONFIG_PATH, DEFAULT_CONFIG, loadConfig, saveConfig } from "./config.ts";
import { renderScanReport, renderStartupWarning, renderSummaryLine } from "./report.ts";
import { runScan } from "./scanner.ts";
import type { ScanReport } from "./types.ts";

const REPORT_ENTRY_TYPE = "pi-vuln-scan-report";

export default function piVulnScanner(pi: ExtensionAPI): void {
  let activeScan: Promise<ScanReport> | undefined;
  let lastReport: ScanReport | undefined;

  pi.registerEntryRenderer(REPORT_ENTRY_TYPE, (entry, _options, theme) => {
    const data = entry.data as { report?: string; summary?: string };
    const text = data.report ?? data.summary ?? "";
    return new Text(theme.fg("dim", text), 0, 0);
  });

  function includeProject(ctx: ExtensionContext): boolean {
    try {
      return ctx.isProjectTrusted();
    } catch {
      return false;
    }
  }

  function setStatus(ctx: ExtensionContext, report: ScanReport | undefined, scanning = false): void {
    if (!ctx.hasUI) return;
    if (scanning) {
      ctx.ui.setStatus("pi-vuln", ctx.ui.theme.fg("warning", "scan…"));
      return;
    }
    if (!report) {
      ctx.ui.setStatus("pi-vuln", undefined);
      return;
    }
    const counts = report.summary.counts;
    const risky = counts.critical + counts.high;
    if (risky > 0) ctx.ui.setStatus("pi-vuln", ctx.ui.theme.fg("error", `vuln ${counts.critical}C/${counts.high}H`));
    else if (report.summary.totalFindings > 0) ctx.ui.setStatus("pi-vuln", ctx.ui.theme.fg("warning", `vuln ${report.summary.totalFindings}`));
    else ctx.ui.setStatus("pi-vuln", ctx.ui.theme.fg("success", "vuln ok"));
  }

  function showReport(report: ScanReport): void {
    const rendered = renderScanReport(report);
    pi.appendEntry(REPORT_ENTRY_TYPE, {
      summary: renderSummaryLine(report),
      report: rendered,
    });
  }

  async function scanNow(ctx: ExtensionContext, force = false): Promise<ScanReport> {
    if (activeScan) return activeScan;
    const config = await loadConfig();
    if (!force) {
      const cached = await loadCachedReport();
      if (cached && cacheIsFresh(cached.summary.scannedAt, config)) {
        lastReport = cached;
        setStatus(ctx, cached);
        return cached;
      }
    }

    setStatus(ctx, undefined, true);
    activeScan = runScan({ cwd: ctx.cwd, includeProject: includeProject(ctx), config })
      .then(async (report) => {
        lastReport = report;
        await saveCachedReport(report);
        setStatus(ctx, report);
        return report;
      })
      .finally(() => {
        activeScan = undefined;
      });
    return activeScan;
  }

  async function runStartupScan(ctx: ExtensionContext): Promise<void> {
    const config = await loadConfig();
    if (!config.scanOnStartup) return;
    const cached = await loadCachedReport();
    if (cached && cacheIsFresh(cached.summary.scannedAt, config)) {
      lastReport = cached;
      setStatus(ctx, cached);
      const warning = renderStartupWarning(cached);
      if (warning && ctx.hasUI) ctx.ui.notify(warning, "warning");
      return;
    }

    try {
      const report = await scanNow(ctx, true);
      const warning = renderStartupWarning(report);
      if (warning && ctx.hasUI) ctx.ui.notify(warning, "warning");
      else if (ctx.hasUI) ctx.ui.notify(renderSummaryLine(report), "info");
    } catch (error) {
      if (ctx.hasUI) ctx.ui.notify(`pi-vuln-scanner failed: ${error instanceof Error ? error.message : String(error)}`, "error");
      setStatus(ctx, undefined);
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    // Intentionally fire-and-forget: scanning may call network providers and should not block the TUI startup.
    void runStartupScan(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (ctx.hasUI) {
      ctx.ui.setStatus("pi-vuln", undefined);
      ctx.ui.setWidget("pi-vuln", undefined);
    }
  });

  pi.registerCommand("pi-scan", {
    description: "Scan locally installed pi packages for vulnerabilities now",
    handler: async (args, ctx) => {
      const force = !args.includes("--cached");
      try {
        const report = await scanNow(ctx, force);
        showReport(report);
        if (ctx.hasUI) ctx.ui.notify(renderSummaryLine(report), renderStartupWarning(report) ? "warning" : "info");
      } catch (error) {
        if (ctx.hasUI) ctx.ui.notify(`Scan failed: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
  });

  pi.registerCommand("pi-scan-report", {
    description: "Show the latest pi package vulnerability scan report",
    handler: async (_args, ctx) => {
      const report = lastReport ?? await loadCachedReport();
      if (!report) {
        if (ctx.hasUI) ctx.ui.notify("No scan report cached yet. Run /pi-scan first.", "warning");
        return;
      }
      lastReport = report;
      setStatus(ctx, report);
      showReport(report);
    },
  });

  pi.registerCommand("pi-scan-config", {
    description: "Show pi-vuln-scanner configuration paths and current settings",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      if (trimmed === "init" || trimmed === "write-defaults") {
        await saveConfig(DEFAULT_CONFIG);
      }
      const config = await loadConfig();
      const report = [
        "pi-vuln-scanner config",
        "======================",
        "",
        `Config: ${CONFIG_PATH}`,
        `Cache:  ${CACHE_PATH}`,
        "",
        JSON.stringify(config, null, 2),
        "",
        "Commands:",
        "  /pi-scan-config init       write default config file",
        "  /pi-scan-clear-cache       remove cached scan results",
      ].join("\n");
      pi.appendEntry(REPORT_ENTRY_TYPE, { summary: "pi-vuln-scanner config", report });
      if (ctx.hasUI && (trimmed === "init" || trimmed === "write-defaults")) ctx.ui.notify(`Wrote ${CONFIG_PATH}`, "info");
    },
  });

  pi.registerCommand("pi-scan-clear-cache", {
    description: "Clear cached pi vulnerability scan results",
    handler: async (_args, ctx) => {
      await clearCache();
      lastReport = undefined;
      setStatus(ctx, undefined);
      if (ctx.hasUI) ctx.ui.notify("pi-vuln-scanner cache cleared", "info");
    },
  });
}
