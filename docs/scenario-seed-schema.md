# Scenario Seed Schema

Providence can harden prompt-generated scenario creation by asking a model for a small scenario seed instead of the full `.providence/project.json` shape. The seed is strict, author-facing JSON. `src/editor/scenarioSeed.ts` validates it, rejects unknown fields, and expands it into the current `Project` format with Realmz-sized records, inferred provenance, EDCD settings rows, default map data, structured allocation output, and the normal browser project validator.

Schema: [`schemas/scenario-seed.schema.json`](../schemas/scenario-seed.schema.json)

Expanded roadmap: [`docs/llm-scenario-schema-plan.md`](llm-scenario-schema-plan.md)

## Supported Seed Content

- Scenario identity and contact metadata.
- Fixed-size Realmz maps, either filled by one tile or supplied as 8,100 tile IDs.
- Map operations: `fill`, `rect`, `line`, `path`, `border`, `room`, `road`, `river`, and `stamp`.
- Named map regions that action points can reference with `at`.
- Messages and quest labels.
- Battle, treasure, and shop records.
- Scenario item records in the custom item range `800..999`, with generated item text records when names/descriptions are supplied.
- Stock Realmz resource references and Providence Custom Library asset references through keyed `assets` declarations.
- Treasure, shop stock, and item-related AP steps can reference item keys.
- Normal scenario monster records with generated monster descriptions, keyed item/weapon references, keyed battle placements, and keyed `addSpecialCharacter` / `dropSpecialCharacter` AP references.
- Simple encounter records with prompt message references, up to four option strings/results, raw encounter action rows, backing-out and attempt-limit fields.
- Complex encounter records with keyed prompts, physical/word/spell/item/Rogue response routing, four semantic result scripts, and a raw 32-slot fallback.
- Timed encounter records with schedules, keyed Extra Action Point macros, item/quest requirements, and optional land/dungeon location gates.
- Action points with up to eight steps.
- Extra Action Points (`Data ED3`) with up to eight steps, usable as patch sources.
- Prompt-safe direct AP steps: `message`, `simpleEncounter`, `complexEncounter`, `shop`, `treasure`, `sound`, `picture`, `scrollingText`, `victoryPoints`, `temple`, `banking`, `displayMap`, `pickCharacters`, `returnGosub`, `popStack`, `addSpecialCharacter`, `dropSpecialCharacter`, `setQuestFlag`, `copyActionPointSteps`, `enableActionPoint`, `disableActionPoint`, and `raw`.
- Prompt-safe EDCD-backed AP steps: `battle`, `teleport`, `randomMessage`, `selectiveBattle`, `battleOutcome`, `improvedBattleOutcome`, `causeRout`, `battleMacroCriteria`, `spawnMonsters`, `destroyRelatedMonsters`, `alterTimedEncounter`, `branchOnQuest`, `questValue`, `branchOnQuestValue`, `branchOnRandom`, `branchOnPercent`, `changeTile`, `healHurtParty`, `takeGold`, `giveCondition`, `awardRandomItems`, `branchOnItem`, `branchOnItemCharges`, `dropItems`, `changeItemCharges`, `replaceItems`, `branchOnPartyCondition`, `branchOnCharacterCondition`, `branchOnTileParameter`, `patchActionPoint`, `alterRandomEncounterRectangle`, `alterRandomRectangle`, `enterExitDungeon`, and `edcd`.

EDCD-backed seed steps create `Data EDCD` settings rows automatically because those Realmz opcodes point at settings, not directly at the visible target.

Map operations are applied in array order. `border` supports inward `thickness`; `room` fills an interior, draws its walls, and replaces wall cells with side/offset doors; `road` and `river` draw a polyline with an optional width; and `stamp` places a rectangular two-dimensional tile pattern. Operations that extend beyond the 90 x 90 field are rejected rather than clipped. Tile values must fit Realmz's signed 16-bit map-cell range (`-32768..32767`).

`createProjectFromScenarioSeed()` returns an `allocations` report that maps every keyed record to its final Realmz ID or map coordinate target. Callers should use that report for LLM repair loops and UI summaries instead of trying to infer allocated IDs from the generated project.

