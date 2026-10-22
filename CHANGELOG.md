# Changelog

Notable changes to Providence. Each release on the
[Releases](https://github.com/iSynic/Realmz-Providence/releases) page has the
full notes and downloads.

## Unreleased

- Workbench pages are built the first time you open them, so the packaged
  editor starts in about 1.9 seconds instead of 4.6.
- Interface scaling follows your display automatically, or a size you choose
  and keep.
- Offline Help ships with the editor.
- MCP clients can author in your open project through a shared native session,
  attach to a project folder you grant them, and generate terrain.
- Special Land fills in missing collision data from the reviewed Data Solids,
  and paint collection actions no longer fail while another operation runs.
- Imported scenarios publish as schema v7 packages that keep complete native
  records; newly authored scenarios stay on schema v6.
- A rejected command is rolled back, and a change the native host never
  confirmed is reported as outcome-unknown instead of being assumed saved. If
  the host fails mid-request it stops without saving, and you reopen from your
  last save.
- Saving after an edit now keeps everything that edit changed. Before, a few
  edits (creating a monster, editing its description, generating variants,
  repairing battle monster references, updating a map cell and adding a quest
  label) could leave related changes out of the save until the next different
  kind of edit was saved.
- Fixed a stray library folder created by empty launch arguments, and text that
  had been garbled as Windows-1252.

## 0.6.0-beta.4 (2026-10-14)

- Imported scenario packages keep exact Classic tile words, including Action
  Point markers and secret encodings.
- Edit tile entry markers in the Action Point editor, in the same Apply/Undo
  step as chance and step edits.
- Filter Action Point catalogs and map markers by chance, marker presence,
  precedence and program checks.
- See applied activation context in map sidebars and View Flow.
- Open Action Points, Player Maps, Random Rectangles and View Flow in their own
  windows, keeping drafts and map context.
- Smoother Smart Terrain previews and widening.

## 0.6.0-beta.3 (2026-10-11)

- Open projects and import scenarios faster, with progress and safe
  cancellation; the current project stays open until its replacement is ready.
- Less work on unchanged saves, and artwork loads progressively.
- A centered, scaling Battle placement canvas and a resizable Scenario Monsters
  palette.
- Export Scenario, My Library and Stock assets one at a time or in bulk, as PNG,
  WAV, UTF-8 text or original MOD.
- Filter Action Points by the current map.

## 0.6.0-beta.2 (2026-10-09)

- Browse complete catalogs in Battles, Spells, Items, Action Points and XAPs.
- Fixed missed clicks when switching action steps.
- Economy tabs and the Inspector stay in step with the selected section.
- Explore script links in View Flow, with step summaries and navigation.
- Classic Quests terminology throughout.

## 0.6.0-beta.1 (2026-10-07)

The first native Godot/Rust beta, replacing the React/Tauri editor. The last web
release remains available as v0.5.9 and on the `legacy/tauri` branch.

- Land and Dungeon editing, smart terrain, the directional Magic Brush, special
  stamps, map overlays and JPEG export.
- Action Points, XAPs, quests, encounters, battles, monsters and difficulty
  variants, with library drag and drop and bulk variant generation.
- Items, shops, treasure, spells, races, castes, strings, startup and media.
- Actionable validation, preserved source data and reviewed repairs.
- Classic folder and StuffIt export, and compiled Rebuilt scenario packages.
- The formatted Divinity Manual.
