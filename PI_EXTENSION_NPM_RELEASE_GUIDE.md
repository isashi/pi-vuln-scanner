# pi extension npm release guide

This guide captures recommended practices for publishing a **pi extension** package to GitHub + npm, installable with:

```bash
pi install npm:<package-name>
```

It is tuned for extension packages that pi loads directly from TypeScript via `jiti`, without a build step.

## Goals

- Publish a pi package with a valid `pi.extensions` manifest.
- Keep npm metadata complete for discoverability and user trust.
- Keep the package dependency-light and audit-clean.
- Use GitHub Actions + npm Trusted Publishing instead of local npm tokens.
- Publish with provenance via `npm publish --provenance`.
- Document release steps clearly enough for future maintainers and AI agents.

## Recommended package structure

```txt
my-pi-extension/
  .github/
    workflows/
      ci.yml
      publish.yml
  src/
    index.ts
  test/
    *.test.mjs or *.test.ts
  README.md
  CHANGELOG.md
  CONTRIBUTING.md
  SECURITY.md
  LICENSE
  package.json
  package-lock.json
  tsconfig.json
  .gitignore
```

For simple extensions, pi can load TypeScript directly. Expose the extension through the `pi.extensions` manifest.

## package.json checklist

Example baseline:

```json
{
  "name": "my-pi-extension",
  "version": "0.1.0",
  "private": false,
  "type": "module",
  "description": "A concise description of what the pi extension does",
  "homepage": "https://github.com/<user>/<repo>#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/<user>/<repo>.git"
  },
  "bugs": {
    "url": "https://github.com/<user>/<repo>/issues"
  },
  "keywords": [
    "pi-package",
    "pi",
    "pi-coding-agent",
    "pi-extension",
    "pi-coding-agent-extension",
    "coding-agent",
    "security",
    "developer-tools"
  ],
  "license": "MIT",
  "author": "<npm-user>",
  "engines": {
    "node": ">=22.19.0"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "node --test",
    "audit": "npm audit --audit-level=high",
    "check": "npm run typecheck && npm test && npm run audit"
  },
  "files": [
    "src",
    "README.md",
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "LICENSE"
  ],
  "pi": {
    "extensions": ["./src/index.ts"]
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "typebox": "*"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.9.0"
  }
}
```

Notes:

- `pi-package` is required for pi package gallery/discovery.
- Current pi requires Node `>=22.19.0`; do not advertise Node 18 compatibility unless tested against an older pi distribution that supports it.
- Use `pi.extensions` for extension entry points.
- Pi core packages should be listed as `peerDependencies` with a `"*"` range and not bundled:
  - `@earendil-works/pi-coding-agent`
  - `@earendil-works/pi-ai`
  - `@earendil-works/pi-agent-core`
  - `@earendil-works/pi-tui`
  - `typebox`
- It is fine to also install pi core packages during development/CI if needed for type checking, but keep them out of bundled runtime dependencies.
- Put third-party runtime dependencies in `dependencies`; pi installs packages with production dependencies only.
- Put build/test-only tools in `devDependencies`.
- Keep `files` restrictive so the npm tarball stays clean.
- Avoid lifecycle scripts such as `postinstall` unless absolutely necessary. Security-focused pi packages should not require install scripts.
- For scoped public packages, publish with `npm publish --provenance --access public`.

## tsconfig.json baseline

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

## Extension implementation checklist

A pi extension exports a default factory function:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Hello ${args || "world"}!`, "info");
    }
  });

  pi.registerTool({
    name: "greet",
    label: "Greet",
    description: "Greet someone by name",
    parameters: Type.Object({
      name: Type.String({ description: "Name to greet" })
    }),
    async execute(_toolCallId, params) {
      return {
        content: [{ type: "text", text: `Hello, ${params.name}!` }],
        details: {}
      };
    }
  });
}
```

Best practices:

- Do not start long-lived watchers, timers, subprocesses, or network polling in the factory.
- Start session-scoped resources in `session_start` and clean them in `session_shutdown`.
- Use `ctx.hasUI` / `ctx.mode === "tui"` before UI-only behavior.
- Use `ctx.signal` for abortable nested async work during active turns.
- Avoid reading project-local config unless `ctx.isProjectTrusted()` is true.
- Custom tools must truncate large output before returning it to the model.
- If the extension scans security data, be explicit about what metadata is sent to remote APIs.

## README checklist for npm score and user trust

Include:

- npm version badge.
- npm downloads badge.
- CI badge after workflow exists.
- license badge.
- Short value proposition.
- Install instructions:

```bash
pi install npm:my-pi-extension
```

- Local testing instructions:

```bash
pi -e ./src/index.ts
```

- Usage examples for commands/tools/events.
- Configuration section.
- Privacy/security section, especially for extensions that access package metadata or call external APIs.
- Troubleshooting section.
- Link to issues.
- Link to changelog.

## Required support files

### .gitignore

```gitignore
node_modules/
*.tgz
.env
.env.*
!.env.example
.DS_Store
coverage/
dist/
```

### CHANGELOG.md

```md
# Changelog

All notable changes to this project are documented here.

## 0.1.0 - YYYY-MM-DD

- Initial release.
```

### CONTRIBUTING.md

