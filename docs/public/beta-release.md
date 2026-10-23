# v0.6.0-beta.5 release notes

Providence v0.6.0-beta.5 updates the native Godot/Rust scenario editor.
The final web release remains available as v0.5.9 and on `legacy/tauri`.

Changes since beta.4:

- Start faster: workbench pages are built the first time you open them, so the
  packaged editor opens in about 1.9 seconds instead of 4.6.
- Interface scaling follows your display automatically, or keeps a size you
  choose.
- Read the offline Help that now ships with the editor.
- Let MCP clients author in your open project through a shared native session,
  attach to a project folder you grant them, and generate terrain.
- Special Land fills in missing collision data from the reviewed Data Solids,
  and paint collection actions no longer fail while another operation runs.
- Imported scenarios publish as schema v7 packages that keep every complete
  native record, including dormant and unplaced ones. Newly authored scenarios
  and application libraries publish as schema v6.
- Readiness reports item slots in shops and treasures that no program opens or
  awards as one summary per file; shops and treasures a program does use still
  list every broken slot.
- Saving after an edit keeps everything that edit changed. A few edits (creating
  a monster, editing its description, generating variants, repairing battle
  monster references, updating a map cell and adding a quest label) could
  previously leave related changes out of the save.
- A rejected command is rolled back, a change the native host never confirmed
  is reported as outcome-unknown, and a host that fails mid-request stops
  without saving so you reopen from your last save.
- Fixed a stray library folder created by empty launch arguments, and text that
  had been garbled as Windows-1252.
- In an imported scenario you can add the first record of a kind the original
  scenario had no file for, such as its first player map or XAP. Export builds
  that file the same way Classic export does and says so in the result.

Included native workflows:

- Native Land and Dungeon editing, smart terrain, directional Magic Brush,
  special stamps, map overlays and JPEG export.
- Action Points, XAPs, quests, encounters, battles, monsters and difficulty
  variants; library drag and drop and bulk variant generation.
- Items, shops, treasure, spells, races, castes, strings, startup and media tools.
- Actionable validation, retained-source preservation and reviewed repairs.
- Classic folder/StuffIt export and compiled Rebuilt scenario packages.
- Formatted Divinity Manual with the Red Dragon shortcut, and offline Help.

Downloads include the native tools, licensed stock reference resources, music
preview, exact build identities and notices. Windows and Linux builds are x64;
the macOS app is universal for Intel and Apple Silicon and is not notarized.
Extract the complete archive before launching Providence. On macOS 15 and later,
open Providence once, then approve it in **System Settings > Privacy & Security**
with **Open Anyway**; Control-click **Open** no longer bypasses Gatekeeper.

Native source is GPL-3.0-or-later. Realmz/Divinity resources retain their separate
CC BY-NC-SA 4.0 and original notices. `SOURCE-LICENSE.md` in each download
explains how to share it.

This is a beta. Import/export checks do not certify campaign completion or
remove inherited scenario authoring errors. Rebuilt playtest uses a separate
compatible Rebuilt installation.

All 40 scenarios in the reference corpus passed the release gate: fresh import,
save and reopen, byte-exact no-edit Classic export, and a validated Rebuilt
archive. The results and exact build identities are in
`docs/public/compatibility-audit.json`. Rebuilt checks use an explicit
application-rules audit profile; they do not establish the intended custom-rule
selection or campaign completion for each scenario.
