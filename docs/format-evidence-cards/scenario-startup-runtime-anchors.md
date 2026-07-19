# Runtime Note: Scenario Startup And Blank Scenario Anchors

## User-Facing Unlock

This note turns the Scenario tool from an inspect-only shell into a practical blank-scenario target: Providence can parse and eventually write the files Realmz checks before first play, expose startup level/party restrictions/contact data, and validate that a new scenario is loadable before export.

## Source-Backed Runtime Split

Realmz startup uses three different kinds of scenario data:

- **Selection shell**: `selectscenario` requires a scenario folder, a marker/main file named exactly like the scenario, and a `Scenario` resource file under that folder.
- **Startup control file**: the marker/main file stores party level restrictions, initial map/view coordinates, two 20-byte registration/security code segments, and a 256-byte creator/user string.
- **Authored source files copied into runtime caches**: `setupnewgame` builds runtime `Data Files` caches from authored scenario files; these caches should not be treated as Providence export sources.
- **Metadata/contact file**: `Data CI` stores user-visible scenario/contact/payment/release text. It is optional in the local corpus but fixed-size when present.
- **Party restriction file**: `Data RI` stores optional party-count, level, race, and caste restrictions used during party selection.
- **Optional custom support files**: `Data Solids` is loaded or created if absent; `Data Spell` is optional and opens its own resource fork when present.
- **Resource fork metadata**: `RLMZ`, `STR#`, `vers`, `PICT`, `cicn`, `snd `, `TEXT`, and `styl` remain resource-authoring evidence. The blank-scenario writer still needs fixture proof for minimum resource defaults.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\misc.c:2621` | `selectscenario` builds `:Scenarios:<ScenarioName>:<ScenarioName>` and `:Scenarios:<ScenarioName>:Scenario`, requiring the marker/main file before opening the resource file. |
| `F:\Realmz\src\realmz_orig\misc.c:2687` | `CountResources('RLMZ') - 1` is consulted after the `Scenario` resource file is opened. |
| `F:\Realmz\src\realmz_orig\misc.c:2718` | `selectscenario` reads `codeseg1` and `codeseg2` from the marker/main file at offset `5 * sizeof(reclevel)`. |
| `F:\Realmz\src\realmz_orig\misc.c:2529` | `usercheck2` reads a `Str255` scenario creator/user name from offset `5 * sizeof(reclevel) + 40`. |
| `F:\Realmz\src\realmz_orig\misc.c:2726` | `Data Solids` is loaded from the scenario folder or created as 1024 zero bytes if missing. |
| `F:\Realmz\src\realmz_orig\misc.c:2753` | `Data Spell` is optional custom spell data and resource evidence. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:76` | `setupnewgame` begins copying authored land source files into runtime `CL` cache data. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:104` | `setupnewgame` copies authored dungeon source files into runtime `CD` cache data. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:140` | `Data TD2` thief/rogue encounter source becomes runtime `CT`. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:152` | `Data TD3` timed encounter source becomes runtime `CTD3`. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:184` | `Data ED2` complex encounter source becomes runtime `CE2`. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:219` | `setupnewgame` reads the first five marker/main fields as 32-bit big-endian values. |
| `F:\Realmz\src\realmz_orig\contactinfo.c:70` | `loadcontact` opens `Data CI` and reads one `contactdata` struct. |
| `F:\Realmz\src\realmz_orig\structs.h:36` | `contactdata` is eighteen `Str255` fields, matching 4608 bytes. |
| `F:\Realmz\src\realmz_orig\structs.h:29` | `restrictinfo` is a 320-byte party restriction record. |
| `F:\Realmz\src\realmz_orig\partyselect.c:207` | Party selection opens optional `Data RI`. |
| `F:\Realmz\src\realmz_orig\partyselect.c:55` | Party selection reads `reclevel` and `maxlevel` before party setup. |
| `F:\Realmz\src\realmz_orig\partyselect.c:156` | Party selection displays `reclevel` as the recommended/required level target and `maxlevel` as an optional maximum. |

## Marker/Main Scenario File Layout

The local corpus marker/main files are 316 or 320 bytes. Runtime reads are source-backed for the first 316 bytes:

| Offset | Size | Field | Confidence | Runtime Meaning |
| ---: | ---: | --- | --- | --- |
| `0` | `4` | `reclevel` | source-backed | Party level target used by party selection difficulty math. |
| `4` | `4` | `maxlevel` | source-backed | Maximum total party level; `999` is displayed as `None` when registration allows it. |
| `8` | `4` | `landlevel` | source-backed | Initial outdoor land level loaded by `setupnewgame`. |
| `12` | `4` | `lookx` | source-backed | Initial map/view X base used by runtime movement/render math. |
| `16` | `4` | `looky` | source-backed | Initial map/view Y base used by runtime movement/render math. |
| `20` | `20` | `codeseg1` | source-backed | Legacy scenario registration/security code segment. |
| `40` | `20` | `codeseg2` | source-backed | Legacy scenario registration/security code segment. |
| `60` | `256` | `creatorUser` | source-backed | Divine/user check `Str255`; empty string allows access. |
| `316` | `0` or `4` | trailing bytes | corpus-backed, unknown | Present in 4 of 28 local scenario files; preserve until Divinity writer evidence explains it. |

`landlevel`, `lookx`, and `looky` should be exposed as startup placement fields, but the editor should label them as Realmz startup/view coordinates until Divinity's exact UI wording is recovered.

## Data CI Layout

`Data CI` is not required for every scenario in the local corpus, but when present it is exactly `4608` bytes:

- `scenarioname`
- `version`
- `date`
- `authorsname`
- `email`
- `web`
- `fee`
- `payinfo[0..4]`
- `titles[0..4]`
- `description`

Each field is a classic `Str255`/Pascal string slot. `contactinfo.c:showcontact` displays most of these fields directly in the contact dialog; `payinfo[4]` is present in the struct and should be preserved even if not yet proven visible in the recovered dialog.

## Data RI Layout

`Data RI` is optional, but when present it is one 320-byte `restrictinfo` record: a `Str255` description, `maxpc`, `maxlevel`, 30 race flags, and 30 caste flags. Runtime behavior proves the flags are bans, not permissions: nonzero `canrace[race - 1]` or `cancaste[caste - 1]` rejects the candidate character.

Detailed party restriction evidence lives in `scenario-party-restrictions-runtime-anchors.md`.

## Setupnewgame Source Files

For first-start cache creation, Providence should distinguish "minimum setup source files" from "all practical authoring source files":

| Source File | Runtime Cache | Startup Role |
| --- | --- | --- |
| `Data DD` + `Data LD` + `Data RD` | `CL` | Outdoor trigger headers, land tile fields, random land metadata, and sight cache. |
| `Data DDD` + `Data DL` + `Data RDD` | `CD` | Dungeon trigger headers, dungeon tile fields, random dungeon metadata. |
| `Data SD` | `CS` | Shop runtime state. |
| `Data TD2` | `CT` | Thief/rogue encounter runtime state. |
| `Data TD3` | `CTD3` | Timed encounter runtime state. |
| `Data ED` | `CE` | Simple encounter runtime state plus four 80-byte text buffers per record. |
| `Data ED2` | `CE2` | Complex encounter runtime state plus nine 40-byte text buffers per record. |

Other files such as `Global`, `Data SD2`, `Data BD`, `Data TD`, `Data MD`, `Data MD2`, item/spell/race/caste data, and resources are still practical scenario construction files, but they are not copied by this specific first-start cache path.

## Local Corpus Evidence

The 28-scenario local output corpus under `F:\Realmz\out_win_clang\Scenarios` shows:

- marker/main file exists: `28/28`
- marker/main file sizes: `316` bytes in `24/28`, `320` bytes in `4/28`
- `Scenario` resource shell exists: `28/28`, observed as `600` bytes in this output tree
- `Data CI` exists: `25/28`, always `4608` bytes when present
- `Data RI` exists: `24/28`, always `320` bytes when present
- setup source files listed above exist: `28/28`

The broader 44-scenario format inventory still records `Scenario`/core files in `44/44` and `Data CI` in `40/44`.

## Providence Follow-Up

- Add a `ScenarioShell` parser/writer for the marker/main scenario file with raw trailing-byte preservation.
- `Data CI` and optional `Data RI` now have complete semantic parsers/writers in both native compilers; fresh/authored output is independent of embedded compatibility bytes.
- The Scenario tool exposes startup, contact/release, and party-restriction fields. Imported singleton identity remains annex-owned until authored.
- Security-code preservation remains a separate marker/main-shell compatibility concern.
- Add blank-scenario export validation for required first-start source files and resource shell availability.
- Keep `RLMZ`/resource-fork defaults preserve-only until Divinity binary/resource fixtures prove minimum writer behavior.

## Validation Rules

- Scenario folder, marker/main file, and display name must agree enough for `selectscenario` path construction.
- Marker/main file must be at least 316 bytes, with writable fields encoded as big-endian 32-bit values plus fixed 20-byte code segments and one `Str255`.
- `reclevel` and `maxlevel` must be non-negative; `maxlevel = 999` should be displayed as no maximum.
- Startup `landlevel` must resolve to an existing outdoor map; `lookx`/`looky` must stay within the 90x90 land coordinate range.
- `Data CI` strings must fit in `Str255` slots after Classic encoding.
- `Data RI` description must fit in a `Str255`; race/caste flag arrays must remain 30 bytes each.
- First-start source files must exist and have internally aligned record counts before Providence claims a blank scenario is Realmz-loadable.
- Runtime cache files (`CL`, `CD`, `CE`, `CE2`, `CS`, `CT`, `CTD3`) should be treated as generated evidence, not authored source exports.

## Divinity Evidence Still Needed

- Scenario Startup Information screen labels/defaults for `reclevel`, `maxlevel`, `landlevel`, `lookx`, and `looky`.
- Registration/Security dialog semantics for `codeseg1` and `codeseg2`.
- Release checklist fields and whether they are pure UI checks or written scenario data.
- Blank/new scenario default file/resource set.
- Meaning of the 4 trailing bytes in the 320-byte marker/main files.
