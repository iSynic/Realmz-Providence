# Realmz Providence

Providence is a modern scenario editor for Realmz. The current release is 0.2.0.

It is trying to do two things at once:

- make Realmz scenario authoring feel usable on a modern machine
- preserve old scenario data carefully enough that import/export does not quietly damage anything

That second part matters. Realmz scenarios contain a lot of classic Mac-era binary data, resource forks, packed records, and runtime quirks. Providence treats the original files as evidence, keeps unknown data visible or preserved, and only writes the parts we understand well enough to edit safely.

The app is built with React/Vite on the frontend and Tauri/Rust on the desktop side.

## 0.2.0 Highlights

The 0.2.0 release is a large authoring pass. It adds a real in-app authoring manual, broadens the safe editing surfaces, and makes import/export behavior easier to understand before a scenario leaves Providence.

- The new **Providence Authoring Manual** replaces the older source-first document set with 13 author-facing chapters and appendices for compatibility, Divinity references, libraries, technical evidence, coverage, and troubleshooting.
- **Player Maps** are now an authoring surface, including classic-scale previews, marker editing, and better coordination with the main map tools.
- **Maps** gained custom landlook authoring, clearer stamp/palette behavior, denser sidebar organization, and safer Action Point synchronization when map records move.
- **Action Points and scripts** received a substantial authoring cleanup: better opcode naming, paired chooser aliases, draft-change guards, visible-result warnings, contextual command links, and more direct controls for target and item fields.
- **Strings and styled text** now support imported TEXT and styl resources, directly editable scrolling text previews, Classic TextEdit-style alignment previews, and preserved routing between text workflows and assets.
- **Combat, monsters, and economy** gained stronger authoring flows, including a reusable Providence monster library, monster set editing, battle grid performance work, treasure reward icons, and improved shop/item presentation.
- **Assets** are now split into Scenario Assets, a workspace-scoped Custom Library, Reference Assets, and lower-priority technical inventory views. Scenario asset imports cover images, icons, sounds, text, styled text, and raw resources, with safer scenario ID allocation and stock-asset guards when copying from libraries.
- **Browser and export workflows** now support project persistence, browser raw-source packages, browser scenario package export, battle and monster scenario writers, clearer export readiness panels, and more precise source-preservation diagnostics.
- Validation and smoke tooling was expanded around desktop asset performance, primary editor workflows, map painting, text assets, package export, Action Point coverage, and release gates.

## Screenshots

Providence is built around direct scenario authoring: open a map, inspect the original records, edit the parts that are understood, and keep the rest preserved.

![Providence map editor](docs/screenshots/map-editor.png)

The editor also includes focused tools for combat, economy, strings, encounters, rules, scenario metadata, and assets.

![Providence combat editor](docs/screenshots/combat-editor.png)

Scenario resources can be inspected and previewed, including custom pictures, icons, sounds, text resources, and other classic Realmz resource-fork data.

![Providence scenario assets](docs/screenshots/scenario-assets.png)

## Getting Started

Launch the desktop app, then click **New** to create a Providence project. A project is where Providence keeps the imported scenario files, decoded records, generated previews, and editor metadata.

After creating a project, import a Realmz scenario folder if you already have one. Pick the folder that contains the scenario data files and resource files, and Providence will seed the project from those originals.

You can also start from scratch in a new project. Use the Maps, Player Maps, Action Points, Strings, Scenario, Encounters, Combat, Economy, Rules, and Assets tools to build up the scenario piece by piece. When you are ready, use Export to write a conservative Realmz/Revisited-style scenario package.

The Documents button opens the Providence Authoring Manual. It is written around authoring tasks first, with the Divinity manual and local evidence available as supporting references when you need to understand legacy behavior.

## What Works

Providence can currently:

