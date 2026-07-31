import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { InstalledPackage, PackageJsonLike } from "../types.ts";

export interface DependencyCoordinate {
  name: string;
  version: string;
  direct: boolean;
  root: boolean;
}

interface LockPackage {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface PackageLockLike {
  name?: string;
  version?: string;
  packages?: Record<string, LockPackage>;
  dependencies?: Record<string, { version?: string; dependencies?: Record<string, string> }>;
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function packageKey(name: string): string {
  return `node_modules/${name}`;
}

function nameFromPackageKey(key: string): string | undefined {
  if (!key) return undefined;
  const marker = "node_modules/";
  const index = key.lastIndexOf(marker);
  if (index < 0) return undefined;
  return key.slice(index + marker.length);
}

function packageDependencies(pkg: LockPackage | PackageJsonLike | undefined): Record<string, string> {
  return {
    ...(pkg?.dependencies ?? {}),
    ...((pkg as LockPackage | undefined)?.optionalDependencies ?? {}),
  };
}

function resolveDependency(packages: Record<string, LockPackage>, fromKey: string, depName: string): string | undefined {
  const nested = fromKey ? `${fromKey}/node_modules/${depName}` : packageKey(depName);
  if (packages[nested]?.version) return nested;

  let current = fromKey;
  while (current.includes("/node_modules/")) {
    current = current.slice(0, current.lastIndexOf("/node_modules/"));
    const candidate = current ? `${current}/node_modules/${depName}` : packageKey(depName);
    if (packages[candidate]?.version) return candidate;
  }

  const rootCandidate = packageKey(depName);
  if (packages[rootCandidate]?.version) return rootCandidate;
  return undefined;
}

function lockPathForPackage(pkg: InstalledPackage): { path: string; rootKey: string } | undefined {
  if (pkg.hasLockfile) return { path: join(pkg.rootPath, "package-lock.json"), rootKey: "" };
  if (pkg.installRoot) return { path: join(pkg.installRoot, "package-lock.json"), rootKey: packageKey(pkg.name) };
  return undefined;
}

export async function getDependencyCoordinates(pkg: InstalledPackage, includeTransitive: boolean): Promise<DependencyCoordinate[]> {
  const coordinates = new Map<string, DependencyCoordinate>();
  if (pkg.version) {
    coordinates.set(`${pkg.name}@${pkg.version}`, { name: pkg.name, version: pkg.version, direct: true, root: true });
  }

  const lockInfo = lockPathForPackage(pkg);
  if (!lockInfo) return [...coordinates.values()];

  const lock = await readJson<PackageLockLike>(lockInfo.path);
  const packages = lock?.packages;
  if (!packages) return [...coordinates.values()];

  const rootPackage = packages[lockInfo.rootKey] ?? { dependencies: pkg.manifest?.dependencies };
  const directNames = new Set(Object.keys(packageDependencies(rootPackage)).length > 0
    ? Object.keys(packageDependencies(rootPackage))
    : Object.keys(pkg.manifest?.dependencies ?? {}));

  const queue: Array<{ key: string; direct: boolean }> = [];
  for (const depName of directNames) {
    const key = resolveDependency(packages, lockInfo.rootKey, depName);
    if (key) queue.push({ key, direct: true });
  }

  const visited = new Set<string>();
  while (queue.length > 0) {
    const item = queue.shift()!;
    if (visited.has(item.key)) continue;
    visited.add(item.key);

    const locked = packages[item.key];
    const name = locked?.name ?? nameFromPackageKey(item.key);
    const version = locked?.version;
    if (!name || !version) continue;
    const id = `${name}@${version}`;
    const existing = coordinates.get(id);
    coordinates.set(id, {
      name,
      version,
      direct: item.direct || existing?.direct === true,
      root: false,
    });

    if (!includeTransitive) continue;
    for (const depName of Object.keys(packageDependencies(locked))) {
      const key = resolveDependency(packages, item.key, depName);
      if (key && !visited.has(key)) queue.push({ key, direct: false });
    }
  }

  return [...coordinates.values()].sort((a, b) => Number(b.root) - Number(a.root) || Number(b.direct) - Number(a.direct) || a.name.localeCompare(b.name));
}
