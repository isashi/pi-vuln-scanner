# Changelog

All notable changes to this project are documented here.

## 0.2.1 - 2026-07-31

- Downgrade "new npm package" from LOW to INFO.
- Suppress deps.dev 404 responses for newly published packages that are not indexed yet.

## 0.2.0 - 2026-07-31

- Add configurable deps.dev provider.
- Add OSV transitive dependency checks using npm lockfile data.
- Add configurable npm registry metadata provider.
- Add optional Sonatype OSS Index provider using environment credentials.
- Remove report notes section.

## 0.1.2 - 2026-07-31

- Show the full scan report by default instead of only the collapsed summary.
- Treat info-only scan results as informational notifications, not warnings.
- Include risk signal counts in the summary line.

## 0.1.1 - 2026-07-31

- Add GitHub Pages `.nojekyll` marker.
- Prepare Trusted Publishing release flow after initial manual npm publication.

## 0.1.0 - 2026-07-31

- Initial MVP extension skeleton.
- Local pi package inventory.
- Startup scan with TTL cache.
- `/pi-scan`, `/pi-scan-report`, `/pi-scan-config`, and `/pi-scan-clear-cache` commands.
- OSV.dev, npm audit, and package metadata scanners.
