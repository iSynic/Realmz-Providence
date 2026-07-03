# Release Checklist

Desktop is the primary Providence platform. The web build is useful for fast UI iteration, but it is not enough to clear a public release.

## Required Gate

Before tagging, pushing a release, or replacing release artifacts, run:

```powershell
npm run release:desktop-gate
```

This gate runs TypeScript checks, Rust library tests, the production web build, the Windows desktop build, the Linux desktop build through WSL, and verifies that all expected desktop artifacts were rebuilt for the current package version.

For the full local desktop acceptance gate, including harnessed Windows editor smokes against the freshly built release exe, run:

```powershell
npm run release:desktop-gate:smoke
```

For quick Windows desktop debugging only, run:

```powershell
npm run release:desktop-gate:windows
```

Do not use the Windows-only gate as the final public release gate.

## Automated Desktop Smokes

The desktop smoke matrix can also be run directly against an existing release exe:

```powershell
npm run smoke:editor
```

It imports Tutorial for primary-tab navigation across Maps, Action Points, Strings, Encounters, Combat, Economy, Assets, Linter, and Export, then runs focused Maps, Action Points, Encounters, and text/resource authoring coverage. It also imports Wrath of the Mind Lords for a larger Assets performance/detail-preview pass. Override paths when needed:

```powershell
npm run smoke:editor -- -SourceScenarioDir "F:\Realmz\base\Realmz\Scenarios\Tutorial" -LargeSourceScenarioDir "F:\Realmz\base\Realmz\Scenarios\Wrath of the Mind Lords"
```

## Manual Desktop Smoke

After the automated gate and desktop smoke matrix pass, install or run the freshly built desktop artifact and check:

- Create a new project and import a scenario folder.
- Open War in the Sword Lands and City of Bywater when available.
- Visit Combat, Economy, Linter, and Export.
- In Combat and Economy, confirm art previews render in the desktop build.
- In Action Points or any sound picker, spot-check scenario sound references beyond the automated Tutorial smoke where available.

Only publish or replace GitHub release artifacts after the desktop smoke passes.
