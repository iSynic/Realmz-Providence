# Release Checklist

Desktop is the primary Providence platform. The web build is useful for fast UI iteration, but it is not enough to clear a public release.

## Required Gate

Before tagging, pushing a release, or replacing release artifacts, run:

```powershell
npm run release:desktop-gate
```

This gate runs TypeScript checks, Rust library tests, the production web build, the Windows desktop build, the Linux desktop build through WSL, and verifies that all expected desktop artifacts were rebuilt for the current package version.

For quick Windows desktop debugging only, run:

```powershell
npm run release:desktop-gate:windows
```

Do not use the Windows-only gate as the final public release gate.

## Manual Desktop Smoke

After the automated gate passes, install or run the freshly built desktop artifact and check:

- Create a new project and import a scenario folder.
- Open War in the Sword Lands and City of Bywater when available.
- Visit Maps, Strings, Encounters, Combat, Economy, Assets, Linter, and Export.
- In Encounters, open Simple, Complex, Rogue, and Timed tabs.
- In Combat and Economy, confirm art previews render in the desktop build.
- In Assets, open image details and confirm the large preview works.
- In Action Points or any sound picker, confirm scenario sound references resolve and preview where available.

Only publish or replace GitHub release artifacts after the desktop smoke passes.
