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

Status: implemented for the current raw simple encounter record shape.

Seed-supported shape:

```json
{
  "key": "guard-parley",
  "prompt": "guard-warning",
  "texts": ["Pay", "Fight"],
  "choiceResults": [1, 2],
  "actions": [
    { "slot": 0, "rawCode": 33, "id": 10 },
    { "slot": 1, "rawCode": 2, "id": 0 }
  ],
  "canBackOut": true,
  "maxTimes": 0
}
```

Implemented normalizer work:

- Allocates simple encounter IDs and reports them in `allocations.simpleEncounters`.
- Resolves prompt messages by key or numeric ID.
- Emits `Data ED`-compatible simple encounter records with option text, choice results, raw encounter actions, backing-out, attempt-limit, and caste-success fields.
- Allows AP `simpleEncounter` steps to reference simple encounters by key.
- Adds fixture coverage for simple encounter AP launch, prompt resolution, option results, and raw encounter action rows.

Still future work: higher-level option scripts that compile semantic AP aliases into the existing encounter action/result structure.

Future proposed shape:

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

Future normalizer work:

- Convert option scripts into the existing simple encounter action/result structure.
- Add fixtures for semantic option-result scripts.

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

Still future work: friendlier item templates by kind, stock-item references with no scenario row, item icon asset-key references, and higher-level item behavior presets.

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

Still future work: alternate Monster/Mega sets, monster-library template references, monster icon asset-key references, friendlier behavior presets, combat macro aliases that reference monster keys, and stricter optional validation against scenario-specific battle placement limits.

## Priority 5: Asset And Library References

Add seed references to Providence custom library and reference assets.

Proposed shape:

```json
{
  "key": "bell-picture",
  "asset": "providence:buried-bell",
  "as": { "resourceType": "PICT", "resourceId": 30000 }
}
```

Normalizer work:

- Resolve stock Realmz references without bundling.
- Resolve Providence custom library assets and copy them into scenario assets when needed.
- Reject or warn when a reference asset is not scenario-legal without bundling.
- Allow `picture`, `sound`, icon, and monster art fields to reference asset keys.

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

Add remaining high-value AP semantic aliases after fixtures cover the current set.

Next groups:

- action point enable/disable, AP copy, AP patch
- dark/LOS, camping/boat status, game time, fatigue, spell points
- random rectangle mutation and rectangle resizing
- battle outcome/flee/coward routing variants
- combat macro-only aliases with explicit macro context

Rule: add aliases in groups with fixture coverage for opcode, ID, EDCD values, and target resolution.

## Priority 7: Higher-Level Map Authoring

Status: implemented for deterministic geometry-level authoring; semantic terrain selection remains future work.

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

After simple encounters are stable:

- Add complex encounter seed records.
- Add thief encounter seed records.
- Add timed encounter seed records.
- Reuse AP step aliases for result scripts where possible.

These should be fixture-gated because the record shapes are larger and easier to misuse.

## Priority 9: Template Source Selection

Decide how generated scenarios are initialized:

- empty browser shell
- selected Providence scenario template
- imported scenario baseline

The seed should eventually support:

```json
{
  "baseTemplate": "empty-realmz-scenario"
}
```

Template choice affects available stock assets, default records, rules, and export behavior.

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

Continue Priority 6 with action-point enable/disable, AP copy, and AP patch aliases. Keep raw opcodes available as the fallback while each semantic alias is added.
