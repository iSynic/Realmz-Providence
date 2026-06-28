# Runtime Note: Simple And Complex Encounter Records

## User-Facing Unlock

This note turns `Data ED` and `Data ED2` from mostly raw target records into concrete Encounter workbench targets. Providence can expose prompt pickers, choice/action rows, inline display text, spell/item/thief/action success paths, "can back out" behavior, and clear source-vs-runtime cache labeling.

The most important editor correction is that complex encounters are not just "four choice rows." Realmz has a richer `encount2` header: one action result, one word result, eight action-picker group flags, ten spell tests, five item tests, thief/lock/trap hooks, and four result action rows.

## Runtime Model

Realmz stores encounter source records in the scenario:

- `Data ED`: simple encounters.
- `Data ED2`: complex encounters.

At first start, Realmz copies those files into runtime caches:

- `Data ED` -> `:Data Files:CE`
- `Data ED2` -> `:Data Files:CE2`

Runtime may mutate the cached encounter headers, especially eliminated choices and replacement result rows. Providence should edit the scenario source files and show `CE`/`CE2` as runtime/effective-state evidence only.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\structs.h:226` | Defines `struct encount2`, the complex encounter header. |
| `F:\Realmz\src\realmz_orig\structs.h:242` | Defines `struct encount`, the simple encounter header. |
| `F:\Realmz\src\realmz_orig\convert.c:260` | `CvtEncount2ToPc` converts complex encounter IDs, spell IDs, item IDs, booleans, and prompt. |
| `F:\Realmz\src\realmz_orig\convert.c:269` | `CvtEncountToPc` converts simple encounter IDs, `canbackout`, and prompt. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:164` | First-start copies `Data ED` into runtime `CE`, carrying four 80-byte buffers per record. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:184` | First-start copies `Data ED2` into runtime `CE2`, carrying nine 40-byte buffers per record. |
| `F:\Realmz\src\realmz_orig\newland.c:1575` | Opcode `4` loads a simple encounter from runtime `CE`. |
| `F:\Realmz\src\realmz_orig\newland.c:1641` | Opcode `5` loads a complex encounter from runtime `CE2`. |
| `F:\Realmz\src\realmz_orig\encounters.c:296` | Simple encounters blank choice display text for eliminated choices. |
| `F:\Realmz\src\realmz_orig\encounters.c:300` | Simple encounter prompt displays through central `Data SD2` by `textbox(-1, -abs(prompt), ...)`. |
| `F:\Realmz\src\realmz_orig\encounters.c:328` | Simple encounter returns `choiceresult[choice]`. |
| `F:\Realmz\src\realmz_orig\encounters.c:381` | Complex encounter spell availability depends on `spellid[0]`. |
| `F:\Realmz\src\realmz_orig\encounters.c:389` | Complex encounter thief action availability depends on `thief`. |
| `F:\Realmz\src\realmz_orig\encounters.c:397` | Complex encounter word action availability depends on `wordresult`. |
| `F:\Realmz\src\realmz_orig\encounters.c:405` | Complex encounter action-picker availability depends on `choiceresult`. |
| `F:\Realmz\src\realmz_orig\encounters.c:421` | Complex encounter item action availability depends on `itemid[0]`. |
| `F:\Realmz\src\realmz_orig\encounters.c:1004` | Complex encounter spell checks match exact spell IDs or spell classes. |
| `F:\Realmz\src\realmz_orig\encounters.c:1065` | Complex encounter item checks match used item IDs. |
| `F:\Realmz\src\realmz_orig\encounters.c:1100` | Complex encounter action-picker checks use the eight `group` flags. |
| `F:\Realmz\src\realmz_orig\saveshop.c:1` | `saveencounter` writes changed headers back to runtime `CE`/`CE2`, not source files. |
| `F:\Realmz\src\realmz_orig\newland.c:1737` | Opcode `7` can replace simple encounter result-code rows in runtime `CE`. |
| `F:\Realmz\src\realmz_orig\newland.c:1756` | Opcode `7` can replace complex encounter result-code rows in runtime `CE2`. |
| `F:\Realmz\src\realmz_orig\newland.c:2784` | Opcode `41` eliminates a simple encounter choice in runtime `CE`. |
| `F:\Realmz\src\realmz_orig\newland.c:2827` | Opcode `44` breaks/clears a complex encounter result row in runtime state. |

## Shared Header Layout

Both simple and complex encounters begin with the same action-row block:

| Offset | Size | Field | Notes |
| ---: | ---: | --- | --- |
| 0 | 32 | `code[4][8]` | Four result rows, eight CODE slots each. |
| 32 | 64 | `id[4][8]` | Four result rows, eight ID slots each. |

Each result row is copied into `infodoor` after a simple choice or a complex outcome succeeds, then execution returns to `newland`.

## Simple Encounter Layout

Runtime stride is `sizeof enc + 320`, with four 80-byte display buffers. In Providence and the current Windows source build this is 426 bytes.

| Offset | Size | Field | Notes |
| ---: | ---: | --- | --- |
| 0 | 96 | action rows | Shared block described above. |
| 96 | 4 | `choiceresult[4]` | Button result mapping. Zero means eliminated/unavailable. |
| 100 | 1 | `canbackout` | Controls whether the dialog includes the back-out/cancel affordance. |
| 101 | 1 | `maxtimes` | Attempt/try count copied into runtime `enctry`. |
| 102 | 1 | `castesuccess` | Caste success/result evidence. Divinity labels still needed. |
| 103 | 1 | padding/evidence | Preserve. |
| 104 | 2 | `prompt` | Central `Data SD2` prompt message ID. Runtime displays `-abs(prompt)`. |
| 106 | 320 | text buffers | Four 80-byte inline display buffers passed to `ParamText`. |

Modern Realmz checks `choiceresult[0] == -4` before opening the choice dialog and immediately runs Result #4 when present. This is a narrow Option 1 sentinel, not generic negative result branching.

### Simple Encounter Confidence Debt

Some corpus `Data ED` files are not evenly divisible by 426. Realmz source copies records by reading `sizeof enc` and then four 80-byte buffers, so the Windows-port runtime stride is source-backed; however, corpus tails/packing differences should be preserved and investigated before changing parser or writer behavior. Providence should avoid aggressive truncation and should keep imported tail bytes as source evidence when present.

## Complex Encounter Layout

Runtime stride is `sizeof enc2 + 360`, which is 520 bytes in source and corpus evidence.

| Offset | Size | Field | Notes |
| ---: | ---: | --- | --- |
| 0 | 96 | action rows | Shared block described above. |
| 96 | 1 | `choiceresult` | Result for action-picker success. |
| 97 | 1 | `wordresult` | Result for typed-word success. |
| 98 | 8 | `group[8]` | Action-picker required groups. |
| 106 | 20 | `spellid[10]` | Exact spell IDs or class IDs under 7. |
| 126 | 10 | `spellresult[10]` | Result mapped from matching spell test. |
| 136 | 10 | `itemid[5]` | Item IDs accepted by the item action. |
| 146 | 5 | `itemresult[5]` | Result mapped from matching item test. |
| 151 | 1 | `canbackout` | Back-out/cancel affordance. |
| 152 | 1 | `thief` | Enables thief-action path. |
| 153 | 1 | `maxtimes` | Attempt/try count copied into runtime `enctry`. |
| 154 | 1 | `castesuccess` | Caste success/result evidence. Divinity labels still needed. |
| 155 | 1 | `thiefsuccess` | `Data TD2` thief encounter ID used by thief/spell paths. |
| 156 | 1 | `thieffail` / Rogue Reset Flag | Preserved legacy byte. Divinity labels this as `Rogue Reset Flag`, but modern Realmz does not consume it in current runtime evidence. |
| 157 | 1 | padding/evidence | Preserve. |
| 158 | 2 | `prompt` | Central `Data SD2` prompt message ID. Runtime displays `-abs(prompt)`. |
| 160 | 360 | text buffers | Nine 40-byte inline display buffers. Buffer 8 is the word target text. |

## Complex Outcome Semantics

Complex encounters expose several possible user actions:

- **Spell / Scroll**: enabled by `spellid[0]`. Matches exact spell IDs or spell class IDs below 7, then returns the paired `spellresult`.
- Spell Class 7 exists in Spell Editor data, but modern Realmz Complex Encounter matching only consumes nonzero spell-class shortcut IDs below 7. Providence should follow source behavior when Divinity manual wording differs.
- **Item**: enabled by `itemid[0]`. Matches used item IDs, then returns the paired `itemresult`.
- **Thief**: enabled by `thief`; may load `Data TD2` through `thiefsuccess`.
- **Word**: enabled by `wordresult`; compares typed text against buffer 8, with several hardcoded debug/special words in Realmz.
- **Action picker**: enabled by `choiceresult`; checks all required `group[8]` flags.

After any path returns a result, `newland` branches to one of the four result action rows or handles special return values such as the item-door activation path.

## Corpus Evidence

`Data ED` and `Data ED2` appear in all 44 analyzed scenarios.

| File | Evidence |
| --- | --- |
| `Data ED2` | Clean 520-byte records across local output corpus; Trouble in the Sword Lands has 48,360 bytes = 93 records. |
| `Data ED` | Runtime/source stride is 426 bytes in the current port, but multiple corpus files have trailing bytes when divided by 426. This is a preserve/investigate case, not a reason to invent field meanings. |

## Providence Editor Implications

- Keep editing scenario `Data ED` / `Data ED2`, not runtime `CE` / `CE2`.
- Simple Encounter editor should expose four choices, four result action rows, four 80-byte display buffers, prompt message picker, back-out, max times, and caste success.
- Complex Encounter editor should expose action result, word result, group flags, spell tests, item tests, thief hook, prompt picker, nine 40-byte buffers, and four result action rows.
- Existing "Encounter Text" punctuation should remain authored display text unless a Divinity binary pass proves editor annotation semantics.
- Complex encounter UI should not label bytes 96-103 as four generic choice/word rows; the source-backed fields are one `choiceresult`, one `wordresult`, and eight `group` flags.
- Complex Encounter result scripts can play sounds through normal action codes. Do not model result-script sound opcodes as a separate top-level `Data ED2` encounter field.
- Runtime mutation opcodes should be shown as script effects that alter `CE`/`CE2`, not static source edits.

## Validation Rules

- `Data ED2` length should be divisible by 520.
- `Data ED` should parse source-backed 426-byte records but preserve and warn on trailing bytes.
- Prompt IDs should resolve to `Data SD2` messages when nonzero.
- Simple choice results should map to available result rows or zero/eliminated state; only Option 1 may use the source-backed `-4` auto-run Result #4 sentinel.
- Complex spell IDs should resolve through the spell picker or known class IDs below 7.
- Complex item IDs should resolve through the item library.
- `thiefsuccess` should resolve to `Data TD2` when thief/spell-trap behavior is enabled.
- `thieffail` should be preserved as an unconsumed legacy byte, not edited as normal authoring and not treated as a Rogue Encounter reference.
- Inline simple buffers must fit 80 bytes; complex buffers must fit 40 bytes.
- Action rows must use supported CODE/ID semantics and preserve unsupported imported behavior.

## Divinity Evidence Still Needed

- Simple/complex encounter editor labels, defaults, and field ordering.
- Whether Divinity exposes the hardcoded word commands or treats them as hidden runtime behavior.
- Explanation for corpus `Data ED` trailing/packing cases.

## Providence Follow-Up

- Follow-up: `parser-writer`, `editor-ui`, `validation`.
- Correct/rename complex encounter model fields to match source-backed `encount2` semantics.
- Preserve `Data ED` tail bytes before adding aggressive simple encounter rewrite behavior.
- Build Encounter editors after message, item, spell, and thief pickers are available.
