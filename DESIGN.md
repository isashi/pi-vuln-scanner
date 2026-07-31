# pi-vuln-scanner design notes

## Product scope

The extension scans **only pi packages installed locally** and reports security/supply-chain risk to the end user.

Out of scope for the first versions:

- scanning the whole pi.dev public package catalog;
- opening issues/PRs for package maintainers;
- enforcing/blocking risky packages by default.

## Primary user experience

Default behavior:

- scan on pi startup (`scanOnStartup: true`);
- use a cache/TTL to avoid slow scans at every launch;
- show a clear startup warning if installed packages have critical/high risk;
- expose slash commands for full reports and configuration.

Suggested commands:

```txt
/pi-scan              run scan now
/pi-scan-report       show latest report
/pi-scan-config       edit scanner settings
/pi-scan-clear-cache  clear cached scan results
```

Reports should make the risky packages obvious and include an immediate removal command.

Example:

```txt
CRITICAL  @example/bad-pi-extension  global npm  1.2.3
  Vulnerabilities: 2 critical, 1 high
  Signals: postinstall script, native dependency
  Remove: pi remove npm:@example/bad-pi-extension
```

## Package inventory

Scan global and project-local pi package configuration:

- `~/.pi/agent/settings.json`
- `.pi/settings.json`
- npm packages installed under `~/.pi/agent/npm/` and `.pi/npm/`
- git packages installed under `~/.pi/agent/git/` and `.pi/git/`
- local path packages referenced by settings

For each package, collect:

- pi package source string, when available (`npm:...`, `git:...`, local path);
- scope: global or project;
- package root path;
- `package.json` metadata;
- package lockfile, when present;
- package manager evidence (`package-lock.json`, `npm-shrinkwrap.json`);
- extension/skill/theme/prompt manifest entries under `pi`.

## Scanners

### MVP scanners

1. **npm audit**
   - Run locally where a valid npm lockfile exists.
   - Good for dependency-tree vulnerabilities.
   - No external API key.

2. **OSV.dev**
   - Query package coordinates (`npm` ecosystem, name, version).
   - Free and machine-readable.
   - Useful for direct package vulnerabilities and enrichment.

### Optional/future scanners

3. **Socket.dev**
   - Useful for supply-chain signals.
   - Do not rely on scraping public HTML pages for the core product.
   - If Socket offers unauthenticated stable endpoints they can be added; otherwise support it only as an optional provider with user opt-in/API token.

4. **npm registry metadata**
   - Downloads, repository URL, deprecated flag, maintainers, publish time.
   - Useful for maintenance/risk context, not vulnerability authority.

5. **GitHub metadata**
   - Stars, archived status, last push, issues.
   - Optional and rate-limited; should never be required for baseline scan.

## Risk model

Keep findings factual. Avoid subjective labels such as “vibecoded”.

Suggested buckets:

### Vulnerabilities

- critical/high/medium/low count;
- advisory ID/link;
- direct vs transitive dependency;
- fixed version available;
- scanner source (`npm audit`, `OSV`).

### Supply-chain signals

- lifecycle scripts (`preinstall`, `install`, `postinstall`, `prepare`);
- native build signals (`node-gyp`, `binding.gyp`, `.node` files, `node-pre-gyp`);
- package deprecated;
- very new package/version;
- unusually large dependency tree;
- lockfile missing.

### pi-specific package quality

- invalid/missing `pi` manifest;
- extension entry file missing;
- runtime dependencies incorrectly placed in `devDependencies`;
- unnecessary install scripts;
- missing repository/license/security metadata.

## Configuration

Suggested default config:

```json
{
  "scanOnStartup": true,
  "scanIntervalHours": 24,
  "providers": {
    "npmAudit": true,
    "osv": true,
    "socket": false
  },
  "thresholds": {
    "startupWarning": "high",
    "showRemoveCommand": "high"
  },
  "privacy": {
    "allowNetwork": true,
    "sendNpmPackageNames": true,
    "sendLocalPackagePaths": false
  }
}
```

## Privacy rules

- Do not send local source code to third-party services.
- Do not send local filesystem paths unless the user explicitly opts in.
- OSV/npm queries should use package names and versions only.
- Make network usage visible in README and `/pi-scan-config`.
- All network providers should have timeouts and graceful fallback.

## Pre-install scanning

pi package installation usually happens outside an already-running pi session, so the extension cannot reliably intercept every `pi install` command.

Possible future improvements:

- provide a wrapper command outside pi, for example `pi-vuln-scan install npm:pkg`, that scans a temporary resolved package before delegating to `pi install`;
- add an in-pi helper command, for example `/pi-scan-package npm:pkg`, to inspect a package before the user installs it manually;
- for project-local `.pi/settings.json`, a global scanner extension may warn during project trust/startup before the user continues, but this should remain advisory.

## Initial architecture

```txt
src/
  index.ts              extension entry point
  commands.ts           slash commands
  config.ts             config load/save/defaults
  inventory.ts          local pi package discovery
  scanners/
    npm-audit.ts
    osv.ts
    package-metadata.ts
  risk.ts               normalize findings and compute severity
  report.ts             text/markdown report rendering
  storage.ts            local cache
  types.ts              shared types
```

## MVP acceptance criteria

- `/pi-scan` discovers global and project-local installed pi packages.
- Scan runs automatically on startup by default, with TTL cache.
- npm packages with lockfiles are scanned with `npm audit`.
- npm package coordinates are checked against OSV.dev.
- Report groups packages by worst severity.
- Report includes exact removal command for each package source when known.
- Extension has no install scripts, no native deps, CI, typecheck, tests, and clean npm audit.
