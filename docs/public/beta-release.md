Providence's first native Godot/Rust beta replaces the React/Tauri editor.
The final web release remains available as v0.5.9 and on `legacy/tauri`.

- Native Land and Dungeon editing, smart terrain, directional Magic Brush,
  special stamps, map overlays and JPEG export.
- Action Points, XAPs, quests, encounters, battles, monsters and difficulty
  variants; library drag and drop and bulk variant generation.
- Items, shops, treasure, spells, races, castes, strings, startup and media tools.
- Actionable validation, retained-source preservation and reviewed repairs.
- Classic folder/StuffIt export and compiled Rebuilt scenario packages.
- Formatted Divinity Manual with the Red Dragon shortcut, and the new splash.

Downloads include the native tools, licensed stock reference resources, music
preview, exact build identities and notices. Windows and Linux builds are x64;
the macOS app is universal for Intel and Apple Silicon and is not notarized.
Extract the complete archive before launching Providence.

Native source is GPL-3.0-or-later. Realmz/Divinity resources retain their separate
CC BY-NC-SA 4.0 and original notices. See the repository licensing documents.

This is a beta. Import/export checks do not certify campaign completion or
remove inherited scenario authoring errors. Rebuilt playtest uses a separate
compatible Rebuilt installation.

The release gate passed all 40 scenarios in the reference corpus: fresh import,
Save/reopen, byte-exact no-edit Classic export and validation of actual Rebuilt
archives. Rebuilt checks used an explicit application-rules audit profile;
they do not establish the intended custom-rule selection for each campaign.
The source-bound results are in `docs/public/compatibility-audit.json`.
