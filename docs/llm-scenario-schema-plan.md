# LLM Scenario Schema Support Plan

Providence should support prompt-created scenarios through a strict seed schema, not by asking an LLM to invent full `.providence/project.json` files. The LLM-facing shape should stay semantic, compact, and author-facing. Providence should allocate Realmz IDs, create record rows, create EDCD settings rows, fill editor metadata, and run normal validation.

Next implementation plan: [`docs/llm-scenario-schema-next-plan.md`](llm-scenario-schema-next-plan.md)

## Current Baseline

- `schemas/scenario-seed.schema.json` defines the first prompt-facing seed.
- `src/editor/scenarioSeed.ts` validates and expands that seed into a `Project`.
- Supported content: scenario metadata, keyed maps, map regions, map drawing operations, messages, quests, battles, Normal scenario monsters and descriptions, treasures, shops, scenario items and item text, simple encounters, Extra Action Points, and semantic AP seed aliases.
- Supported map operations: `fill`, `rect`, `line`, `path`, `border`, `room`, `road`, `river`, and `stamp`.
- Supported AP seed aliases: `message`, `battle`, `simpleEncounter`, `complexEncounter`, `shop`, `treasure`, `sound`, `picture`, `scrollingText`, `victoryPoints`, `temple`, `banking`, `displayMap`, `pickCharacters`, `returnGosub`, `popStack`, `addSpecialCharacter`, `dropSpecialCharacter`, `teleport`, `randomMessage`, `selectiveBattle`, `branchOnQuest`, `setQuestFlag`, `questValue`, `branchOnQuestValue`, `branchOnRandom`, `branchOnPercent`, `changeTile`, `healHurtParty`, `takeGold`, `giveCondition`, `awardRandomItems`, `branchOnItem`, `branchOnItemCharges`, `dropItems`, `changeItemCharges`, `replaceItems`, `branchOnPartyCondition`, `branchOnCharacterCondition`, `branchOnTileParameter`, `copyActionPointSteps`, `enableActionPoint`, `disableActionPoint`, `patchActionPoint`, `setDarkLevel`, `alterGameTime`, `branchOnGameTime`, `boatCampStatus`, `alterFatigue`, `changeSpellPoints`, `branchOnSpellPoints`, `enterExitDungeon`, `edcd`, and `raw`.
- Full AP editor coverage is broader than the seed layer. The seed layer needs aliases, not opcode archaeology from scratch.

## Guiding Rules

- The seed schema is strict: no unknown keys, fixed discriminants, and range checks.
- The seed should allow named references first and numeric Realmz IDs second.
- Runtime-specific binary details belong in the normalizer, not in prompt output.
- Every non-raw semantic AP wrapper must map to a documented opcode and storage shape.
- `raw` remains available for power users and for opcodes without polished semantic aliases.
- Generated projects must pass the existing browser project validator before being accepted.

## Phase 1: References And Allocation

Status: implemented for maps, messages, quests, battles, Normal scenario monsters, treasures, shops, scenario items, simple encounters, and action points.

Add stable author-facing IDs for seed records:

- `messages[].key`
- `maps[].key`
- `quests[].key`
- `battles[].key`
- `monsters[].key`
- `treasures[].key`
- `shops[].key`
- `items[].key`
- `simpleEncounters[].key`
- `actionPoints[].key`
- future `items[].key`, `monsters[].key`, `assets[].key`

The normalizer allocates Realmz numeric IDs and preserves explicit numeric IDs when supplied. AP steps accept either numeric IDs or keys. This avoids making prompts track fragile numeric ID plumbing.

## Phase 2: Map Primitives

Status: implemented for fill, rectangle, line, path, border, room, wide road/river paths, rectangular stamps, and named regions. Map operations reject out-of-bounds geometry and non-serializable signed 16-bit tile values. Remaining work: reusable templates, semantic terrain groups, and generated action-point placement helpers.

Do not require prompts to emit 8,100 tiles for normal map authoring. Add map operations:

- `fill`
- `rect`
- `line`
- `path`
- `stamp`
- `border`
- `region`
- `placeActionPoint`

The normalizer applies implemented operations into the fixed 90x90 tile array. Named regions are reusable coordinate references for AP placement and future encounter logic.

## Phase 3: Direct AP Seed Aliases

Status: partially implemented for common direct CODE/ID actions.

Add semantic wrappers for direct CODE/ID actions first because they are low-risk:

- display message
- play sound
- display picture
- scrolling text
- simple encounter
- complex encounter
- shop
- treasure
- victory points
- offer temple
- banking
- display/give map
- pick characters, including the signed `-14` variant
- return/gosub stack controls
- add/drop special character
- direct battle/combat macro references where context is clear

Each wrapper should state whether it is safe in ordinary APs, encounter scripts, battle macros, or monster macros.

## Phase 4: EDCD AP Seed Aliases

Status: partially implemented for common movement, branch, party-effect, reward, and mutation actions.

Group EDCD-backed actions by author intent instead of exposing five raw fields:

- movement: teleport, teleport only, enter/exit dungeon, look direction
- branches: item possession, party condition, character condition, random, percent chance, quest flag, quest value, tile parameter, game time, spell points
- party effects: heal/hurt, cast spell, give condition, fatigue, spell points, picked-character alterations
- world mutation: change land tile, action point percent, dark/LOS state, camping/boat status, game time
- economy/items: take gold, alter item status, award random items, shop mutation/restriction
- random encounter regions: alter random rectangle, alter rectangle size
- combat macro behavior: spawn, rout, destroy, alter NPC/monster, battle macro criteria

The normalizer creates EDCD rows and writes the right opcode automatically for implemented aliases.

## Phase 5: Content Records

Expand seed records beyond APs:

- simple encounters with raw action rows; future work is option scripts that compile to action/result rows
- scenario items and item text; future work is friendlier item templates and stock-item references
- complex encounters with groups, spell/item/word/action tests, and result scripts
- thief encounters
- timed encounters
- scenario items and item text
- scenario monsters and monster descriptions; future work is alternate sets, library templates, and monster art references
- spell/race/caste overrides

These should use the same key-reference allocation model.

## Phase 6: Asset References

Let seeds reference Providence library assets without embedding binary data:

- stock Realmz resource references by known ID
- Providence custom library references by stable library key
- scenario-bundled asset requests for non-stock assets

The normalizer should decide whether the asset can remain a stock reference or must be copied into scenario assets.

## Phase 7: Repair Loop

Return structured diagnostics from seed parsing and project creation:

- parse errors
- unknown keys
- unresolved references
- allocated IDs
- clamped/rejected ranges
- export blockers
- authoring warnings

This should support an LLM repair loop: feed the diagnostics back to the model and ask for a corrected seed, while never accepting partial invalid data silently.

## Phase 8: Fixtures And Gates

Add golden seed fixtures that assert:

- schema accepts valid examples and rejects malformed examples
- normalizer creates expected Project records
- semantic AP aliases produce expected opcodes and EDCD rows
- generated project validation succeeds
- browser scenario package export succeeds for generated fixtures
- existing AP coverage stays complete for manual opcodes 1-127 plus signed aliases

## Open Decisions

- Whether seed aliases should use `key` everywhere, or allow strings directly in ID fields.
- Whether first automatic ID allocation should use low IDs or scenario-safe reserved ranges by record type.
- How much map generation should be deterministic templates versus prompt-supplied operations.
- Whether generated scenarios should start from an empty project shell or from a selected scenario/template package.