Document local checks and release process. Include this release policy:

```md
## Release process

This project publishes to npm through GitHub Actions trusted publishing. Do not publish from a local shell unless explicitly required as an emergency fallback.

Normal release flow:

1. Ensure the npm package has this trusted publisher configured:
   - owner/user: `<github-user-or-org>`
   - repository: `<repo>`
   - workflow: `publish.yml`
2. Run local validation:

   ```bash
   npm ci
   npm run check
   npm pack --dry-run
   ```

3. Bump the version and update `CHANGELOG.md`.
4. Commit release changes with `chore: release x.y.z` or a Conventional Commit matching the release type.
5. Create and push the matching tag:

   ```bash
   git tag vx.y.z
   git push origin main
   git push origin vx.y.z
   ```

6. If the automatic run needs to be retried, use GitHub Actions → `Publish to npm` → `Run workflow` on `main`.

The publish workflow executes `npm publish --provenance`, so it should not require an `NPM_TOKEN`.
```

### SECURITY.md

```md
# Security Policy

## Supported Versions

Security updates are provided for the latest published version.

## Reporting a Vulnerability

Please report security issues privately through GitHub security advisories when available, or contact the maintainer through the repository. Do not disclose vulnerabilities publicly until reviewed.
```

## GitHub Actions CI

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  check:
    name: Check package
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run checks
        run: npm run check

      - name: Verify package contents
        run: npm pack --dry-run
```

## GitHub Actions npm Trusted Publishing

`.github/workflows/publish.yml`:

```yaml
name: Publish to npm

on:
  workflow_dispatch:
  release:
    types: [published]
  push:
    tags:
      - 'v*.*.*'

permissions:
  contents: read
  id-token: write

jobs:
  publish:
    name: Publish package
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version: 24
          registry-url: https://registry.npmjs.org
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run checks
        run: npm run check

      - name: Verify package contents
        run: npm pack --dry-run

      - name: Publish to npm
        run: npm publish --provenance
```

Use `npm publish --provenance --access public` instead if the package is scoped and public.

## npm Trusted Publisher setup

On npmjs.com, open the package settings:

```txt
Package → Settings → Publishing → Trusted publishers → Add trusted publisher
```

Configure:

```txt
Publisher type: GitHub Actions
Organization/user: <github-user-or-org>
Repository: <repo>
Workflow filename: publish.yml
Environment: leave empty unless intentionally using one
```

No `NPM_TOKEN` is needed for trusted publishing.

## Release versioning policy

Use SemVer and Conventional Commits:

- `fix:` → patch release.
- `feat:` → minor release.
- `feat!:` or `BREAKING CHANGE:` → major release.
- `docs:`, `chore:`, `ci:` → usually no release unless version is explicitly bumped.

For extension packages:

- Patch: bug fixes, docs, metadata, minor internal improvements.
- Minor: new command/tool/compatible feature.
- Major: command renames/removals, incompatible configuration changes, changed package layout.

## Validation before every release

Always run:

```bash
npm ci
npm run check
npm pack --dry-run
```

Also inspect tarball contents and ensure it includes only intended files.

After publishing, verify:

```bash
curl -fsSL https://registry.npmjs.org/<package-name>/latest | jq '{name, version, description}'
```

## npm score / package health checklist

- Complete `description`, `keywords`, `repository`, `bugs`, `homepage`, `license`, `author`.
- Include `README.md`, `CHANGELOG.md`, `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`.
- Add tests and CI.
- Commit `package-lock.json` for reproducible CI installs.
- Use a restrictive `files` field.
- Keep package small and dependency-light.
- Avoid unnecessary install scripts and native dependencies.
- Use `npm publish --provenance` through trusted publishing.
- Keep releases regular and SemVer-correct.
- Do not publish throwaway versions just to refresh search unless there is a real package change.

## Useful monitoring APIs

Registry metadata:

```txt
https://registry.npmjs.org/<package-name>
https://registry.npmjs.org/<package-name>/latest
```

npm search:

```txt
https://registry.npmjs.org/-/v1/search?text=<package-name>&size=10
https://registry.npmjs.org/-/v1/search?text=maintainer:<npm-user>&size=10
```

Downloads:

```txt
https://api.npmjs.org/downloads/point/last-month/<package-name>
https://api.npmjs.org/downloads/range/last-month/<package-name>
```

Security/package health dashboards:

```txt
https://socket.dev/npm/package/<package-name>
https://pkpulse.com/package/npm/<package-name>
```

For machine-readable vulnerability data, prefer official APIs such as OSV.dev or npm audit. Scraping dashboards is brittle and may violate service terms.

## AI agent operating checklist for future projects

When asked to prepare/release a pi extension package:

1. Read pi docs for packages and extensions.
2. Inspect repo status and existing package metadata.
3. Add/verify package manifest with `pi.extensions`.
4. Add/verify README, changelog, contributing, security, license.
5. Add CI and publish workflows using Node.js 24 and `actions/*@v5`.
6. Add `.gitignore`, `tsconfig.json`, and `package-lock.json`.
7. Run `npm ci`, `npm run check`, `npm pack --dry-run`.
8. Commit coherent changes frequently.
9. Push `main` and version tag.
10. Confirm npm latest after trusted publishing completes.
