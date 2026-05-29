# Evidence Card: Dungeon Geometry And Interaction Bits

## User-Facing Unlock

Dungeon maps become authorable as walls, doors, stairs, secret/pass-through cells, hidden/revealed visuals, and interaction markers instead of raw numeric bitfields.

## Realmz Anchors

- `threed.c`: dungeon overhead rendering and secret/pass-through behavior.
- `loadland-loadpixmap.c`: dungeon field loading and cache behavior.
- `struct randlevel`: dungeon random metadata in `Data RDD`.
- `maps-random-and-fields.md`: current top-down dungeon render bit model.
- `buttonchoice.c`: party movement and dungeon interaction constraints.

## Divinity Evidence Needed

- Dungeon Editor controls and tool modes.
- Any wall/door/secret/stair stamp UI and keyboard modifiers.
- Binary evidence for how Divinity mutates `Data DL` and related dungeon metadata.

## Byte Layout Notes

- `Data DL` uses the same 90 x 90 signed-short grid size as land, but values are dungeon bitfields.
- Current render model maps high bits to top-down dungeon sprites and treats secret/pass-through as separate semantics needing fixtures.
- `Data RDD` shares the 644-byte random metadata layout with dungeon-specific meaning. See `random-level-runtime-anchors.md` for the source-backed shared `randlevel` layout and rectangle semantics.
- The first source-backed bit taxonomy is now recorded in `dungeon-runtime-anchors.md`: walls, door orientation bits, stairs, pillars, dungeon notes, Action Point trigger markers, revealed/hidden state, directional secret/pass-through bits, visible arches, and combat-map conversion masks.

## Corpus Evidence

- `Data DL`, `Data DDD`, and `Data RDD` appear in all 44 analyzed scenarios.
- Current docs identify secret/pass-through taxonomy as unresolved and fixture-dependent.

## Providence Follow-Up

- Follow-up: `parser-writer`, `editor-ui`, `validation`.
- Add a dungeon cell semantic model with named bits, raw bit visibility, and preservation.
- Start with named primitives for wall, door orientation, stair, hidden visual, revealed secret marker, visible arch, Action Point trigger marker, dungeon note marker, and directional secret/pass-through.
- Prefer dedicated workflows for Action Point and note markers instead of exposing them only as raw dungeon paint bits.
- Add fixtures for known secret passage, visible door, hidden door, stair, and blocked wall examples.

## Acceptance Evidence

- A user can draw a simple dungeon room/corridor safely without entering raw bit values.
- Providence flags impossible or suspicious bit combinations.
- Exported dungeon cells preserve unrelated bits and render correctly after reopen.
