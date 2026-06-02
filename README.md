# Realmz Providence

Providence is a modern scenario editor for Realmz.

It is trying to do two things at once:

- make Realmz scenario authoring feel usable on a modern machine
- preserve old scenario data carefully enough that import/export does not quietly damage anything

That second part matters. Realmz scenarios contain a lot of classic Mac-era binary data, resource forks, packed records, and runtime quirks. Providence treats the original files as evidence, keeps unknown data visible or preserved, and only writes the parts we understand well enough to edit safely.

The app is built with React/Vite on the frontend and Tauri/Rust on the desktop side.

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

You can also start from scratch in a new project. Use the Maps, Action Points, Strings, Scenario, Encounters, Combat, Economy, Rules, and Assets tools to build up the scenario piece by piece. When you are ready, use Export to write a conservative Realmz/Revisited-style scenario package.

## What Works

Providence can currently:

- create and open `.providence` project packages
- import Realmz scenario folders
- browse and edit maps
- paint land/dungeon tiles and special land/icon-backed tiles
- edit Action Points and reusable action data
- edit scenario strings and option labels
- inspect and edit encounters, battles, monsters, economy records, rules, and scenario metadata
- preview/import many scenario assets
- preserve data that is not safely authorable yet
- export conservative Realmz/Revisited-style scenario packages

Some surfaces are still more “editor” than others. A few are still closer to decoded/inspectable records than comfortable authoring tools. That is expected for now.

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

## Checks

Useful checks while working:

```powershell
npm run typecheck
npm run test:rust
npm run check
```

`npm run check` is the broad pass: TypeScript, Action Point coverage, frontend build, and Rust tests.

There are also smoke and archaeology scripts under `scripts/`. Many of those assume the local Realmz/Providence development environment and are mostly for deeper validation work.

## Where Projects Live

The desktop app stores its own app data under the platform app-data directory. On Windows, that is usually somewhere like:

```text
%LOCALAPPDATA%\local.realmz.providence\
```

Projects normally live under `projects/` inside that app-data folder, unless you open a project package from somewhere else.

A `.providence` project is a folder. It contains `project.json`, preserved raw sources, generated assets, and editor metadata. Derived semantic/archaeology data is not the source of truth and should not be treated like project content.

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
