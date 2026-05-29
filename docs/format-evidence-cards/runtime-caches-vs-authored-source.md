# Evidence Card: Runtime Caches Versus Authored Source

## User-Facing Unlock

Providence can explain and validate runtime state without offering unsafe edits to generated cache files. This keeps scenario authoring focused on files Realmz actually treats as source.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:76` | `Data DD` is copied into the outdoor Action Point runtime cache. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:79` | `Data LD` is copied into outdoor map runtime data. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:82` | `Data RD` is copied into outdoor random-level runtime data. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:104` | `Data DDD` is copied into dungeon Action Point runtime cache. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:107` | `Data DL` is copied into dungeon map runtime data. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:110` | `Data RDD` is copied into dungeon random-level runtime data. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:128` | `Data SD` shop source is copied into runtime shop cache. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:140` | `Data TD2` thief encounter source is copied into runtime cache. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:152` | `Data TD3` timed encounter source is copied into runtime cache. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:164` | `Data ED` simple encounter source is copied into runtime `CE`. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:184` | `Data ED2` complex encounter source is copied into runtime `CE2`. |
| `F:\Realmz\src\realmz_orig\menuinit.c:388` | `Data MENU` is a generated/effective monster menu cache. |
| `F:\Realmz\src\realmz_orig\fileprep.c:178` | `Data H1` is save/runtime thief state. |
| `F:\Realmz\src\realmz_orig\loadsavedgame.c:575` | `Data H1` is read during saved-game load. |
| `F:\Realmz\src\realmz_orig\main.c:2031` | Scenario-file `Data CS` is a code-segment backup used for registration/security demixing, not the same file as runtime `:Data Files:CS`. |

## Divinity Evidence

Divinity generally presents source editors: Land Editor, Dungeon Editor, Shops, Rogue Encounters, Timed Encounters, Simple/Complex Encounters, Strings, Action Points, and Rules editors. Runtime caches do not appear as normal authoring screens in the guide.

## Byte Layout Notes

- Source files should be parsed/written/exported.
- Runtime caches can be inspected when imported but should not become normal authoring targets.
- Save-state files such as `Data H1` explain gameplay state, not blank-scenario authoring.
- Generated caches can still help validate whether Providence's source export would generate equivalent runtime data.
- Be careful with `CS` terminology:
  - runtime `:Data Files:CS` is the shop cache copied from source `Data SD`;
  - scenario `Data CS` is a small security/code-segment backup read with `getfilename("Data CS")` during registration checks.
  - Providence should not classify scenario `Data CS` as a shop cache.

## Corpus Evidence

- Core source files appear in all scenarios.
- Runtime/generated files appear variably; `Data MENU` appears in 28/44 scenarios in the generated summaries.
- The byte-roundtrip audit sees scenario `Data CS` in 81/87 visible roots at 316 bytes. That file is registration/security support data, not the runtime shop cache.
- Cache/source conflicts should be tracked as diagnostics, not resolved by editing caches first.

## Providence Follow-Up

- Follow-up: `docs-only`, `validation`, `preserve-only`.
- Generate `runtime-cache-classification.json` and keep it updated.
- In the UI, name cache data as imported/runtime data under Advanced Details.
- Prefer source editors for shops, encounters, timed encounters, thief encounters, maps, and scripts.

## Writer Gate

Do not write runtime caches from editor commands unless there is no separate authored source file or the workflow explicitly exports a saved-game/runtime artifact. Providence scenario export should produce source scenario files.
