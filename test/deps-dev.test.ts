import assert from "node:assert/strict";
import test from "node:test";
import { scanDepsDevPackage } from "../src/scanners/deps-dev.ts";
import type { InstalledPackage } from "../src/types.ts";

const originalFetch = globalThis.fetch;

const pkg: InstalledPackage = {
  id: "global:npm:demo:/tmp/demo",
  name: "demo",
  version: "1.0.0",
  sourceKind: "npm",
  scope: "global",
  rootPath: "/tmp/demo",
  hasLockfile: false,
};

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("deps.dev 404 is treated as not-yet-indexed", async () => {
  globalThis.fetch = async () => new Response("not found", { status: 404 });
  const result = await scanDepsDevPackage(pkg);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.signals, []);
  assert.equal(result.error, undefined);
});