Item possession and charge branches use `targetKind` values `actionPoint`, `simpleEncounter`, or `complexEncounter`. `branchOnItem` defaults missing-item behavior to `continue`; use `missingBehavior: "branch"` with a target or `missingBehavior: "message"` with a message key for the other Realmz behaviors. In `branchOnItemCharges`, an omitted `enoughTarget` or `insufficientTarget` compiles to `-1`, meaning continue the current script for that outcome. Item mutation is split into `dropItems`, `changeItemCharges`, and `replaceItems`, so prompt output never needs to supply opcode 22's numeric mutation mode.

Condition branches use source-backed runtime behavior. `branchOnPartyCondition` accepts numeric conditions `0..8` or semantic names such as `freeFallLevitate`, with `when` set to `present` or `absent`. `branchOnCharacterCondition` checks condition slots `0..39` against the whole `party`, the currently `picked` characters, or a manual-compatible numeric position `1..6`; both outcomes must name an action point. `branchOnTileParameter` accepts `shoreline`, `boatRequired`, `path`, `blocksLos`, `flyFloatRequired`, `forest`, or `tileId`. A `tileId` test requires a normalized standard landlook tile from `0..200`. Realmz reserves target ID `0` as “no branch” for opcode 78, so explicit or keyed tile-branch destinations that resolve to zero are rejected.

Action-point mutation steps are context-aware. `copyActionPointSteps` copies action slots from another Action Point on the same map; `enableActionPoint` and `disableActionPoint` write opcode 13's percent state for a map target; and `patchActionPoint` copies the action slots from a keyed `extraActionPoints` (`Data ED3`) record into a map Action Point. Opcode 13's single-target field cannot address Action Point 0 because Realmz uses zero as its no-single-target sentinel.

Runtime-state aliases are also available: `setDarkLevel` changes the current land level's dark state (LOS fields remain raw-only because the audited dispatcher does not consume them); `alterGameTime` sets or offsets day/hour/minute; `branchOnGameTime` targets keyed Extra Action Points; `boatCampStatus` checks boat/camping state and can set boat state; `alterFatigue` applies Realmz's maximum, minimum, or percentage mode; `changeSpellPoints` applies random rolls to picked characters; and `branchOnSpellPoints` tests picked or alive characters and branches to a keyed Extra Action Point.

Random encounter regions have two semantic aliases. `alterRandomEncounterRectangle` changes a land or dungeon rectangle's encounter rate and optionally its battle range; `dungeon: true` selects Realmz's signed dungeon opcode. `alterRandomRectangle` changes the encounter percentage and emits the paired settings rows required for rectangle geometry. Its `shape` can be `unchanged`, `absolute`, `offset`, or `warp`, with coordinate validation kept inside the 90 x 90 map bounds.

Battle outcome aliases keep Realmz's field order out of prompt output. `battleOutcome` uses opcode 56 and branches to an Extra Action Point when the party flees or cowards out; without a coward macro it preserves Realmz's backstep behavior. `improvedBattleOutcome` uses opcode 107 and places the optional coward macro in its fifth field. `causeRout` uses opcode 123 and is restricted to Extra Action Point battle or monster macros, with up to five keyed monster references.

Combat macro aliases are context-restricted. `battleMacroCriteria` uses opcode 126 to activate a fixed or random Extra Action Point after a round, by chance, or on flee/failure. `spawnMonsters` uses opcode 124 with optional random counts, sounds, and traitor overrides; `destroyRelatedMonsters` uses opcode 125; and `continueIfMonsterPresent` uses direct opcode 127. These steps are rejected in ordinary map Action Points.

Asset declarations separate runtime references from scenario-owned resources. A `stock` asset stores a resource type and existing Realmz ID; it can be referenced by key but is never copied into `project.assets`. A `custom-library` asset names a stable workspace asset ID and optionally requests a scenario resource ID. Callers pass the available Custom Library assets through `createProjectFromScenarioSeed(..., { customAssets })`; Providence then copies matching non-stock assets into Scenario Assets, allocates scenario-safe IDs when omitted, and rejects missing assets, wrong asset kinds, and invalid picture, sound, or special-land-tile IDs.

Timed encounters use source `Data TD3` records. `day` must be nonzero, `increment` defaults to zero, `percent` defaults to 100, and `macro` resolves a keyed Extra Action Point. Optional item and quest keys compile to their Realmz IDs. Location is either `any` or a land/dungeon level with optional random-rectangle and paired coordinate gates. `alterTimedEncounter` compiles opcode 54 and can change chance, repeat interval, or reset the next activation relative to the current day.

