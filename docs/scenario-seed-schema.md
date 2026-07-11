# Scenario Seed Schema

Providence can harden prompt-generated scenario creation by asking a model for a small scenario seed instead of the full `.providence/project.json` shape. The seed is strict, author-facing JSON. `src/editor/scenarioSeed.ts` validates it, rejects unknown fields, and expands it into the current `Project` format with Realmz-sized records, inferred provenance, EDCD settings rows, default map data, structured allocation output, and the normal browser project validator.

Schema: [`schemas/scenario-seed.schema.json`](../schemas/scenario-seed.schema.json)

Expanded roadmap: [`docs/llm-scenario-schema-plan.md`](llm-scenario-schema-plan.md)

## Supported Seed Content

- Scenario identity and contact metadata.
- Optional caller-provided base template selection without embedding full Providence project JSON in prompt output.
- Fixed-size Realmz maps, either filled by one tile or supplied as 8,100 tile IDs.
- Map operations: `fill`, `rect`, `line`, `path`, `border`, `room`, `road`, `river`, `semanticRoad`, `stamp`, `namedStamp`, `namedTile`, `terrainGroup`, `landSecret`, `hiddenWalkable`, `combatClearing`, and `dungeonPassage`.
- Named map regions that action points can reference with `at`.
- Messages and quest labels.
- Battle, treasure, and shop records.
- Scenario item records in the custom item range `800..999`, with generated item text records when names/descriptions are supplied and semantic `typeName` values for Realmz item types.
- Stock Realmz resource references and Providence Custom Library asset references through keyed `assets` declarations.
- Treasure, shop stock, and item-related AP steps can reference item keys.
- Normal scenario monster records created directly or from stable Monster Library `libraryEntry` IDs, with generated/inherited monster descriptions, keyed item/weapon/icon references, keyed battle placements, and keyed `addSpecialCharacter` / `dropSpecialCharacter` AP references.
- Simple encounter records with up to four semantic option scripts, shared EDCD allocation, and an exclusive raw record fallback.
- Complex encounter records with keyed prompts, physical/word/spell/item/Rogue response routing, four semantic result scripts, and a raw 32-slot fallback.
- Rogue encounter records with all eight source-backed action tests, success/failure result routing, keyed text and sound feedback, trap effects, and lock settings.
- Timed encounter records with schedules, keyed Extra Action Point macros, item/quest requirements, and optional land/dungeon location gates.
- Scenario spell overrides with keyed allocation, names/descriptions, combat/camp availability, and the complete numeric `Data Spell` field set.
- Scenario race and caste overrides with keyed allocation, strict fixed-array dimensions, Rules defaults, generated display names, and keyed caste starting-item references.
- Action points with up to eight steps.
- Extra Action Points (`Data ED3`) with up to eight steps, usable as patch sources.
- Prompt-safe direct AP steps: `message`, `simpleEncounter`, `complexEncounter`, `shop`, `treasure`, `sound`, `picture`, `scrollingText`, `victoryPoints`, `temple`, `banking`, `displayMap`, `pickCharacters`, `returnGosub`, `popStack`, `addSpecialCharacter`, `dropSpecialCharacter`, `setQuestFlag`, `copyActionPointSteps`, `enableActionPoint`, `disableActionPoint`, and `raw`.
- Prompt-safe EDCD-backed AP steps: `battle`, `teleport`, `randomMessage`, `selectiveBattle`, `battleOutcome`, `improvedBattleOutcome`, `causeRout`, `battleMacroCriteria`, `spawnMonsters`, `destroyRelatedMonsters`, `alterTimedEncounter`, `branchOnQuest`, `questValue`, `branchOnQuestValue`, `branchOnRandom`, `branchOnPercent`, `changeTile`, `healHurtParty`, `takeGold`, `giveCondition`, `awardRandomItems`, `branchOnItem`, `branchOnItemCharges`, `dropItems`, `changeItemCharges`, `replaceItems`, `branchOnPartyCondition`, `branchOnCharacterCondition`, `branchOnTileParameter`, `patchActionPoint`, `alterRandomEncounterRectangle`, `alterRandomRectangle`, `enterExitDungeon`, `castSpell`, `takeVictoryPoints`, `alterPicked`, and `edcd`.
- Prompt-safe runtime controls include `clericTurning`, `dropAllEquipment`, `compass`, `faceDirection`, `dungeonView`, `endBattle`, `backUpParty`, `levelUpPicked`, `randomBattles`, and `allies`.

