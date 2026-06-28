# Encounters Manual Parity Audit

This focused audit compares Divinity Manual 7.0 encounter chapters to Providence's Encounters tool. It tracks equivalent Realmz scenario-authoring capability, not pixel-for-pixel Divinity layout.

Providence targets modern Realmz 8+ behavior. Fields or controls that are not consumed by modern Realmz are preservation details, not authoring parity gaps.

Status vocabulary:

- `covered`: Providence handles the authoring behavior.
- `label-fix`: Providence handles the behavior, but UI wording needed or received correction.
- `ui-gap`: Parsed/exported data exists, but the authoring affordance needs improvement.
- `validation-gap`: Authoring exists, but warnings or resolution checks need improvement.
- `preview-only`: Divinity exposes a convenience preview/edit control that does not appear to write encounter data.
- `fixture-gated`: Likely authorable or visible in Divinity, but needs before/after fixture or source confirmation.
- `defer`: Out of scope for this pass.

## Evidence Inputs

- Manual chapters: `public/divinity-manual/index.html#page-16` through `#page-19`.
- Simple/Complex source evidence: `docs/generated/encounter-record-evidence.json` and `docs/format-evidence-cards/encounter-record-runtime-anchors.md`.
- Rogue/Timed source evidence: `docs/generated/thief-timed-encounter-evidence.json` and `docs/format-evidence-cards/thief-timed-encounter-runtime-anchors.md`.
- Runtime anchors: `F:\Realmz\src\realmz_orig\encounters.c`, `newland.c`, `textbox-time.c`, and `structs.h` as cited by the evidence cards.
- Fixture note from this pass: Divinity Rogue Trap Prompt String changed `783 -> 501` at `Data TD2` record-relative offset `106`, proving `prompt[0]` / Providence `record.prompts[0]`.

## Simple Encounter Editor

Manual claim summary:

Simple encounters present a prompt string, optional back-out behavior, max-times attempt count, up to four choice labels, and four result script columns. The manual also documents the special `-4` Result value on option 1, which branches directly to Result 4 before showing choices.

| Manual field/control | Providence control | Backing data | Evidence | Status | Follow-up |
| --- | --- | --- | --- | --- | --- |
| Prompt String | `Prompt String` ID and `Edit String` | `Data ED +104`, `prompt` | encounter evidence, manual page 16 | covered | Keep using String terminology instead of Message. |
| Max Times | `Max Times` | `Data ED +101`, `maxtimes` | encounter evidence, manual page 16 | covered | Consider validation for unusual imported counts only. |
| Can Backout | `Can Back Out` | `Data ED +100`, `canbackout` | encounter evidence, manual page 16 | label-fix | Manual spells it `Backout`; Providence's clearer wording is acceptable. |
| Four choices | `Player Options`, option text buffers | `Data ED +106`, four 80-byte buffers | encounter evidence, manual page 16 | covered | Byte-limit UI should remain visible. |
| Result # per choice | Result picker | `Data ED +96`, `choiceresult[4]` | encounter evidence, manual page 16, manual page 37 note | covered | Option 1 exposes `-4 Auto-run Result #4`; other options stay constrained to source-backed `0..4`. |
| Result scripts | `Result Action Columns` | shared `code[4][8]` / `id[4][8]` | encounter evidence, runtime anchors | covered | Keep result columns visible and editable. |
| Runtime replacement/elimination | Shown through script effects, not source edits | runtime `CE` cache | `newland.c` anchors in evidence card | covered | Continue labeling as runtime behavior, not authored source data. |

Current pass notes:

- Providence exposes all confirmed source-backed Simple fields.
- The option-1 `-4` shortcut is handled as a narrow modern Realmz sentinel, not generic negative result branching.

## Complex Encounter Editor

Manual claim summary:

Complex encounters present one prompt string and five response families: physical action choices, typed word/phrase, Rogue Action, item use, and spell/scroll use. Each successful response routes to one of four embedded result scripts, while failures default to Result 4. The manual says low Spell IDs can match whole spell classes.

