# Published v0.6.0-beta.4 release notes

These notes describe the published beta.4 assets. The current development tree
includes later closeout work: imported scenarios publish as schema v7, and newly
authored scenarios and application libraries as schema v6. Those changes have not yet replaced the downloadable
beta assets. The [authoring manual](authoring-manual.md) describes the current
development editor; the historical release changes below remain attributable
to the published build.

Providence v0.6.0-beta.4 updates the native Godot/Rust scenario editor.
The final web release remains available as v0.5.9 and on `legacy/tauri`.

Changes since beta.3:

- Preserve exact signed Classic tile words in schema-v6 imported scenario
  packages, including AP markers and hidden/revealed secret encodings. Existing
  schemas remain readable; newly authored scenarios retain schema v3.
- Edit tile entry markers explicitly in the Action Point editor, with one
  Apply/Undo transaction alongside chance and step edits. Land secrets lead
  to the existing map-cell controls; dungeon direction/secret bits are preserved.
- Filter AP catalogs and map markers independently by chance, marker presence,
  native precedence and detected program checks. Keep dormant and unmarked
  records, counts and reset controls visible without a persisted active flag.
- Show applied activation context in map sidebars and View Flow while retaining
  ordered instruction authoring and exact owning-field navigation.
- Open APs, Player Maps, Random Rectangles and View Flow in separate native
  windows, preserving drafts, map context and navigation guards.
- Improve connected Smart Terrain previews, tolerance-driven widening, counts
  and stable control sizing. Preserve complete source-owned scenario catalogs.

Included native workflows:

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

The full reference-corpus gate and exact release identities are recorded in
`compatibility-audit.json`, supplied with this release. Rebuilt checks use an
explicit application-rules audit profile; they do not establish the intended
custom-rule selection or campaign completion for each scenario.
