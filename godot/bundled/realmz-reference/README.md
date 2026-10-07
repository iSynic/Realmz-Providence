# Bundled Realmz Reference Data

Providence vNext includes this read-only Realmz reference set so importing a Classic scenario never requires the user to locate a separate Realmz installation.

- Realmz and its associated data are licensed under CC BY-NC-SA 4.0.
- Realmz copyright 1994 by Tim Phillips.
- The complete license text is in `LICENSE-REALMZ.txt`.
- `manifest.json` pins the source and donor commits, byte lengths, and SHA-256 hashes.
- These files provide stock rules, names, items, spells, landlook metadata, and application media. They are never copied into project-authored truth or emitted as scenario-owned content.
- Scenario-owned resources continue to shadow stock resources by exact Classic resource key.

The Windows bundle carries one adjacent raw reference directory and one derived content-addressed application-media library. The latter is rebuildable from the three licensed resource containers in this directory.
