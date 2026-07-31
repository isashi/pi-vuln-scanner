# pi-vuln-scanner

A pi extension that scans locally installed pi packages for vulnerabilities and supply-chain risk.

## Status

Early MVP. The scanner is advisory only: it warns and reports, but does not block pi package loading.

## Install

```bash
pi install npm:pi-vuln-scanner
```

Local development/testing:

```bash
pi -e ./src/index.ts
```

## Commands

```txt
/pi-scan              run a scan now
/pi-scan --cached     show cached result if still fresh
/pi-scan-report       show latest cached report
/pi-scan-config       show config and cache paths
/pi-scan-config init  write default config file
/pi-scan-clear-cache  clear cached scan result
```

## What is scanned

Only locally installed pi packages are scanned:

- global packages from `~/.pi/agent/settings.json`, `~/.pi/agent/npm/`, `~/.pi/agent/git/`;
- project packages from `.pi/settings.json`, `.pi/npm/`, `.pi/git/` when the project is trusted;
- local path packages referenced from pi settings.

## Data sources

- `npm audit --json --omit=dev` when an npm lockfile is available.
- OSV.dev for npm package name/version lookups, including transitive dependency checks from npm lockfiles.
- deps.dev package version metadata and advisory keys.
- npm registry metadata for deprecation, publish age, and package metadata signals.
- Optional Sonatype OSS Index checks when credentials are configured.
- Local package metadata checks for lifecycle scripts, native-code indicators, missing pi manifest/resources, and basic package quality signals.

## Configuration

Default config path:

```txt
~/.pi/agent/pi-vuln-scanner.json
```

Default config:

```json
{
  "scanOnStartup": true,
  "scanIntervalHours": 24,
  "providers": {
    "npmAudit": true,
    "osv": true,
    "osvTransitive": true,
    "depsDev": true,
    "ossIndex": false,
    "npmRegistry": true,
    "packageMetadata": true
  },
  "thresholds": {
    "startupWarning": "high",
    "showRemoveCommand": "high"
  },
  "privacy": {
    "allowNetwork": true,
    "sendNpmPackageNames": true,
    "sendLocalPackagePaths": false
  },
  "ossIndex": {
    "usernameEnv": "OSS_INDEX_USERNAME",
    "tokenEnv": "OSS_INDEX_TOKEN"
  }
}
```

## Privacy

The extension does not send local source code to third-party services. Network scanners send npm package names and versions only when network access and npm package-name sharing are enabled.

## Removal commands

Reports include removal hints when the original pi package source is known, for example:

```bash
pi remove npm:@scope/package
```

## Development

```bash
npm install
npm run check
npm pack --dry-run
```