EDCD-backed seed steps create `Data EDCD` settings rows automatically because those Realmz opcodes point at settings, not directly at the visible target.

Map operations are applied in array order. `border` supports inward `thickness`; `room` fills an interior, draws its walls, and replaces wall cells with side/offset doors; raw `road` and `river` draw a polyline with an explicit tile and optional width; and `stamp` places a rectangular two-dimensional tile pattern. `semanticRoad` accepts one or more orthogonal `paths` and compiles their combined topology into audited endpoint, straight, bend, T-junction, and four-way road tiles. Put every path that should join into one operation. It supports Plains, Alternate Plains, Subterranean, Desert, Swamp, and Snow; Castle and custom landlooks are rejected until their road grammars are audited. Bridges remain explicit named tiles or stamps rather than being inferred from surrounding water. `namedStamp` places a reusable audited multi-tile composition by stable name, with its `{x, y}` coordinate as the top-left anchor. Its vocabulary includes Castle furnishings and open doors plus stock special-tile buildings and landmarks. `long-table` and `tall-tree` provide 1-based variants. The parser rejects unknown names, landlook-incompatible compositions, unavailable variants, dungeon placement, and footprints crossing the map edge. The registry resolves through the same built-in definitions used by the map painter and is implemented in [`src/editor/map/namedLandStamps.ts`](../src/editor/map/namedLandStamps.ts).

`namedTile` places one audited semantic tile by stable name and resolves it through the map's landlook, so a prompt can request `land-to-cave-cave-south`, `grave`, `alchemy-table`, or another registry name without knowing the numeric tile ID. Optional `variant` is 1-based and selects among visually interchangeable or audited alternatives. The parser rejects unknown names, names unavailable for the selected landlook, and unavailable variants rather than substituting a plausible tile. The complete stable vocabulary is enforced by the JSON Schema and implemented in [`src/editor/map/namedLandTiles.ts`](../src/editor/map/namedLandTiles.ts).

`terrainGroup` accepts `water`, `mountains`, or `forest` plus rectangular or path geometry and deterministically compiles it through the checked-in landlook terrain profile, so prompts do not need exact transition tile IDs. Reviewed semantic terrain profiles cover Plains, Alternate Plains, Subterranean, Desert, Swamp, and Snow; Castle uses its audited architectural `namedTile` vocabulary plus explicit tiles and stamps. Land maps also support independent `landSecret` hidden/revealed state. `hiddenWalkable` places landlook-valid concealed walkable terrain, including Plains/Swamp/Snow 169, Castle 96, and Desert 169 or 184. `combatClearing` places landlook-valid exploration structures whose Realmz 3 x 3 combat builds clear to walkable battle terrain, including Plains/Swamp/Snow 180-185, Castle 59-65, and Desert 180-183 or 185. Dungeon maps support directional `dungeonPassage` movement. Generated Action Points synchronize their land thousand-band or dungeon bitfield marker into the owning map cell without erasing Secret Area or passage state. Operation coordinates always use visual `{x, y}` map coordinates; Providence handles Realmz's different land and dungeon storage order internally. Operations that extend beyond the 90 x 90 field are rejected rather than clipped. Tile values must fit Realmz's signed 16-bit map-cell range (`-32768..32767`).

`createProjectFromScenarioSeed()` returns an `allocations` report that identifies the selected base template and maps every keyed record to its final Realmz ID or map coordinate target. Callers should use that report for LLM repair loops and UI summaries instead of trying to infer allocated IDs from the generated project.

`baseTemplate` defaults to `blank`. Any other value must match a caller-provided project in `createProjectFromScenarioSeed(..., { baseTemplates })`; Providence clones that project before applying the seed. Omitted seed families inherit the template family, while an explicitly present family, including an empty array, replaces it. Map Action Points and Extra Action Points inherit or replace independently. Existing template EDCD rows are preserved and newly compiled settings append after the highest inherited ID. Inherited records and assets do not carry seed keys, so new seed content references them by numeric Realmz ID; key references apply to records declared in the current seed. Imported scenarios can serve as caller-provided templates after import, but the host remains responsible for retaining any external raw-source payloads associated with that project.

