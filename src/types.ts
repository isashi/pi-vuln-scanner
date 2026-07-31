export type PackageSourceKind = "npm" | "git" | "local" | "unknown";
export type PackageScope = "global" | "project";
export type Severity = "critical" | "high" | "medium" | "low" | "info" | "none";
export type FindingSource = "npm-audit" | "osv" | "package-metadata";

export interface ScannerConfig {
  scanOnStartup: boolean;
  scanIntervalHours: number;
  providers: {
    npmAudit: boolean;
    osv: boolean;
    packageMetadata: boolean;
  };
  thresholds: {
    startupWarning: Exclude<Severity, "none">;
    showRemoveCommand: Exclude<Severity, "none">;
  };
  privacy: {
    allowNetwork: boolean;
    sendNpmPackageNames: boolean;
    sendLocalPackagePaths: boolean;
  };
}

export interface PackageJsonLike {
  name?: string;
  version?: string;
  description?: string;
  license?: string;
  repository?: unknown;
  homepage?: string;
  bugs?: unknown;
  deprecated?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  bundledDependencies?: string[];
  bundleDependencies?: string[];
  pi?: {
    extensions?: string[];
    skills?: string[];
    prompts?: string[];
    themes?: string[];
    image?: string;
    video?: string;
  };
  keywords?: string[];
}

export interface InstalledPackage {
  id: string;
  name: string;
  version?: string;
  source?: string;
  sourceKind: PackageSourceKind;
  scope: PackageScope;
  rootPath: string;
  installRoot?: string;
  settingsPath?: string;
  removalCommand?: string;
  manifest?: PackageJsonLike;
  hasLockfile: boolean;
}

export interface VulnerabilityFinding {
  source: FindingSource;
  packageName: string;
  dependencyName?: string;
  severity: Severity;
  id?: string;
  title: string;
  url?: string;
  direct: boolean;
  fixAvailable?: string | boolean;
}

export interface RiskSignal {
  severity: Severity;
  label: string;
  details?: string;
}

export interface PackageScanResult {
  pkg: InstalledPackage;
  findings: VulnerabilityFinding[];
  signals: RiskSignal[];
  worstSeverity: Severity;
  counts: Record<Severity, number>;
}

export interface ScanSummary {
  totalPackages: number;
  totalFindings: number;
  counts: Record<Severity, number>;
  worstSeverity: Severity;
  scannedAt: string;
  durationMs: number;
}

export interface ScanReport {
  version: 1;
  config: ScannerConfig;
  summary: ScanSummary;
  packages: PackageScanResult[];
  errors: string[];
}

export interface OsvVulnerability {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  modified?: string;
  published?: string;
  database_specific?: { severity?: string; [key: string]: unknown };
  severity?: Array<{ type: string; score: string }>;
  references?: Array<{ type: string; url: string }>;
}
