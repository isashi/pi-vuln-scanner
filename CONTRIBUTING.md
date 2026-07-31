# Contributing

## Local validation

```bash
npm install
npm run check
npm pack --dry-run
```

## Release process

This project should publish to npm through GitHub Actions trusted publishing. Do not publish from a local shell unless explicitly required as an emergency fallback.

Normal release flow:

1. Ensure the npm package has a trusted publisher configured for this repository and `publish.yml`.
2. Run local validation:

   ```bash
   npm ci
   npm run check
   npm pack --dry-run
   ```

3. Bump the version and update `CHANGELOG.md`.
4. Commit release changes.
5. Create and push the matching tag:

   ```bash
   git tag vx.y.z
   git push origin main
   git push origin vx.y.z
   ```

6. The publish workflow should run `npm publish --provenance`.