Item possession and charge branches use `targetKind` values `actionPoint`, `simpleEncounter`, or `complexEncounter`. `branchOnItem` defaults missing-item behavior to `continue`; use `missingBehavior: "branch"` with a target or `missingBehavior: "message"` with a message key for the other Realmz behaviors. In `branchOnItemCharges`, an omitted `enoughTarget` or `insufficientTarget` compiles to `-1`, meaning continue the current script for that outcome. Item mutation is split into `dropItems`, `changeItemCharges`, and `replaceItems`, so prompt output never needs to supply opcode 22's numeric mutation mode.

Condition branches use source-backed runtime behavior. `branchOnPartyCondition` accepts numeric conditions `0..8` or semantic names such as `freeFallLevitate`, with `when` set to `present` or `absent`. `branchOnCharacterCondition` checks condition slots `0..39` against the whole `party`, the currently `picked` characters, or a manual-compatible numeric position `1..6`; both outcomes must name an action point. `branchOnTileParameter` accepts `shoreline`, `boatRequired`, `path`, `blocksLos`, `flyFloatRequired`, `forest`, or `tileId`. A `tileId` test requires a normalized standard landlook tile from `0..200`. Realmz reserves target ID `0` as “no branch” for opcode 78, so explicit or keyed tile-branch destinations that resolve to zero are rejected.

Action-point mutation steps are context-aware. `copyActionPointSteps` copies action slots from another Action Point on the same map; `enableActionPoint` and `disableActionPoint` write opcode 13's percent state for a map target; and `patchActionPoint` copies the action slots from a keyed `extraActionPoints` (`Data ED3`) record into a map Action Point. Opcode 13's single-target field cannot address Action Point 0 because Realmz uses zero as its no-single-target sentinel.

Runtime-state aliases are also available: `setDarkLevel` changes the current land level's dark state (LOS fields remain raw-only because the audited dispatcher does not consume them); `alterGameTime` sets or offsets day/hour/minute; `branchOnGameTime` targets keyed Extra Action Points; `boatCampStatus` checks boat/camping state and can set boat state; `alterFatigue` applies Realmz's maximum, minimum, or percentage mode; `changeSpellPoints` applies random rolls to picked characters; and `branchOnSpellPoints` tests picked or alive characters and branches to a keyed Extra Action Point.

Random encounter regions have two semantic aliases. `alterRandomEncounterRectangle` changes a land or dungeon rectangle's encounter rate and optionally its battle range; `dungeon: true` selects Realmz's signed dungeon opcode. `alterRandomRectangle` changes the encounter percentage and emits the paired settings rows required for rectangle geometry. Its `shape` can be `unchanged`, `absolute`, `offset`, or `warp`, with coordinate validation kept inside the 90 x 90 map bounds.

Battle outcome aliases keep Realmz's field order out of prompt output. `battleOutcome` uses opcode 56 and branches to an Extra Action Point when the party flees or cowards out; without a coward macro it preserves Realmz's backstep behavior. `improvedBattleOutcome` uses opcode 107 and places the optional coward macro in its fifth field. `causeRout` uses opcode 123 and is restricted to Extra Action Point battle or monster macros, with up to five keyed monster references.

Combat macro aliases are context-restricted. `battleMacroCriteria` uses opcode 126 to activate a fixed or random Extra Action Point after a round, by chance, or on flee/failure. `spawnMonsters` uses opcode 124 with optional random counts, sounds, and traitor overrides; `destroyRelatedMonsters` uses opcode 125; and `continueIfMonsterPresent` uses direct opcode 127. These steps are rejected in ordinary map Action Points.

Asset declarations separate runtime references from scenario-owned resources. A `stock` asset stores a resource type and existing Realmz ID; it can be referenced by key but is never copied into `project.assets`. A `custom-library` asset names a stable workspace asset ID and optionally requests a scenario resource ID. Callers pass the available Custom Library assets through `createProjectFromScenarioSeed(..., { customAssets })`; Providence then copies matching non-stock assets into Scenario Assets, allocates scenario-safe IDs when omitted, and rejects missing assets, wrong asset kinds, and invalid picture, sound, or special-land-tile IDs. Scenario item and monster `icon` fields accept these asset keys, while `iconId` remains available for an explicit numeric cicn ID.

Scenario items can use `typeName` instead of Realmz's numeric `type`. Names include `meleeWeapon`, `shield`, `armorOrRobe`, `missileWeapon`, `magicItem`, `supplyItem`, `actionPointItem`, and the other editor item-type labels. Supplying both `type` and `typeName` is rejected rather than silently choosing one.

