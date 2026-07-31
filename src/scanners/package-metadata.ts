import { access, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import type { InstalledPackage, RiskSignal } from "../types.ts";

const LIFECYCLE_SCRIPTS = ["preinstall", "install", "postinstall", "prepare"];
const NATIVE_DEPENDENCY_NAMES = new Set(["node-gyp", "node-pre-gyp", "prebuild", "prebuild-install", "bindings", "nan", "node-addon-api"]);
const PI_CORE_PACKAGES = new Set([
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-tui",
  "typebox",
]);

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function containsNativeBinary(rootPath: string, maxDepth = 4): Promise<boolean> {
  async function walk(current: string, depth: number): Promise<boolean> {
    if (depth > maxDepth) return false;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const path = join(current, entry.name);
      if (entry.isFile() && entry.name.endsWith(".node")) return true;
      if (entry.isDirectory() && await walk(path, depth + 1)) return true;
    }
    return false;
  }
  return walk(rootPath, 0);
}

function dependencyNames(pkg: InstalledPackage): string[] {
  return [
    ...Object.keys(pkg.manifest?.dependencies ?? {}),
    ...Object.keys(pkg.manifest?.devDependencies ?? {}),
    ...Object.keys(pkg.manifest?.peerDependencies ?? {}),
  ];
}

export async function scanPackageMetadata(pkg: InstalledPackage): Promise<RiskSignal[]> {
  const manifest = pkg.manifest;
  const signals: RiskSignal[] = [];
  if (!manifest) {
    signals.push({ severity: "medium", label: "missing package.json", details: "Unable to read package manifest." });
    return signals;
  }

  const lifecycleScripts = LIFECYCLE_SCRIPTS.filter((script) => manifest.scripts?.[script]);
  if (lifecycleScripts.length > 0) {
    signals.push({
      severity: "high",
      label: "lifecycle install scripts",
      details: lifecycleScripts.map((script) => `${script}: ${manifest.scripts?.[script]}`).join("; "),
    });
  }

  const deps = dependencyNames(pkg);
  const nativeDeps = deps.filter((name) => NATIVE_DEPENDENCY_NAMES.has(name));
  const hasBindingGyp = await exists(join(pkg.rootPath, "binding.gyp"));
  const hasNativeBinary = await containsNativeBinary(pkg.rootPath);
  if (nativeDeps.length > 0 || hasBindingGyp || hasNativeBinary) {
    signals.push({
      severity: "high",
      label: "native-code indicators",
      details: [
        nativeDeps.length ? `dependencies: ${nativeDeps.join(", ")}` : undefined,
        hasBindingGyp ? "binding.gyp present" : undefined,
        hasNativeBinary ? ".node binary present" : undefined,
      ].filter(Boolean).join("; "),
    });
  }

  if (manifest.deprecated) {
    signals.push({ severity: "high", label: "npm package deprecated", details: manifest.deprecated });
  }

  if (!manifest.license) signals.push({ severity: "low", label: "missing license metadata" });
  if (!manifest.repository) signals.push({ severity: "low", label: "missing repository metadata" });

  const piManifest = manifest.pi;
  const hasConventionalResource = await Promise.all(["extensions", "skills", "prompts", "themes"].map((dir) => exists(join(pkg.rootPath, dir))));
  if (!piManifest && !hasConventionalResource.some(Boolean)) {
    signals.push({ severity: "medium", label: "missing pi manifest/resources", details: "No package.json pi manifest or conventional pi resource directories found." });
  }

  for (const extensionPath of piManifest?.extensions ?? []) {
    if (/[*?[{]/.test(extensionPath)) continue;
    if (!await exists(join(pkg.rootPath, extensionPath))) {
      signals.push({ severity: "medium", label: "missing extension entry", details: extensionPath });
    }
  }

  const depsPiCore = Object.keys(manifest.dependencies ?? {}).filter((name) => PI_CORE_PACKAGES.has(name));
  if (depsPiCore.length > 0) {
    signals.push({ severity: "low", label: "pi core packages in dependencies", details: `Prefer peerDependencies for: ${depsPiCore.join(", ")}` });
  }

  if (!pkg.hasLockfile && pkg.sourceKind === "git") {
    signals.push({ severity: "low", label: "missing lockfile", details: "Git/local pi packages should commit a lockfile for reproducible installs." });
  }

  return signals;
}