| Manual field/control | Providence control | Backing data | Evidence | Status | Follow-up |
| --- | --- | --- | --- | --- | --- |
| Prompt String | `Prompt String` ID and `Edit String` | `Data ED2 +158`, `prompt` | encounter evidence, manual page 17 | covered | Keep String terminology. |
| Max Times | `Max Times` | `Data ED2 +153`, `maxtimes` | encounter evidence, manual page 17 | covered | No storage change. |
| Can Backout | `Can Back Out` | `Data ED2 +151`, `canbackout` | encounter evidence, manual page 17 | covered | No change. |
| Physical Actions | `Action Choices` text rows and required checkboxes | `group[8]`, text buffers 0-7, `choiceresult` | encounter evidence, manual page 17 | covered | Current compact layout is intentionally not pixel-cloned. |
| Action Result | `Action Result` | `Data ED2 +96`, `choiceresult` | encounter evidence | covered | No change. |
| Word Action | `Typed Reply` and result | text buffer 8, `wordresult` | encounter evidence, manual page 17 | covered | Lowercase conversion matches manual/runtime behavior. |
| Rogue Action | `Has Rogue Encounter`, numeric picker, `Go to Rogue Encounter` | `thief`, `thiefsuccess` | encounter evidence, manual page 17 | covered | Legacy `thieffail` / Rogue Reset Flag is not consumed by modern Realmz and should remain preserve-only, not authorable. |
| Use Item Action | `Item Responses` | `itemid[5]`, `itemresult[5]` | encounter evidence, manual page 17 | covered | Keep picker narrowed but searchable through loaded target options. |
| Spell / Scroll Action | `Magic Responses` | `spellid[10]`, `spellresult[10]` | encounter evidence, `encounters.c` class check | label-fix | Low IDs are spell/resistance classes, not caster classes; current labels now reflect that. |
| Spell class IDs | Low-ID spell-class options | spell IDs below 7 | manual page 17, `encounters.c:1004` evidence | covered | Modern Realmz source takes precedence over Divinity wording; class shortcut options remain the runtime-consumed `1..6`. |
| Result scripts | `Result Scripts` | shared `code[4][8]` / `id[4][8]` | encounter evidence | covered | Flow summaries are secondary QA; do not duplicate obvious row content. |

Current pass notes:

- The Discord feedback about magic responses is source-backed: low spell response values test `spellinfo.spellclass`, not caster type.
- Same-type picker and collapsible records list should remain available for Complex records.
- The Rogue button label should stay singular because it navigates to the referenced record.

## Rogue Encounter Editor

Manual claim summary:

Rogue encounters define thief action tests, skill modifiers, success/failure result codes, text and sound feedback, trap/lock setup, trap prompt string, trap sound, trap spell, power level, lock tumblers, and magic open/disarm chances. Divinity also shows lower-left string/sound preview controls that fixture evidence says are editor conveniences rather than TD2 authored fields.

| Manual field/control | Providence control | Backing data | Evidence | Status | Follow-up |
| --- | --- | --- | --- | --- | --- |
| Action Required | Rogue action checkboxes | `Data TD2 +0`, `type[0..7]` | thief/timed evidence, manual page 18 | covered | Keep action labels aligned with Divinity. |
| % Modify | `% Mod` | `Data TD2 +10`, `modifer[8]` | thief/timed evidence, manual page 18 | covered | Source misspelling remains internal only. |
| Result Codes Success/Fail | `Result Success`, `Result Fail` | `codes[8]`, `codef[8]` | thief/timed evidence, manual page 18 | covered | Validation should keep empty visible outcomes clear. |
| Text Codes Success/Fail | `Success Text`, `Fail Text` pickers | `texts[8]`, `textf[8]` | thief/timed evidence, manual page 18 | label-fix | UI should consistently call these strings when referring to Data SD2 records. |
| Sound Codes Success/Fail | `Success Sound`, `Fail Sound` pickers | `sounds[8]`, `soundf[8]` | thief/timed evidence, manual page 18 | covered | No change. |
| Trap Prompt String | `Trap Prompt String` picker and editable preview | `prompt[0]`, `Data TD2 +106` | current fixture note, thief/timed evidence | covered | This is the authorable Rogue prompt field. |
| Prompt Sound | Not exposed as normal authoring | `sound[0]` runtime prompt sound path exists, fixture says visible Divinity preview field did not alter scenario data | thief/timed evidence, fixture note | preview-only | Already removed from the Rogue authoring UI; do not re-add unless a new fixture proves scenario storage. |
| Is Trapped | `Is Trapped` | `type[9]` | thief/timed evidence, manual page 18 | covered | Runtime can mutate this in CT; source editor edits initial state. |
| Trap Affects Rogue Only | `Trap Affects Rogue Only` | `type[8]` | thief/timed evidence, manual page 18 | covered | No change. |
| Trap Damage | `Trap Damage` low/high | `lowdamage`, `highdamage` | thief/timed evidence, manual page 18 | covered | Keep low/high validation. |
| Trap Sound | `Trap Sound` picker with preview button | `prompt[1]`, `Data TD2 +108` | thief/timed evidence card | covered | Keep authorable; the adjacent button is a preview affordance for this authored sound value. |
| Trap Spell | `Trap Spell` picker | `spell`, `Data TD2 +98` | thief/timed evidence, manual page 18 | covered | Hover helper should continue resolving spell names. |
| Power Level | `Power Level` | `prompt[2]`, `Data TD2 +110` | thief/timed evidence, manual page 18 | covered | No change. |
| Number of Lock Tumblers | `Number of Lock Tumblers` | `tumblers`, `Data TD2 +104` | thief/timed evidence, manual page 18 | covered | No change. |
| % Chance / Level to Open | `% Chance / Level to Open` | `sound[1]`, `Data TD2 +114` | thief/timed evidence, validation code | covered | Label matches manual intent. |
| % Chance / Level to Disarm Trap | `% Chance / Level to Disarm Trap` | `sound[2]`, `Data TD2 +116` | thief/timed evidence, validation code | covered | Label matches manual intent. |
| Divinity lower-left String/Sound controls | Not exposed as authored Rogue fields | not present in current TD2 fixture diff | user fixture note | preview-only | Keep out of authoring UI; do not conflate these preview controls with the authorable Trap Sound row above. |