Complex encounters use source `Data ED2` records and expose author concepts instead of parallel storage arrays. `physicalActions` supplies up to eight labels, while `requiredPhysicalActions` uses one-based choice numbers and `physicalResult` selects result 1 through 4. Optional `word`, `spells`, `items`, and `thief` responses route their outcomes to the same four results. Each `results` entry contains up to eight normal semantic AP steps; Providence compiles them into that result's fixed eight-slot script row and allocates any required EDCD settings. Use `actions` only for an explicit raw 32-slot fallback; raw actions and semantic results cannot be combined. Item responses resolve scenario item keys, and AP `complexEncounter` steps resolve complex encounter keys.

## Example

```json
{
  "schemaVersion": 1,
  "scenario": {
    "name": "The Bell Under Bywater",
    "author": "Providence",
    "version": "0.1",
    "description": "A small test scenario generated from a prompt-safe seed."
  },
  "maps": [
    {
      "key": "bywater-road",
      "levelType": "land",
      "index": 0,
      "name": "Bywater Road",
      "landlook": 0,
      "fillTile": 1,
      "regions": [
        { "key": "bell-crossing", "x": 44, "y": 50 }
      ],
      "operations": [
        { "kind": "road", "points": [{ "x": 38, "y": 50 }, { "x": 50, "y": 50 }], "tile": 4, "width": 3 }
      ]
    }
  ],
  "messages": [
    {
      "key": "bell-hums",
      "text": "A bronze bell hums below the road."
    },
    {
      "key": "arrival-cold",
      "text": "The air snaps cold as the party arrives."
    }
  ],
  "quests": [
    {
      "key": "heard-bell",
      "label": "Heard the buried bell"
    }
  ],
  "battles": [
    {
      "key": "bell-guardians",
      "dist": 4,
      "placements": [
        { "x": 6, "y": 6, "monster": "bell-wight" }
      ],
      "messageBefore": 1
    }
  ],
  "monsters": [
    {
      "key": "bell-wight",
      "name": "Bell Wight",
      "description": "An old temple guardian bound to the buried bell.",
      "hitDice": 3,
      "stamina": 12,
      "staminaMax": 12,
      "agility": 12,
      "iconId": 126,
      "exp": 200,
      "attacks": [[1, 6, 0, 0]],
      "items": ["bell-clapper"]
    }
  ],
  "treasures": [
    {
      "key": "bell-cache",
      "itemIds": ["bell-clapper"],
      "gold": 50
    }
  ],
  "items": [
    {
      "key": "bell-clapper",
      "itemId": 901,
      "identifiedName": "Bronze Clapper",
      "description": "A heavy clapper from a buried temple bell.",
      "iconId": 300,
      "type": 1,
      "cost": 50,
      "weight": 2
    }
  ],
  "simpleEncounters": [
    {
      "key": "bell-choice",
      "prompt": "bell-hums",
      "texts": ["Listen", "Leave"],
      "choiceResults": [1, 0],
      "canBackOut": true,
      "actions": [
        { "slot": 0, "rawCode": 1, "id": 0 }
      ]
    }
  ],
  "actionPoints": [
    {
      "key": "bell-crossing-ap",
      "map": "bywater-road",
      "at": "bell-crossing",
      "steps": [
        { "kind": "message", "message": "bell-hums" },
        { "kind": "battle", "battle": "bell-guardians", "message": "bell-hums" },
        { "kind": "setQuestFlag", "quest": "heard-bell" },
        { "kind": "treasure", "treasure": "bell-cache" },
        { "kind": "simpleEncounter", "encounter": "bell-choice" },
        { "kind": "teleport", "landLevel": 0, "x": 45, "y": 50, "message": "arrival-cold" }
      ]
    }
  ]
}
```

## Prompting Guidance

Ask a model to emit only this seed JSON. Do not ask for full Providence project JSON: the full project includes raw record preservation, parser diagnostics, semantic indices, resource catalogs, and editor metadata that should be constructed by Providence, not invented by a prompt.

For first-pass generation, prefer a small number of maps, messages, and APs. Use `raw` only when the prompt has a known Realmz opcode and ID that Providence does not yet expose as a prompt-safe step.

Golden examples live in [`fixtures/scenario-seeds`](../fixtures/scenario-seeds). Run `node scripts/check_scenario_seed_fixtures.mjs` to verify parser failures, allocation output, map operations, AP opcodes, and EDCD row generation.
