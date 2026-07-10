# LLM Scenario Schema Next Plan

This plan follows the current seed implementation: strict schema, key-based references, map primitives, and semantic AP aliases that expand into normal Providence `Project` data.

## Goal

Make prompt-created scenarios useful beyond a small AP skeleton while keeping the model-facing JSON compact, strict, and repairable.

## Priority 1: Allocation Report And Fixtures

Status: implemented for the current seed families.

Add a structured allocation report to `createProjectFromScenarioSeed()`.

- Return allocated IDs by family: messages, quests, maps, battles, treasures, shops, action points, and later items/monsters/assets.
- Include explicit IDs and allocated IDs so callers can map every key to the final Realmz ID.
- Include unresolved references in structured diagnostics, not only string errors.
- Keep string `warnings` for UI display, but add machine-readable data for LLM repair loops.

Add golden seed fixtures.

- Valid minimal keyed seed.
- Valid map-operation seed.
- Valid AP alias seed covering direct actions.
- Valid AP alias seed covering EDCD-backed actions.
- Invalid unknown-key seed.
- Invalid unresolved-reference seed.
- Invalid out-of-range map coordinate seed.

Fixture assertions should cover:

- schema acceptance/rejection
- generated project record IDs
- generated map tiles
- generated AP opcodes
- generated EDCD rows
- project validation status

Implemented fixture coverage lives in `fixtures/scenario-seeds` and is checked by `scripts/check_scenario_seed_fixtures.mjs`.

## Priority 2: Simple Encounter Records

Status: implemented with semantic option scripts and an explicit raw fallback.

Seed-supported shape:

```json
{
  "key": "guard-parley",
  "prompt": "guard-warning",
  "options": [
    { "label": "Pay", "steps": [{ "kind": "takeGold", "amount": 10 }] },
    { "label": "Fight", "steps": [{ "kind": "battle", "battle": "guards" }] }
  ],
  "canBackOut": true,
  "maxTimes": 0
}
```

Implemented normalizer work:

- Allocates simple encounter IDs and reports them in `allocations.simpleEncounters`.
- Resolves prompt messages by key or numeric ID.
- Compiles up to four semantic options into `Data ED` display text, one-based choice results, and fixed eight-step result rows.
- Shares EDCD allocation across Simple Encounter, Complex Encounter, and Action Point scripts so generated settings references cannot collide.
- Retains `texts`, `choiceResults`, and `actions` as an exclusive raw fallback for evidence-backed low-level authoring.
- Allows AP `simpleEncounter` steps to reference simple encounters by key.
- Adds fixture coverage for semantic option compilation, raw fallback preservation, AP launch, prompt resolution, shared EDCD allocation, and invalid mixed forms.

## Priority 3: Items And Item Text

Status: implemented for scenario item records and item text.

Seed-supported shape:

```json
{
  "key": "bell-clapper",
  "itemId": 901,
  "name": "Bronze Clapper",
  "identifiedName": "Bronze Clapper",
  "description": "A heavy clapper from a buried temple bell.",
  "icon": 300,
  "type": 0,
  "cost": 50,
  "weight": 2
}
```

Implemented normalizer work:

- Allocates scenario item IDs in the custom `800..999` range while writing `Data NI` row IDs as `itemId - 800`.
- Creates `scenarioItems` from prompt-safe numeric fields.
- Creates `itemTexts` when names or descriptions are supplied.
- Allows treasure item slots, shop stock, and `awardRandomItems` AP aliases to reference item keys.
- Rejects item rows outside the scenario item range and mismatched `id`/`itemId` pairs.

Current coverage includes semantic `typeName` values and item icon asset-key references. Still future work: complete item templates with behavior defaults, stock-item references with no scenario row, and higher-level item behavior presets.

## Priority 4: Monster Records

Status: implemented for Normal `Data MD` scenario monster records and `Data DES` descriptions.

Seed-supported shape:

```json
{
  "key": "bell-wight",
  "name": "Bell Wight",
  "description": "An old temple guardian bound to the buried bell.",
  "hitDice": 3,
  "armor": 4,
  "agility": 12,
  "icon": 126,
  "exp": 200,
  "attacks": [{ "kind": "melee", "damage": [1, 6] }]
}
```

Implemented normalizer work:

- Allocates monster IDs and reports them in `allocations.monsters`.
- Creates Normal `Data MD` monster records from a prompt-safe subset plus array fields for attacks, flags, saves, spells, loot, and conditions.
- Creates `Data DES` monster descriptions when `description` is supplied.
- Allows battle `placements` to reference monsters by key and write signed grid IDs for friendly placements.
- Allows `addSpecialCharacter` and `dropSpecialCharacter` AP aliases to reference monsters by key.
- Allows monster loot item and weapon fields to reference item keys.

Current coverage includes stable Monster Library entry templates, inherited library descriptions, Normal-only/exact-copy/generated Monster and Mega variants, monster icon asset-key references, and combat macro aliases that reference monster keys. Still future work: friendlier behavior presets and stricter optional validation against scenario-specific battle placement limits.

## Priority 5: Asset And Library References

Status: implemented for stock Realmz references and caller-provided Providence Custom Library assets.

Add seed references to Providence custom library and reference assets.

Proposed shape:

```json
{
  "key": "bell-picture",
  "asset": "providence:buried-bell",
  "as": { "resourceType": "PICT", "resourceId": 30000 }
}
```

Implemented normalizer work:

- Resolve stock Realmz references without bundling.
- Resolve Providence custom library assets and copy them into scenario assets when needed.
- Reject or warn when a reference asset is not scenario-legal without bundling.
- Allow `picture`, `sound`, icon, and monster art fields to reference asset keys.

