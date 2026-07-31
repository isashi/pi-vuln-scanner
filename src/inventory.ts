import { access, readFile, readdir, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { GLOBAL_PI_AGENT_DIR } from "./config.ts";
import type { InstalledPackage, PackageJsonLike, PackageScope, PackageSourceKind } from "./types.ts";

interface SettingsPackageEntry {
  source: string;
}

interface SettingsFile {
  packages?: Array<string | SettingsPackageEntry>;
}

interface InstallContext {
  scope: PackageScope;
  settingsPath: string;
  settingsDir: string;
  agentDir: string;
  cwd: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

async function readPackageJson(rootPath: string): Promise<PackageJsonLike | undefined> {
  return readJson<PackageJsonLike>(join(rootPath, "package.json"));
}

function packageEntrySource(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry;
  if (isObject(entry) && typeof entry.source === "string") return entry.source;
  return undefined;
}

function parseNpmSpec(source: string): { name: string; version?: string } | undefined {
  if (!source.startsWith("npm:")) return undefined;
  const spec = source.slice("npm:".length);
  if (!spec) return undefined;
  if (spec.startsWith("@")) {
    const match = spec.match(/^(@[^/]+\/[^@]+)(?:@(.+))?$/);
    return match ? { name: match[1], version: match[2] } : undefined;
  }
  const match = spec.match(/^([^@]+)(?:@(.+))?$/);
  return match ? { name: match[1], version: match[2] } : undefined;
}

function sourceKind(source: string): PackageSourceKind {
  if (source.startsWith("npm:")) return "npm";
  if (source.startsWith("git:") || /^https?:\/\//.test(source) || /^ssh:\/\//.test(source) || /^git:\/\//.test(source)) return "git";
  if (source.startsWith("/") || source.startsWith("./") || source.startsWith("../") || source.startsWith("~")) return "local";
  return "unknown";
}

function sourceRemovalCommand(source: string): string | undefined {
  const kind = sourceKind(source);
  if (kind === "npm") {
    const parsed = parseNpmSpec(source);
    return parsed ? `pi remove npm:${parsed.name}` : `pi remove ${source}`;
  }
  if (kind === "git") {
    return `pi remove ${source.replace(/@[^/@:]+$/, "")}`;
  }
  if (kind === "local") return `pi remove ${source}`;
  return undefined;
}

function localSourcePath(source: string, settingsDir: string): string {
  if (source.startsWith("~/")) return resolve(process.env.HOME ?? "", source.slice(2));
  if (source.startsWith("/")) return source;
  return resolve(settingsDir, source);
}

async function packageRootForLocalSource(source: string, settingsDir: string): Promise<string | undefined> {
  const path = localSourcePath(source, settingsDir);
  try {
    const info = await stat(path);
    if (info.isDirectory()) return path;
    if (info.isFile()) return dirname(path);
  } catch {
    return undefined;
  }
  return undefined;
}

async function findPackageByName(installRoot: string, packageName: string): Promise<string | undefined> {
  const direct = join(installRoot, "node_modules", ...packageName.split("/"));
  if (await exists(join(direct, "package.json"))) return direct;
  return undefined;
}

async function listNpmPackages(installRoot: string): Promise<string[]> {
  const installManifest = await readJson<PackageJsonLike>(join(installRoot, "package.json"));
  const directNames = Object.keys(installManifest?.dependencies ?? {});
  const roots: string[] = [];

  if (directNames.length > 0) {
    for (const name of directNames) {
      const root = await findPackageByName(installRoot, name);
      if (root) roots.push(root);
    }
    return roots;
  }

  const nodeModules = join(installRoot, "node_modules");
  try {
    for (const entry of await readdir(nodeModules, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const path = join(nodeModules, entry.name);
      if (entry.name.startsWith("@")) {
        for (const scoped of await readdir(path, { withFileTypes: true })) {
          if (scoped.isDirectory() && await exists(join(path, scoped.name, "package.json"))) roots.push(join(path, scoped.name));
        }
      } else if (await exists(join(path, "package.json"))) {
        roots.push(path);
      }
    }
  } catch {
    return [];
  }
  return roots;
}

async function findGitPackageRoots(gitRoot: string, maxDepth = 5): Promise<string[]> {
  const roots: string[] = [];
  async function walk(current: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    if (await exists(join(current, "package.json"))) {
      roots.push(current);
      return;
    }
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === "node_modules" || entry.name === ".git") continue;
      await walk(join(current, entry.name), depth + 1);
    }
  }
  await walk(gitRoot, 0);
  return roots;
}

async function hasLockfile(rootPath: string): Promise<boolean> {
  return (await exists(join(rootPath, "package-lock.json"))) || (await exists(join(rootPath, "npm-shrinkwrap.json")));
}

async function canonical(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return path;
  }
}

function makeId(scope: PackageScope, kind: PackageSourceKind, name: string, rootPath: string): string {
  return `${scope}:${kind}:${name}:${rootPath}`;
}

async function makeInstalledPackage(input: {
  rootPath: string;
  source?: string;
  sourceKind: PackageSourceKind;
  scope: PackageScope;
  installRoot?: string;
  settingsPath?: string;
}): Promise<InstalledPackage | undefined> {
  const manifest = await readPackageJson(input.rootPath);
  const fallbackName = basename(input.rootPath);
  const name = manifest?.name ?? fallbackName;
  if (!name) return undefined;
  return {
    id: makeId(input.scope, input.sourceKind, name, input.rootPath),
    name,
    version: manifest?.version,
    source: input.source,
    sourceKind: input.sourceKind,
    scope: input.scope,
    rootPath: input.rootPath,
    installRoot: input.installRoot,
    settingsPath: input.settingsPath,
    removalCommand: input.source ? sourceRemovalCommand(input.source) : undefined,
    manifest,
    hasLockfile: await hasLockfile(input.rootPath),
  };
}

async function loadSettingsContext(scope: PackageScope, cwd: string): Promise<InstallContext | undefined> {
  const agentDir = scope === "global" ? GLOBAL_PI_AGENT_DIR : join(cwd, ".pi");
  const settingsPath = join(agentDir, "settings.json");
  if (!await exists(settingsPath)) return undefined;
  return { scope, settingsPath, settingsDir: dirname(settingsPath), agentDir, cwd };
}

async function packagesFromSettings(context: InstallContext): Promise<InstalledPackage[]> {
  const settings = await readJson<SettingsFile>(context.settingsPath);
  const packages = Array.isArray(settings?.packages) ? settings.packages : [];
  const results: InstalledPackage[] = [];

  for (const entry of packages) {
    const source = packageEntrySource(entry);
    if (!source) continue;
    const kind = sourceKind(source);
    let rootPath: string | undefined;
    let installRoot: string | undefined;

    if (kind === "npm") {
      const parsed = parseNpmSpec(source);
      installRoot = join(context.agentDir, "npm");
      if (parsed) rootPath = await findPackageByName(installRoot, parsed.name);
    } else if (kind === "local") {
      rootPath = await packageRootForLocalSource(source, context.settingsDir);
    }

    if (rootPath) {
      const pkg = await makeInstalledPackage({ rootPath, source, sourceKind: kind, scope: context.scope, installRoot, settingsPath: context.settingsPath });
      if (pkg) results.push(pkg);
    }
  }

  return results;
}

async function packagesFromInstallRoots(context: InstallContext): Promise<InstalledPackage[]> {
  const results: InstalledPackage[] = [];
  const npmRoot = join(context.agentDir, "npm");
  for (const rootPath of await listNpmPackages(npmRoot)) {
    const pkg = await makeInstalledPackage({ rootPath, sourceKind: "npm", scope: context.scope, installRoot: npmRoot, settingsPath: context.settingsPath });
    if (pkg) results.push(pkg);
  }

  const gitRoot = join(context.agentDir, "git");
  for (const rootPath of await findGitPackageRoots(gitRoot)) {
    const pkg = await makeInstalledPackage({ rootPath, sourceKind: "git", scope: context.scope, installRoot: gitRoot, settingsPath: context.settingsPath });
    if (pkg) results.push(pkg);
  }

  return results;
}

export async function discoverInstalledPackages(cwd: string, includeProject: boolean): Promise<InstalledPackage[]> {
  const contexts = (await Promise.all([
    loadSettingsContext("global", cwd),
    includeProject ? loadSettingsContext("project", cwd) : undefined,
  ])).filter((context): context is InstallContext => Boolean(context));

  const byRoot = new Map<string, InstalledPackage>();
  for (const context of contexts) {
    for (const pkg of [...await packagesFromSettings(context), ...await packagesFromInstallRoots(context)]) {
      const key = await canonical(pkg.rootPath);
      const existing = byRoot.get(key);
      if (!existing || (!existing.source && pkg.source)) byRoot.set(key, pkg);
    }
  }
  return [...byRoot.values()].sort((a, b) => `${a.scope}:${a.name}`.localeCompare(`${b.scope}:${b.name}`));
}