- create and open `.providence` project packages
- import Realmz scenario folders
- browse and edit maps and Player Maps
- paint land/dungeon tiles and special land/icon-backed tiles
- author custom landlooks and reusable map stamps
- edit Action Points and reusable action data
- edit scenario strings, option labels, TEXT resources, and styled scrolling text
- inspect and edit encounters, battles, monsters, economy records, rules, and scenario metadata
- build combat encounters with battle, monster, monster-art, and treasure-library workflows
- import, preview, preserve, replace, and deep-link scenario assets
- keep reusable non-stock assets in the workspace Custom Library until they should become scenario-bundled assets
- use Reference Assets for useful stock/classic material without making provenance the primary authoring model
- package projects and scenarios from the browser workflow when the host browser supports the required file APIs
- preserve data that is not safely authorable yet
- export conservative Realmz/Revisited-style scenario packages

Some surfaces are still more editor than others. A few are still closer to decoded/inspectable records than comfortable authoring tools. That is expected for now, and unsupported source files are preserved unless Providence has a proven writer for that data.

## Desktop Vs Browser

There are two ways to run Providence during development.

The **desktop app** is the real target. It uses Tauri commands for filesystem access, project storage, import/export, bundled libraries, and native packaging.

The **browser version** is useful for quick development and Browser FS experiments. It can import through the browser File System Access API where supported, but it is not the primary shipping workflow.

Heavy semantic mapping is intentionally not part of the normal map/string startup path. The editor should load the scenario first, then build richer links only when an advanced or link-heavy tool actually needs them.

## Setup

Install dependencies:

```powershell
npm install
```

Run the web dev server:

```powershell
npm run dev
```

Run the desktop app:

```powershell
npm run desktop
```

Build the frontend:

```powershell
npm run build
```

Build the desktop app:

```powershell
npm run dist
```

Run the Windows-focused release gate:

```powershell
npm run release:desktop-gate:windows
```

## Checks

Useful checks while working:

```powershell
npm run typecheck
npm run test:rust
npm run check
```

`npm run check` is the broad pass: TypeScript, Action Point coverage, frontend build, and Rust tests. The release gate scripts add packaging-oriented checks and optional editor smokes.

There are also smoke and archaeology scripts under `scripts/`. Many of those assume the local Realmz/Providence development environment and are mostly for deeper validation work.

## Where Projects Live

The desktop app stores its own app data under the platform app-data directory. On Windows, that is usually somewhere like:

```text
%LOCALAPPDATA%\local.realmz.providence\
```

Projects normally live under `projects/` inside that app-data folder, unless you open a project package from somewhere else.

A `.providence` project is a folder. It contains `project.json`, preserved raw sources, generated assets, scenario-bundled assets, and editor metadata. The workspace Custom Library is separate from an individual scenario so useful Providence-created assets can be reused across scenarios. Derived semantic/archaeology data is not the source of truth and should not be treated like project content.

## Development Notes

A few principles have saved pain:

- The scenario files and parsed records are the source of truth.
- Derived archaeology should stay derived.
- Normal authoring tools should open quickly.
- Big link graphs should be lazy or tool-specific.
- Large lists should be capped, indexed, or virtualized instead of rendered all at once.
- Unknown bytes should be preserved unless we have evidence that they are safe to write.

When searching the repo, `rg` is your friend.

## Archaeology

Providence includes scripts for byte coverage, round-trip checks, resource coverage, and target compatibility. Examples:

```powershell
npm run archaeology:roundtrip-audit
npm run archaeology:byte-coverage
npm run archaeology:resource-coverage
npm run archaeology:target-compatibility
```

Generated reports live in `docs/generated/`.

The goal of archaeology work is not trivia. It should unlock authoring, validation, export safety, or a clearer explanation for the user.

## Repo Layout

```text
src/                 React/Vite frontend
src/editor/          Editor panels, workbench shell, browser-mode importers
src-tauri/           Tauri desktop backend and Rust scenario parsers
scripts/             Smoke tests, archaeology generators, release helpers
docs/                Project notes and generated evidence
public/              Static browser assets
```

## Status

Providence is pre-1.0. It is already useful, but it is still an active archaeology and editor-design project.

The safest mental model is: edit what Providence clearly supports, preserve everything else, and let export stay conservative.