Current coverage resolves `picture`, `sound`, scrolling text, and sound-bearing AP fields by asset key. Stock resources remain ID-only and are not bundled. Custom Library assets are copied into Scenario Assets with scenario-safe IDs when the caller supplies the current workspace asset list.

Still future work: reference-catalog assets that are not stock Realmz resources and persistence hooks that copy desktop workspace payload files into a newly saved project directory. Item and monster icon key fields are implemented.

## Priority 6: More AP Aliases

Status: item possession, aggregate charge branching, and drop/charge/replace item mutation aliases are implemented and fixture-backed.

Implemented item group:

- `branchOnItem`
- `branchOnItemCharges`
- `dropItems`
- `changeItemCharges`
- `replaceItems`

Implemented condition group:

- `branchOnPartyCondition`
- `branchOnCharacterCondition`
- `branchOnTileParameter`

Implemented action-point mutation group:

- `copyActionPointSteps`
- `enableActionPoint`
- `disableActionPoint`
- `patchActionPoint` with keyed `extraActionPoints` sources

Implemented runtime-state group:

- `setDarkLevel`
- `alterGameTime`
- `branchOnGameTime`
- `boatCampStatus`
- `alterFatigue`
- `changeSpellPoints`
- `branchOnSpellPoints`

Implemented random encounter rectangle group:

- `alterRandomEncounterRectangle`
- `alterRandomRectangle`, including unchanged, absolute, offset, and warp geometry modes

Implemented battle outcome and routing group:

- `battleOutcome`
- `improvedBattleOutcome`
- `causeRout`, restricted to Extra Action Point battle or monster macros
- Existing improved `selectiveBattle` coward routing now resolves to Extra Action Points rather than ordinary Action Points

Implemented combat macro group:

- `battleMacroCriteria`
- `spawnMonsters`
- `destroyRelatedMonsters`
- `continueIfMonsterPresent`
- Combat-only aliases reject ordinary map Action Point context

Common spell casting, victory-point removal, picked-character alteration, cleric turning, dungeon navigation/view controls, battle exit, level-up, random-battle, and ally-state aliases are implemented. Add only remaining high-value semantic aliases after fixtures cover this expanded set.

Implemented encounter group:

- Thief/Rogue encounter records with keyed `Data TD2` allocation.
- All eight source-backed Rogue action slots with semantic names and success/failure result, message, and sound outcomes.
- Trap state, scope, damage, sound, spell, power, and Disarm Trap spell chance.
- Lock tumblers and Open Lock spell chance.
- Complex Encounter Rogue links now resolve keyed `Data TD2` records; the unconsumed `thieffail` compatibility byte remains zero.

Next group:

- Template source selection and reusable authoring presets for generated projects.

Rule: add aliases in groups with fixture coverage for opcode, ID, EDCD values, and target resolution.

## Priority 7: Higher-Level Map Authoring

Status: implemented for deterministic geometry, generated Action Point map markers, land Secret Area state, stock hidden-walkable terrain, and directional dungeon passages; broader semantic terrain selection remains future work.

Implemented author-friendly map operations:

- `border`
- `room`
- `road`
- `river`
- `stamp`

Implemented normalizer work:

- Keep all operations deterministic.
- Avoid LLM-created raw 8,100-tile arrays except for advanced use.
- Add fixtures that assert exact tile output for each operation.
- Reject operations that cross the 90 x 90 field boundary instead of silently clipping them.
- Reject map tile values outside the signed 16-bit Realmz field range.

Still future work:

- `terrainGroup`
- semantic tile names mapped through landlook metadata
- reusable named stamps or map templates

## Priority 8: Complex, Thief, And Timed Encounters

Status: simple, complex, Rogue, and timed encounter records are implemented and fixture-backed.

After simple encounters are stable:

- Simple encounters compile semantic option scripts and retain an exclusive raw action fallback.
- Complex encounters support physical, typed-word, spell, item, and Rogue response routing; keyed allocation; semantic result scripts; and raw action fallback.
- Rogue encounters cover all eight source-backed action slots plus trap and lock settings.
- Timed encounters support schedules, macros, item/quest gates, and location gates.
- Reuse AP step aliases for result scripts where possible.

These should be fixture-gated because the record shapes are larger and easier to misuse.

## Priority 9: Template Source Selection

Status: implemented for the blank base and caller-provided Providence project templates.

Generated scenarios can initialize from:

- empty browser shell
- selected Providence scenario template
- imported scenario baseline supplied by the host as a Providence project

The seed should eventually support:

```json
{
  "baseTemplate": "empty-realmz-scenario"
}
```

Implemented behavior:

- `blank` remains the default and uses Providence's normal new-project shell.
- Other keys resolve only through the caller's `baseTemplates` registry; unavailable keys fail with a structured diagnostic.
- Providence clones the selected project so generation cannot mutate the reusable template.
- Omitted record families inherit from the template; explicitly present families replace inherited records, including explicit empty arrays.
- Map Action Points and Extra Action Points inherit or replace independently.
- New EDCD settings append after inherited rows to avoid collisions across template and generated scripts.
- The allocation report identifies the selected template key.

Still host-level work:

- Persist and restore raw-source payloads that live outside imported project JSON.
- Expose a template picker and registry management UI when prompt-based generation is added to the application.

## Acceptance Gates

Every phase should pass:

- `node scripts/check_scenario_seed_schema.mjs`
- `npm run typecheck`
- `npm run build`
- targeted fixture script for generated seed projects
- `git diff --check`

For phases that affect exportable records, also run:

- `node scripts/check_browser_scenario_package.mjs`

## Recommended Next Commit Scope

Commit the Rogue encounter, semantic Simple Encounter, and base-template increments together after reviewing the expanded seed contract.