Current pass notes:

- Providence should keep source `Data TD2` separate from runtime `CT` mutations.
- The audit records preview-only Divinity affordances explicitly so they are not reintroduced as source fields. Trap Sound is not in that preview-only bucket.

## Timed Encounter Editor

Manual claim summary:

Timed encounters are checked at midnight. They can run once or repeat by increment, gate by percent chance, require item/quest state, and optionally require land/dungeon position, level, random rectangle, and coordinates. `Day = -1` and `Increment = -1` make the record inactive until an Action Point alters it.

| Manual field/control | Providence control | Backing data | Evidence | Status | Follow-up |
| --- | --- | --- | --- | --- | --- |
| Day | `Day` | `Data TD3 +0`, `day` | thief/timed evidence, manual page 19 | covered | Consider inline note for `-1/-1` inactive pattern. |
| Increment | `Increment` | `Data TD3 +2`, `increment` | thief/timed evidence, manual page 19 | covered | No change. |
| % Chance | `% Chance` | `Data TD3 +4`, `percent` | thief/timed evidence, manual page 19 | covered | Validation should continue warning outside normal percent range. |
| Extra AP to Activate | `Extra AP To Activate` | `Data TD3 +6`, `door` | thief/timed evidence, manual page 19 | covered | Picker conversion is a future UI improvement, not a storage gap. |
| Required Item ID | `Required Item ID` | `Data TD3 +16`, `recitem` | thief/timed evidence, manual page 19 | covered | Picker conversion is a future UI improvement. |
| Required Quest ID | `Required Quest ID` | `Data TD3 +18`, `recquest` | thief/timed evidence, manual page 19 | covered | Picker conversion is a future UI improvement. |
| Position Required | `Position Required` picker | `stuff[0]`, `Data TD3 +20` | thief/timed evidence, manual page 19 | covered | Keep picker in line with other field titles. |
| Required Level | `Required Level` | `Data TD3 +8`, `reclevel` | thief/timed evidence, manual page 19 | covered | No change. |
| Required Rect | `Required Rect` | `Data TD3 +10`, `recrect` | thief/timed evidence, manual page 19 | covered | No change. |
| Required X | `Required X` | `Data TD3 +12`, `recx` | thief/timed evidence, manual page 19 | covered | No change. |
| Required Y | `Required Y` | `Data TD3 +14`, `recy` | thief/timed evidence, manual page 19 | covered | No change. |
| Remaining TD3 fields | `Compatibility Data`, collapsed | `stuff[1..9]` | reserved-field report, thief/timed evidence | fixture-gated | Keep collapsed/read-only until authoring meaning is proven. |
| Code 54 activation | Script effect, not direct source edit here | runtime `CTD3` mutation | `newland.c` anchor in evidence card | covered | Keep as runtime mutation semantics in Action Points. |

Current pass notes:

- Providence already follows the manual's position-required structure after replacing the raw position code with a picker.
- Compatibility Data should remain collapsed by default because no manual/source evidence gives author-facing names to `stuff[1..9]`.

## Cross-Tool Encounter Navigation

| Behavior | Providence handling | Status | Follow-up |
| --- | --- | --- | --- |
| Records list can collapse | Show/Hide Records remains available for all encounter families | covered | Keep default width narrow. |
| Same-type picker works while records are hidden | Simple, Complex, Rogue, and Timed workbench shells have `Encounter Record` picker | covered | Browser-regress on blank and imported scenarios. |
| Complex to Rogue direct navigation | `Go to Rogue Encounter` selects the referenced Rogue record | covered | Keep singular label and disabled state tied to existing target. |
| Source vs runtime cache distinction | Audit/evidence docs distinguish Data ED/ED2/TD2/TD3 from CE/CE2/CT/CTD3 | covered | Do not expose runtime-only mutation state as authored source fields. |

## Deferred Or Fixture-Gated Items

- Rogue preview-only Prompt Sound and Divinity lower-left String/Sound controls unless a before/after fixture proves scenario writes. This does not apply to Trap Sound, which is already covered as authored TD2 data.
- Timed `stuff[1..9]` author-facing meanings.

Not a parity gap:

- Complex `Rogue Reset Flag` / `thieffail`: not consumed by modern Realmz 8+, so Providence should preserve imported bytes but not expose it as normal authoring.
- Complex Spell Class `7`: Spell Class 7 exists in the Spell Editor, but modern Realmz Complex Encounter matching only consumes nonzero spell-class shortcut IDs below 7. Providence should follow source behavior when Divinity guidance differs.
