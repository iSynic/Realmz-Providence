# Evidence Card: Strings, Data OD, And String Sound

## User-Facing Unlock

Providence can make the Text tool match Divinity's **Strings** workflow without exposing fake fields. The editor should support one-record-at-a-time string editing, searching, import/export, and two-choice option labels. `Data OD` is now source-backed as the compact option-label table. The `Sound` field visible in Divinity's Strings screen is classified as a caller/action sound concern, not a writable string-record field.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\textbox-time.c:34` | Scenario message display opens `Data SD2`. |
| `F:\Realmz\src\realmz_orig\textbox-time.c:37` | Message lookup seeks by `abs(index) * sizeof(myString)`, making `Data SD2` a dense 256-byte `Str255` table. |
| `F:\Realmz\src\realmz_orig\textbox-time.c:73` | Message display plays the generic text-box sound `5000`, not a per-string stored sound. |
| `F:\Realmz\src\realmz_orig\textbox-time.c:111` | Scenario messages can become notes/journal entries. |
| `F:\Realmz\src\realmz_orig\editstring.c:32` | Realmz's internal string editor opens `Data OD`. |
| `F:\Realmz\src\realmz_orig\editstring.c:42` | Realmz's internal string editor opens `Data SD2`. |
| `F:\Realmz\src\realmz_orig\editstring.c:678` | Realmz's internal string editor edits only the current string record and index; it has no per-string sound read/write path. |
| `F:\Realmz\src\realmz_orig\question.c:104` | Two-choice prompts prefer `Data OD` when present. |
| `F:\Realmz\src\realmz_orig\question.c:110` | Two-choice prompt fallback reads `Data SD2`. |
| `F:\Realmz\src\realmz_orig\question.c:122` | `Data OD` option strings are 25-byte slots. |
| `F:\Realmz\src\realmz_orig\question.c:146` | The first visible character becomes the keyboard shortcut for two-choice dialogs. |
| `F:\Realmz\src\realmz_orig\newland.c:1998` | Action opcode 19 displays a random `Data SD2` message from an EDCD range and ignores any EDCD sound slot. |

## Divinity Evidence

| Manual Line | Evidence |
| ---: | --- |
| 5748 | Divinity opens the Strings editor from the main land editing screen. |
| 5769 | Divinity can import text from an `Export Text` file back into `Data SD2`. |
| 5778 | Divinity can find the next maximum-length string. |
| 5784 | Divinity describes the workflow as useful for spell-checking. |
| Screenshot evidence | The Strings screen shows previous/next controls, `Go To No.`, `String`, `Sound`, character count, find first/next occurrence, export/import, and maximum-length search. |

## Byte Layout Notes

- `Data SD2` messages are fixed 256-byte `Str255` records.
- `Data OD` option labels are fixed 25-byte records and are preferred by two-choice prompts when available.
- Realmz reads option labels with negative string indexes: `editstring` uses `abs(stringindex) * 25`, while normal strings use `stringindex * 256`.
- If `Data OD` is absent, `question2` falls back to `Data SD2` and uses 256-byte message records for the two choices.
- The first visible character of each loaded option label becomes the keyboard shortcut in the two-choice prompt.
- Realmz has no central per-string sound field in the audited runtime path: text display uses a generic sound, and caller records such as Action Points, battles, random areas, and thief encounters carry their own sound IDs beside message IDs.
- The Divinity `Sound` field is not tied to a `Data SD2`/`Data OD` file offset or message-table runtime consumer. Current classification for Providence is `runtime caller field`: sound editing belongs on the action/encounter/battle record that actually owns and plays the sound.

## Corpus Evidence

- `Data SD2` is present in all known scenarios in the generated corpus summaries.
- The byte-roundtrip audit found `Data OD` in 22/87 visible known-valid scenario roots.
- Observed `Data OD` sizes are divisible by 25, with 23, 51, 53, and 61 option slots represented in the visible roots.
- Text resource types `TEXT`, `STR#`, and `styl` are resource-fork data and should remain separate from the authored `Data SD2` message pool.
- A focused local scan found nonzero post-length bytes in 22,862 of 24,442 complete `Data SD2` rows
  and malformed tails in eight of 25 files. These bytes are not runtime message text; conservative
  export preserves unchanged legacy rows and tails from the compatibility annex.

## Providence Follow-Up

- Follow-up: `parser-writer`, `editor-ui`, `validation`.
- `Data OD` parser/writer support is implemented as `optionLabels` with 25-byte raw preservation.
- Text/Strings now has an `Option Labels` editor for two-choice labels, including navigation, search, duplicate, clear, byte-limit validation, and usage links from player-option script parameter rows.
- Readable `TEXT`, `STR#`, and `styl` resources should display decoded text in reference previews, or an explicit no-readable-text state when no decoded text exists.
- Keep the Strings `Sound` field out of the default editor; use caller-specific sound controls where Realmz source proves them.
- Add a Divinity binary/fixture task only if we later need to reproduce that exact editor affordance as a caller-record shortcut.
- Present `TEXT` and `STR#` resources as read-only resource viewers unless resource writing is explicitly implemented.

## Writer Gate

`Data SD2` writing is authoritative when byte-length and Classic encoding are validated: fresh and
authored rows compile all 256 bytes from semantic text, and embedded `rawBytes` cannot affect output.
For imported scenarios, unchanged rows and malformed tails come only from the compatibility annex.
`Data OD` writing is source-backed and fixture-covered for 25-byte Pascal option labels; imported raw
bytes are preserved until a label is authored. String Sound is not a Strings writer target; supported
sound bytes are edited on their owning caller records.
