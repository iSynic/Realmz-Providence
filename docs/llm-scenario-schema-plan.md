# LLM Scenario Schema Support Plan

Providence should support prompt-created scenarios through a strict seed schema, not by asking an LLM to invent full `.providence/project.json` files. The LLM-facing shape should stay semantic, compact, and author-facing. Providence should allocate Realmz IDs, create record rows, create EDCD settings rows, fill editor metadata, and run normal validation.

Next implementation plan: [`docs/llm-scenario-schema-next-plan.md`](llm-scenario-schema-next-plan.md)

## Current Baseline

- `schemas/scenario-seed.schema.json` defines the first prompt-facing seed.
- `src/editor/scenarioSeed.ts` validates and expands that seed into a `Project`.
- New Project exposes the seed compiler through a Scenario JSON mode in both browser and desktop runtimes, with inline validation failures before persistence.
- Scenario JSON can use the current project as its base template while preserving browser raw snapshots or desktop package payload directories.
- Blank and prompt-created projects now include a generated, content-neutral Realmz runtime baseline. Browser and desktop exports contain the required startup files, fixed item capacity, scenario shell/support files, and one door table per authored map without borrowing another scenario's data.
- Supported content: scenario metadata, keyed maps, map regions, map drawing operations, messages, quests, battles, Normal scenario monsters and descriptions, treasures, shops, scenario items and item text, stock and Custom Library asset references, simple and timed encounters, Extra Action Points, and semantic AP seed aliases.
- Supported map operations include organic `landmass` and `blob` terrain, terrain-aware `semanticRoute` region connections, semantic `castleRoom` interiors, and the lower-level fill, shape, road, stamp, terrain, secret, and dungeon-passage operations.
- Supported AP seed aliases: `message`, `battle`, `simpleEncounter`, `complexEncounter`, `shop`, `treasure`, `sound`, `picture`, `scrollingText`, `victoryPoints`, `temple`, `banking`, `displayMap`, `pickCharacters`, `returnGosub`, `popStack`, `addSpecialCharacter`, `dropSpecialCharacter`, `teleport`, `randomMessage`, `selectiveBattle`, `battleOutcome`, `improvedBattleOutcome`, `causeRout`, `battleMacroCriteria`, `spawnMonsters`, `destroyRelatedMonsters`, `continueIfMonsterPresent`, `alterTimedEncounter`, `branchOnQuest`, `setQuestFlag`, `questValue`, `branchOnQuestValue`, `branchOnRandom`, `branchOnPercent`, `changeTile`, `healHurtParty`, `takeGold`, `giveCondition`, `awardRandomItems`, `branchOnItem`, `branchOnItemCharges`, `dropItems`, `changeItemCharges`, `replaceItems`, `branchOnPartyCondition`, `branchOnCharacterCondition`, `branchOnTileParameter`, `copyActionPointSteps`, `enableActionPoint`, `disableActionPoint`, `patchActionPoint`, `setDarkLevel`, `alterGameTime`, `branchOnGameTime`, `boatCampStatus`, `alterFatigue`, `changeSpellPoints`, `branchOnSpellPoints`, `alterRandomEncounterRectangle`, `alterRandomRectangle`, `enterExitDungeon`, `edcd`, and `raw`.
- Full AP editor coverage is broader than the seed layer. The seed layer now includes common spell, party-state, dungeon-view, battle-control, and picked-character aliases; remaining additions should stay driven by authoring value rather than duplicate opcode archaeology.

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

Status: implemented for fill, rectangle, line, path, border, room, semantic Castle rooms, wide raw road/river paths, semantic cardinal road networks, terrain-aware named-region routes, organic landmasses and terrain blobs, rectangular stamps, named regions, stable landlook-aware named tile placement, reusable audited named stamps, reviewed Plains/Alternate Plains/Subterranean/Desert/Swamp/Snow water-mountain-forest terrain groups, land Secret Area state, landlook-specific stock hidden-walkable and combat-clearing terrain, directional dungeon passages, and generated Action Point map markers. Semantic roads compile connected orthogonal paths into the audited 132-146 endpoint, straight, bend, T-junction, and four-way grammar on supported outdoor landlooks. The generated all-tile adjacency audit supplies per-landlook usage, exact raw variants, directional neighbor weights, and authored examples as review evidence. Map operations reject out-of-bounds geometry, invalid region route references, diagonal or collapsed explicit semantic road segments, unknown or landlook-incompatible named content, unavailable variants, and non-serializable signed 16-bit tile values.

Do not require prompts to emit 8,100 tiles for normal map authoring. Add map operations:

- `fill`
- `rect`
- `line`
- `path`
- `stamp`
- `border`
- `region`
- `namedTile`
- `namedStamp`
- `semanticRoad`
- generated Action Point placement and map-cell marker synchronization

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
- scenario items and item text, including semantic item type names; future work is complete behavior presets and stock-item references
- complex encounters with groups, spell/item/word/action tests, and result scripts
- thief encounters
- timed encounters
- scenario items and item text
- scenario monsters and monster descriptions, including Monster Library templates, Normal/Monster/Mega variant generation, and icon asset references; future work is higher-level behavior presets
- spell, race, and caste overrides are implemented with strict fixed-size record fields

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

Status: the compiler returns structured diagnostics and allocations. New Project can preflight Scenario JSON without persistence, keeps parse/schema/build errors in the dialog, summarizes allocated families, and copies a versioned machine-readable report for correction. Optional report file export remains future host work.

## Phase 8: Fixtures And Gates

Add golden seed fixtures that assert:

- schema accepts valid examples and rejects malformed examples
- normalizer creates expected Project records
- semantic AP aliases produce expected opcodes and EDCD rows
- generated project validation succeeds
- browser scenario package export succeeds for generated fixtures
- existing AP coverage stays complete for manual opcodes 1-127 plus signed aliases

Status: seed fixtures, browser package fixtures, a generated-runtime-baseline gate, and a representative generation smoke matrix are implemented. The smoke matrix covers core keyed generation, semantic maps, encounters, timed behavior, rules overrides, Monster Library copying, Custom Library assets, and template inheritance. Every lane runs through compilation, versioned preflight reporting, project validation, generated runtime attachment, and both Windows and Mac browser package export. The generated baseline check separately verifies the startup file contract and fixed record capacities. Desktop coverage creates a blank project, exports it, and reimports the result through Providence.

## Remaining Design Decision

- How much higher-level map generation should use reusable deterministic templates versus prompt-supplied semantic terrain operations.