Scenario monsters can name a stable Monster Library entity ID in `libraryEntry`. The host supplies the current workspace catalog through `createProjectFromScenarioSeed(..., { libraryCatalog })`. Providence copies the normalized library monster and description into scenario-owned records, assigns the seed's scenario monster ID, and applies explicit seed fields as overrides. `variants` can be `normalOnly`, `copyAll`, or `generated`; the latter two reuse Combat's existing exact-copy or scaled Monster/Mega variant behavior. Missing or malformed library entries return structured diagnostics; generated scenarios never retain a runtime dependency on the external library.

Timed encounters use source `Data TD3` records. `day` must be nonzero, `increment` defaults to zero, `percent` defaults to 100, and `macro` resolves a keyed Extra Action Point. Optional item and quest keys compile to their Realmz IDs. Location is either `any` or a land/dungeon level with optional random-rectangle and paired coordinate gates. `alterTimedEncounter` compiles opcode 54 and can change chance, repeat interval, or reset the next activation relative to the current day.

Simple encounters use source `Data ED` records. `options` accepts one to four labels with normal semantic AP `steps`; Providence assigns each option to its corresponding result row and compiles up to eight steps into that row. EDCD-backed steps share the same allocation sequence used by Complex Encounters and later Action Points. Use `texts`, `choiceResults`, and `actions` only as an explicit raw fallback; semantic and raw forms cannot be combined. Raw choice results are limited to result rows `1..4`, zero for an unavailable option, and the source-backed `-4` auto-run Result 4 sentinel in Option 1 only.

Complex encounters use source `Data ED2` records and expose author concepts instead of parallel storage arrays. `physicalActions` supplies up to eight labels, while `requiredPhysicalActions` uses one-based choice numbers and `physicalResult` selects result 1 through 4. Optional `word`, `spells`, and `items` responses route their outcomes to the same four results. A `thief` response names a keyed `thiefEncounters` record; the Rogue encounter's action outcomes return result numbers into these result columns. Each `results` entry contains up to eight normal semantic AP steps; Providence compiles them into that result's fixed eight-slot script row and allocates any required EDCD settings. Use `actions` only for an explicit raw 32-slot fallback; raw actions and semantic results cannot be combined. Item responses resolve scenario item keys, and AP `complexEncounter` steps resolve complex encounter keys.

Rogue encounters use source `Data TD2` records. Their semantic action kinds map in Realmz source order: `acrobaticAct`, `detectTrap`, `disarmTrap`, `hearNoise`, `forceLock`, `moveSilently`, `pickLock`, and `pickPocket`. Every enabled action requires success and failure behavior, and each outcome can return result 1 through 4, display a keyed message, play a keyed sound, or combine those effects. `trap` controls armed state, party scope, damage, sound, spell, spell power, and Disarm Trap spell chance. `lock` controls the six-tumbler maximum and Open Lock spell chance. Generated Rogue IDs start at 1 and are limited to 127 because the Complex Encounter link is a signed byte and Realmz treats zero as a non-persistent target.

## Example

```json
{
  "schemaVersion": 1,
  "baseTemplate": "blank",
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
        {
          "kind": "semanticRoad",
          "paths": [
            [{ "x": 38, "y": 50 }, { "x": 50, "y": 50 }],
            [{ "x": 44, "y": 46 }, { "x": 44, "y": 54 }]
          ]
        },
        { "kind": "namedStamp", "x": 40, "y": 46, "name": "wooden-lookout-tower" },
        { "kind": "namedTile", "x": 44, "y": 49, "name": "land-to-cave-cave-south" },
        { "kind": "namedTile", "x": 46, "y": 52, "name": "grave", "variant": 2 },
        { "kind": "terrainGroup", "terrain": "forest", "geometry": { "kind": "rect", "x": 52, "y": 44, "width": 8, "height": 12 } }
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
      "options": [
        {
          "label": "Listen",
          "steps": [{ "kind": "message", "message": "bell-hums" }]
        },
        {
          "label": "Leave",
          "steps": [{ "kind": "message", "message": "arrival-cold" }]
        }
      ],
      "canBackOut": true,
      "maxTimes": 0
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

Golden examples live in [`fixtures/scenario-seeds`](../fixtures/scenario-seeds). Run `node scripts/check_scenario_seed_fixtures.mjs` to verify parser failures, allocation output, map operations, AP opcodes, and EDCD row generation. Run `npm run smoke:scenario-generation` for the representative compile, preflight, project-validation, generated-runtime, and Windows/Mac package-export matrix.
