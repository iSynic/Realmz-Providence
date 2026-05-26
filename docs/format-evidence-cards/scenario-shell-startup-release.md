# Evidence Card: Scenario Shell, Startup, And Release

## User-Facing Unlock

Providence can create a blank Realmz-valid scenario, edit startup identity/location/restrictions, and run a release checklist without copying Tutorial as a template.

## Realmz Anchors

- `setupnewgame.c`: scenario startup and cache initialization.
- `save-direction-order.c`: save/load state fields that identify scenario and party location.
- `ResourceManager.cpp`: scenario resource lookup and Realmz-standard folder/resource expectations.
- `contactinfo.c:loadcontact`: `Data CI` scenario/contact strings.
- `partyselect.c`: `Data RI` party restrictions and marker/main level gates.
- `resource-fork-taxonomy.md`: `RLMZ`, `STR#`, `vers`, map names, and metadata evidence.
- `scenario-startup-runtime-anchors.md`: source-backed marker/main file layout, `Data CI`, first-start source files, and blank scenario validation anchors.
- `scenario-party-restrictions-runtime-anchors.md`: source-backed `Data RI` party restrictions.

## Divinity Evidence Needed

- Scenario Startup Information screen.
- Scenario Security / Registration Codes dialogs.
- Release Checklist behavior.
- Blank/new scenario defaults and required files.
- Ghidra notes for field defaults, range limits, and save routines.

## Byte Layout Notes

- Marker/main scenario file starts with five big-endian 32-bit values: `reclevel`, `maxlevel`, `landlevel`, `lookx`, and `looky`.
- Marker/main scenario file then stores two 20-byte registration/security code segments and one `Str255` creator/user string.
- Local corpus marker/main files are 316 or 320 bytes; the 4-byte tail in 320-byte files is preserve-only until Divinity writer evidence explains it.
- `Data CI` is eighteen `Str255` slots, fixed at 4608 bytes when present.
- `Data RI` is one 320-byte restriction record when present: one `Str255` description, `maxpc`, `maxlevel`, 30 banned-race flags, and 30 banned-caste flags.
- First-start authored files copied by `setupnewgame`: `Data DD`, `Data LD`, `Data RD`, `Data DDD`, `Data DL`, `Data RDD`, `Data SD`, `Data TD2`, `Data TD3`, `Data ED`, and `Data ED2`.
- Separate authored source files from generated runtime caches: `CL`, `CD`, `CE`, `CE2`, `CS`, `CT`, `CTD3`.
- Preserve unknown `RLMZ` and resource metadata until field taxonomy is proven.

## Corpus Evidence

- `Scenario`, `Global`, and core data files appear in all 44 analyzed scenarios.
- `Data CI` appears in 40 of 44 scenarios.
- Local output corpus `Data RI` appears in 24 of 28 scenarios and is always 320 bytes.
- Local output corpus marker/main files exist in 28 of 28 scenarios; 24 are 316 bytes and 4 are 320 bytes.
- Local output corpus `Data CI` appears in 25 of 28 scenarios and is always 4608 bytes.
- Scenario resource forks include `RLMZ`, `STR#`, `PICT`, `cicn`, `snd `, `TEXT`, `styl`, and `vers` resources.

## Providence Follow-Up

- Follow-up: `parser-writer`, `editor-ui`, `validation`.
- Add a Scenario Shell editor for identity, startup, contact info, restrictions, and release readiness.
- Show parsed `Data RI` restrictions in the Scenario tool before enabling writes.
- Add writer fixtures for the marker/main file, `Data CI`, minimum first-start source files, and Realmz-loadable default resource fork.
- Keep `RLMZ` and resource-fork defaults preserve-only until fixture-backed writer behavior is proven.

## Acceptance Evidence

- A new Providence-created scenario exports without borrowing Tutorial files.
- Realmz can import/select the exported scenario using existing loading rules.
- Unknown resource metadata is preserved and diagnostically visible.
