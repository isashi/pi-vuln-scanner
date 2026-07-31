import assert from "node:assert/strict";
import test from "node:test";
import { scanNpmRegistryPackage } from "../src/scanners/npm-registry.ts";
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

test("new npm packages are informational signals", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    time: {
      created: new Date().toISOString(),
      "1.0.0": new Date().toISOString(),
    },
    maintainers: [{ name: "dev" }],
    versions: {
      "1.0.0": {
        license: "MIT",
        repository: { type: "git", url: "https://example.com/repo.git" },
      },
    },
  }), { status: 200, headers: { "content-type": "application/json" } });

  const result = await scanNpmRegistryPackage(pkg);
  assert.equal(result.error, undefined);
  assert.equal(result.signals.find((signal) => signal.label === "new npm package")?.severity, "info");
});
