# Evidence Card: Scripts And Runtime State Semantics

## User-Facing Unlock

Providence can explain not only what an Action Point slot says, but when Realmz executes it, what runtime cache/state it mutates, and whether that behavior is source-authored or generated during play.

## Realmz Anchors

- `newland.c`: action opcode dispatcher and runtime effects.
- `misc.c:loadextracode`: EDCD row loading.
- `flashrange-loaddoor.c:loaddoor2`: macro/action record loading.
- `textbox-time.c`: random and timed encounter dispatch.
- `saveshop.c`, `setupnewgame.c`: source-to-cache copy and encounter/shop runtime state.
- `Global`: 60-byte global macro hook file; see `global-macro-runtime-anchors.md`.
- Existing generated docs: active unknown opcodes, dispatcher no-ops, ED3 reachability, confidence debt.

## Divinity Evidence Needed

- Action Point, GOSUB, Macro, Quest, EDCD, Random Area, Encounter, and Release check UI behavior.
- Binary evidence for how Divinity labels ambiguous opcodes and extra-code fields.

## Byte Layout Notes

- `Data DD`, `Data DDD`, and `Data ED3` are 40-byte action records.
- `Data EDCD` is five signed shorts per row.
- `Global` macros are 30 signed shorts. Source-backed runtime consumers are slot `0` start game, slot `1` party death, slot `2` end/quit game, slot `4` before shop, and slot `5` before temple. Slots `3` and `6-29` are preserved evidence until Divinity binary or source anchors prove a consumer.
- Runtime caches can mutate trigger/random/shop/encounter state; these must stay separate from authored source files.

## Corpus Evidence

- Action records and EDCD appear in all 44 analyzed scenarios.
- Confidence debt is dominated by ED3 reachability and probable padding, with several scenarios containing hundreds of inferred rows.
- Generated no-op cases are distinct from true unknown executable behavior.
- `Global` appears in the broad 44-scenario corpus and in all 28 local output-corpus scenarios checked for the global-hook card; several scenarios use unproven slots, especially slot `29`, so those values should be preserved rather than hidden.

## Providence Follow-Up

- Follow-up: `parser-only`, `validation`, `editor-ui`.
- Finish opcode/EDCD semantic coverage by frequency and editor impact.
- Add runtime-state badges for one-shot random doors, shop stock mutation, encounter repeat state, timed gates, and monster death hooks.
- Add a Scenario/Scripts Global Macro Hooks editor with source-backed hook rows and preserved unproven slots.

## Acceptance Evidence

- Every active executable opcode is classified as supported, dispatcher-noop, preserve-only, or unknown with source/corpus evidence.
- ED3 Evidence does not appear as callable macro content unless reachability is proven or user-authored.
- Runtime cache effects are visible without being exported as authored source.
