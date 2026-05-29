# Runtime Note: Text, Messages, And Encounter Display Buffers

## User-Facing Unlock

This note makes the Text tool and encounter target editors less mysterious. Providence should treat `Data SD2` as the central scenario message pool, while treating simple/complex encounter inline buffers as button/choice display text attached to encounter records. Punctuation seen inside encounter text is authored display copy unless a separate source path proves otherwise; branching and script execution live in encounter action rows and result fields.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\textbox-time.c:6` | `textbox(class, index, ...)` is the core text display path. |
| `F:\Realmz\src\realmz_orig\textbox-time.c:34` | `class == -1` opens scenario `Data SD2`. |
| `F:\Realmz\src\realmz_orig\textbox-time.c:37` | Scenario message lookup seeks to `abs(index) * sizeof(myString)`, so `Data SD2` records are 256-byte `Str255` slots. |
| `F:\Realmz\src\realmz_orig\textbox-time.c:63` | TextEdit receives `myString[1..length]`; byte 0 is the Pascal length. |
| `F:\Realmz\src\realmz_orig\textbox-time.c:111` | While displaying scenario messages, `n` or autonote marks `notes[abs(index)]`; message IDs are also note/journal targets. |
| `F:\Realmz\src\realmz_orig\question.c:104` | Two-choice prompt text prefers `Data OD` option strings, then falls back to `Data SD2`. |
| `F:\Realmz\src\realmz_orig\question.c:110` | Two-choice fallback reads `Data SD2` prompt records as 256-byte slots. |
| `F:\Realmz\src\realmz_orig\question.c:122` | `Data OD` option strings are 25-byte slots when present. |
| `F:\Realmz\src\realmz_orig\question.c:146` | The first visible character of the prompt strings becomes the keyboard shortcut for two-choice dialogs. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:164` | First-start copies source `Data ED` simple encounters into runtime `CE`. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:177` | Each simple encounter source record carries four 80-byte inline text buffers. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:184` | First-start copies source `Data ED2` complex encounters into runtime `CE2`. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:192` | Each complex encounter source record carries nine 40-byte inline text buffers. |
| `F:\Realmz\src\realmz_orig\encounters.c:283` | Simple encounter runtime records seek by `sizeof enc + 320`. |
| `F:\Realmz\src\realmz_orig\encounters.c:288` | Simple encounter loads four 80-byte buffers and converts them to C strings for display. |
| `F:\Realmz\src\realmz_orig\encounters.c:299` | Simple encounter buffers are passed to `ParamText(buffer[0..3])`, i.e. display labels/copy. |
| `F:\Realmz\src\realmz_orig\encounters.c:300` | Simple encounter prompt is a `Data SD2` message shown by `textbox(-1, -abs(enc.prompt), ...)`. |
| `F:\Realmz\src\realmz_orig\newland.c:1566` | Opcode `4` loads a simple encounter and branches through selected encounter action rows. |
| `F:\Realmz\src\realmz_orig\newland.c:1628` | Opcode `5` loads a complex encounter and branches through selected encounter action rows. |
| `F:\Realmz\src\realmz_orig\saveshop.c:5` | Runtime saves encounter state back to generated `CE`/`CE2`, not to authoring source files. |
| `F:\Realmz\src\realmz_orig\editstring.c:42` | Scenario string editor writes `Data SD2` 256-byte message slots. |

## Data SD2 Message Model

`Data SD2` is a dense fixed-record scenario message file:

- record size: `256` bytes;
- encoding: classic `Str255` / Pascal string; byte 0 is length;
- lookup: `messageId * 256`;
- `0` is effectively empty/no message in several runtime paths;
- negative message IDs can suppress click-wait in `textbox` because `class == -1` sets click behavior from the sign before taking `abs(index)`;
- messages can become journal/note entries through the `n` key/autonote path.

Providence editor implication: message records should be the main Text workbench, not buried inside individual script slots. Script, encounter, map, shop, and note editors should link into that central message record.

## Encounter Inline Text Buffers

Simple and complex encounters store display text alongside their action data:

| Container | Runtime Record Unit | Inline Buffers | Buffer Size | Purpose |
| --- | ---: | ---: | ---: | --- |
| `Data ED` / `CE` | `sizeof enc + 320` = 426 bytes in observed files | 4 | 80 bytes | Simple encounter choice labels/copy passed to `ParamText`. |
| `Data ED2` / `CE2` | `sizeof enc2 + 360` = 520 bytes in observed files | 9 | 40 bytes | Complex encounter display labels/copy for action, word, spell, item, thief, and related options. |

The source does not parse punctuation inside these buffers as scripting. The executable logic is stored in:

- `enc.code[choice][slot]` and `enc.id[choice][slot]`;
- `enc.choiceresult[choice]`;
- `enc2.code[result][slot]` and `enc2.id[result][slot]`;
- complex encounter result fields such as `choiceresult`, `wordresult`, `spellresult`, `itemresult`, and thief result fields.

Providence editor implication: text like `*Attempt to bribe...`, `%Show him...`, or `1=Goto...` should be labeled as imported display copy/source text, not as active syntax, unless a later Divinity binary pass proves Divinity used those characters as editor-side annotations. If Providence wants to explain the branch, it should do so from decoded result/action fields beside the text, not by pretending punctuation is executable.

## Prompt Search And Target Picking

The "search prompt msg" UI should search/select `Data SD2` message records for fields like `enc.prompt`. It is not an in-place text search inside the current textarea; it is a target picker for the prompt message ID. If the UI presents it as a search box, it must update the selected message target and keep the raw ID visible.

For two-choice prompt strings, Realmz may use `Data OD` 25-byte option labels if present; otherwise it falls back to `Data SD2`. The first visible character becomes a keyboard shortcut, so Providence should warn when two options start with the same key.

## Local Corpus Evidence

The local 28-scenario output corpus shows:

- `Data SD2` exists in every scenario checked;
- message record counts range from 50 to 4,155 records;
- City of Bywater has 881 message records (`225,536` bytes);
- City of Bywater `Data ED` is `8,520` bytes, which is 20 simple encounter records at 426 bytes each;
- City of Bywater `Data ED2` is `7,280` bytes, which is 14 complex encounter records at 520 bytes each.

## Providence Follow-Up

- Make Text a first-class message workbench with create, duplicate, clear, search, references, byte-length validation, and link-back to every source use.
- Replace "Do Not Use" as a dominant label with a clearer state such as `Empty / unused message slot` when the record is only a placeholder.
- In encounter editors, rename inline buffer sections to `Choice Display Text` or `Encounter Button Text`.
- Show decoded action/result rows next to the display text so users can understand what happens when that line is chosen.
- Keep `Data OD` as an optional two-choice prompt source backed by 25-byte option-label records; if missing, show `Data SD2` fallback explicitly.
- Runtime `CE`/`CE2` mutation should remain generated state evidence. Edits should write source `Data ED`/`Data ED2`.

## Validation Rules

- Message text must fit in a 255-byte Classic string after encoding.
- Prompt message IDs must resolve to `Data SD2` records unless intentionally raw/preserved.
- Encounter inline buffers must fit their fixed slots: 80 bytes for simple encounters, 40 bytes for complex encounters.
- Encounter choices with visible display text but no result/action should warn as inert display copy.
- Encounter result/action rows with empty display text should warn as reachable but unlabeled.
- Two-choice prompts should warn when the first visible character creates duplicate or blank keyboard shortcuts.

## Divinity Evidence Still Needed

- Whether Divinity used leading punctuation in encounter text as editor-only hints or purely left it as author-authored display text.
- Exact Divinity labels for simple/complex encounter text buffers.
- Exact Divinity authoring labels for `Data OD`; Realmz runtime preference for `Data OD` over `Data SD2` is source-backed.
- Text import/export workflow, spell-check behavior, and style/external text resource interactions.
