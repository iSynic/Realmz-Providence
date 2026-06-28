# Rules Manual Parity Audit

Focused pass for Divinity Manual chapters 29-31: Spell Editor, Race Editor, and Caste Editor. Providence parity here means equivalent modern Realmz scenario-authoring capability, not pixel-for-pixel Divinity layout.

Status vocabulary:

- `covered`: Providence exposes the source-backed authoring behavior.
- `label-fix`: Behavior is present, but the UI label needed adjustment.
- `ui-gap`: Parsed/exported data exists, but the authoring affordance still needs improvement.
- `validation-gap`: Authoring exists, but warnings or bounds checks need improvement.
- `resource-gated`: The field depends on resource-fork/name packaging that should stay deferred until fixture-backed.
- `fixture-gated`: Likely authorable, but needs Divinity before/after or source confirmation.
- `defer`: Not part of the current low-risk pass.

Primary evidence:

- `docs/generated/rules-spell-race-caste-evidence.json`
- `docs/generated/core-rules-record-evidence.json`
- `src/editor/panels/rules/SpellRulesEditor.tsx`
- `src/editor/panels/rules/RaceRulesEditor.tsx`
- `src/editor/panels/rules/CasteRulesEditor.tsx`
- `src/editor/browser/project.ts`
- `src-tauri/src/realmz.rs`
- `src-tauri/tests/fixture_roundtrip.rs`

## Spell Editor

Manual claim summary:

Divinity browses shared spell catalogs, prevents direct editing of standard spells, and lets authors copy or create custom spells. The editable record covers range, hit/DRV modifiers, attacks, rotation, resist behavior, cost, damage, duration, spell class, damage type, target/casting flags, target size/effect, name/text, sounds, and icons.

| Divinity label/control | Providence label/control | Backing record/field | Evidence | Status | Follow-up |
| --- | --- | --- | --- | --- | --- |
| Spell Class catalog | `Spellcaster Class` picker | packed spell ID class, shared `Data S` or custom `Data Spell` class 4 | rules evidence, `loadspell2` source anchor | covered | Keep label distinct from the lower `Spell Class` byte field. |
| Goto Spell / Spell No. | `Spell` picker plus previous/next buttons | packed spell ID, `spellPackedId(class, level, slot)` | `SpellRulesEditor.tsx` | label-fix | Renamed picker from `Go To Spell` to `Spell`; no storage change. |
| Copy Spell | helper callout `Copy To Custom Spell` | creates matching custom slot in `Data Spell` | project command and UI | covered | Keep copy action in the helper callout, not duplicated in the top row. |
| New custom spell | `New Custom Spell` | first open custom `Data Spell` slot | project command | covered | Keep disabled when no custom slot is open. |
| Clear custom spell | `Clear Scenario Custom` | removes `spellOverrides[id]` | project command | label-fix | Label now matches Race/Caste. |
| Fixed/Power Range | `Fixed Range`, `Power Range` | `range1`, `range2`, Data Spell +0/+1 | rules evidence | covered | Byte-range validation added. |
| +/- To Hit / DRV | `+/- To Hit %`, `+/- To DRV %` | `toHitBonus`, `saveBonus`, Data Spell +3/+4 | rules evidence | covered | Signed-byte validation added. |
| No. of Attacks / Can Rotate | same | `fixedTargetNum`, `canRotate`, Data Spell +5/+6 | rules evidence | covered | Byte-range validation added. |
| +/- Resist / Level, Resist Type | same | `resistAdjust`, `saveAdjust`, Data Spell +9/+7 | rules evidence | covered | Signed-byte validation added. |
| Base SP Cost | same | `cost`, Data Spell +10 | rules evidence | covered | Byte-range validation added. |
| Fixed/Power Damage | same low/high pairs | `damage1/2`, `powerDamage1/2`, Data Spell +11..+14 | rules evidence | covered | Byte-range validation added. |
| Fixed/Power Duration | same low/high pairs | `duration1/2`, `powerDuration1/2`, Data Spell +15..+18 | rules evidence | covered | Byte-range validation added. |
| Spell Class | `Spell Class` numeric | `spellClass`, Data Spell +27 | rules evidence | covered | Keep note that summon effects may use this as monster ID. |
| Damage Type | picker | `damageType`, Data Spell +26 | rules evidence | covered | Known-list validation added. |
| Can Cast In Combat / Camp | checkboxes | `inCombat`, `inCamp`, Data Spell +28/+29 | rules evidence | covered | No change. |
| Target Type | picker plus key | `targetType`, Data Spell +23 | rules evidence | covered | Known-list validation added. |
| Spell Size / Spell Effect | numeric fields | `size`, `special`, Data Spell +24/+25 | rules evidence | covered | Byte-range validation added. |
| Name | editable name | custom spell name resource metadata, not Data Spell bytes | roundtrip fixture, docs | resource-gated | Keep editable, but do not broaden packaging claims without fixture evidence. |
| Description / Note | editor note | not proven as Data Spell source byte field | current model | resource-gated | Treat as editor/reference text until fixture-backed. |
| Casting/Resolution Sounds | sound number helpers | `sound1`, `sound2`, Data Spell +21/+22 | rules evidence | covered | Byte-range validation added. |
| Cast/Resolution/Queue Icons | icon helpers | `spellLook1`, `spellLook2`, `queueIcon`, Data Spell +19/+20/+2 | rules evidence | covered | Byte-range validation added. |

Current pass notes:

- Shared spells remain read-only reference/copy sources.
- Custom spells are scenario-local `Data Spell` records.
- Spell picker and clear labels now match the Race/Caste flow.
- Project validation now checks Data Spell custom slot range and byte field bounds.

## Race Editor

Manual claim summary:

Divinity prevents editing standard races directly; authors copy or create custom race records. Race fields cover identity, portrait set, regeneration, movement, magic and weapon modifiers, attribute min/max pairs, combat/resistance matrices, possible castes, usable items, age rules, conditions, and descriptors.

| Divinity label/control | Providence label/control | Backing record/field | Evidence | Status | Follow-up |
| --- | --- | --- | --- | --- | --- |
| Standard/custom race navigation | `Race` picker plus previous/next | `Data Race` record ID, zero-based in Realmz data | rules evidence, UI | covered | Picker uses zero-based labels such as `0: Human`. |
| Copy standard race | helper callout `Copy To New Race` | creates next open custom `Data Race` slot from template | project command and UI | covered | Keep copy action in helper callout. |
| New custom race | `New Custom Race` | creates next open custom `Data Race` slot | project command and UI | covered | No change. |
| Clear custom race | `Clear Scenario Custom` | removes `raceOverrides[id]` | project command and UI | covered | No change. |
| Race Name | `Race Name` | editor/display label; resource packaging unproven | docs and UI | resource-gated | Keep as display metadata unless fixture proves resource-name write path. |
| Default icon/portrait set | `Default Portrait Set` | `defaultIconSet`, Data Race +334 | rules evidence | covered | Signed-16 validation added. |
| Can Regenerate | same | `canRegenerate`, Data Race +333 | rules evidence | covered | Byte validation added. |
| Base movement | `Base Movement Points` | `baseMove`, Data Race +196 | rules evidence | covered | Signed-16 validation added. |
| Magic/two-handed/missile modifiers | same | `magRes`, `twoHand`, `missile`, Data Race +198..+202 | rules evidence | covered | Signed-16 validation added. |
| Attribute min/max | `Attribute Minimums And Maximums` | `minMax[12]`, Data Race +72 | rules evidence | covered | Shape/range validation and min<=max warnings added. |
| +/- To Hit | `+/- To Hit` matrix | `plusMinusToHit[8]`, Data Race +0 | rules evidence | covered | Shape/range validation added. |
| DRVs Spell Class | same | `drvBonus[8]`, Data Race +44 | rules evidence | covered | Shape/range validation added. |
| Possible Castes | checkbox matrix | `canCaste[30]`, Data Race +208 | rules evidence | covered | Shape/byte validation added. |
| Usable items | bitset editor | `itemTypes[2]`, Data Race +336/+340 | rules evidence | covered | Shape/signed-32 validation added. |
| Age parameters | `Age Parameters` | `ageRange[5][2]`, `ageChange[5][15]`, Data Race +238/+258 | rules evidence | covered | Matrix shape/range validation added. |
| Conditions | `Condition Levels` | `conditions[40]`, Data Race +112 | rules evidence | covered | Shape/range validation added. |
| Descriptors | descriptor bitset | `descriptors`, Data Race +344 | rules evidence | covered | Signed-16 validation added. |
| Spacer bytes | not exposed | Data Race +346..end preserved | writer source | defer | Preserve raw bytes; do not expose without evidence. |

Current pass notes:

- Race UI now matches the manual's standard-vs-custom copy model.
- The picker stays narrow and does not need a separate Go To field.
- Project validation now checks Data Race record IDs, shapes, signed ranges, and attribute min/max inversions.

## Caste Editor

Manual claim summary:

Divinity prevents editing standard castes directly; authors copy or create custom caste records. Caste fields cover identity/class, default icon, missile flags, stats/movement, combat progression, victory points, spellcasting access, usable items, starting items/gold, attack thresholds, and conditions.

| Divinity label/control | Providence label/control | Backing record/field | Evidence | Status | Follow-up |
| --- | --- | --- | --- | --- | --- |
| Standard/custom caste navigation | `Caste` picker plus previous/next | `Data Caste` record ID, zero-based in Realmz data | rules evidence, UI | covered | Picker uses zero-based labels. |
| Copy standard caste | helper callout `Copy To New Caste` | creates next open custom `Data Caste` slot from template | project command and UI | covered | Keep copy action in helper callout. |
| New custom caste | `New Custom Caste` | creates next open custom `Data Caste` slot | project command and UI | covered | No change. |
| Clear custom caste | `Clear Scenario Custom` | removes `casteOverrides[id]` | project command and UI | covered | No change. |
| Caste Name | `Caste Name` | editor/display label; resource packaging unproven | docs and UI | resource-gated | Keep as display metadata unless fixture proves resource-name write path. |
| Caste Class / Minimum Age / Default Icon | same | `casteClass`, `minimumAgeGroup`, `defaultIcon`, Data Caste +248/+250/+444 | rules evidence | covered | Signed-16 validation added. |
| Missile flags | checkboxes | `canUseMissile`, `getsMissileBonus`, Data Caste +212/+214 | rules evidence | covered | Signed-16 validation added. |
| Attribute min/max | `Stats And Movement` pair grid | `minMax[12]`, Data Caste +108 | rules evidence | covered | Shape/range validation and min<=max warnings added. |
| Movement/resistance/weapon/stamina | same | Data Caste +252..+258 | rules evidence | covered | Signed-16 validation added. |
| Combat progression | `Combat Progression` | `stamina`, `strength`, `dodge`, `toHit`, `missile`, `hand2Hand`, plus attacks | rules evidence | covered | Shape/range validation added. |
| Victory points | `Victory Points` grid | `victory[30]`, Data Caste +264 | rules evidence | covered | Shape/signed-32 validation added. |
| Bonus attack rounds | `Bonus Attack Rounds` | `attacks[10]`, Data Caste +426 | rules evidence | covered | Shape/byte validation added. |
| Spellcasting | spellcaster matrix | `spellcasters[4][3]`, Data Caste +84 | rules evidence | covered | Shape/range validation added. |
| Usable items | bitset editor | `itemTypes[2]`, Data Caste +436/+440 | rules evidence | covered | Shape/signed-32 validation added. |
| Starting gold/items | `Initial Items And Gold` | `startMoney`, `startItems[20]`, Data Caste +384/+386 | rules evidence | covered | Shape/range validation added. |
| Conditions | `Condition Levels` | `conditions[40]`, Data Caste +132 | rules evidence | covered | Shape/range validation added. |
| Spacer bytes | not exposed | Data Caste +450..end preserved | writer source | defer | Preserve raw bytes; do not expose without evidence. |

Current pass notes:

- Caste UI now matches the same standard-vs-custom copy model as Race.
- Advanced matrices remain source-backed, but exact Divinity row phrasing can continue improving as fixtures/screenshots surface.
- Project validation now checks Data Caste record IDs, shapes, signed ranges, byte ranges, and attribute min/max inversions.

## Cross-Rules Behavior

| Behavior | Providence handling | Status | Follow-up |
| --- | --- | --- | --- |
| Built-ins are read-only | Shared Spell/Race/Caste records are browse/copy sources | covered | Keep this aligned with Divinity manual wording. |
| Custom records are scenario-local | `Data Spell`, `Data Race`, and `Data Caste` overrides are editable/exported | covered | No schema change. |
| Copy to custom | Copy actions create scenario-local records from the viewed built-in/template | covered | Keep copy in helper callout area. |
| New custom | New buttons create blank/default custom slots | covered | Keep disabled when no custom slot is open. |
| Clear custom | Clear removes scenario override and returns to built-in/empty view | covered | Spell label now matches Race/Caste. |
| Validation | Project validation checks record ID ranges, fixed array shapes, and byte/i16/i32 bounds | covered | Add semantic validation only when source-backed. |

## Deferred Or Fixture-Gated Items

- Spell custom name/description resource packaging beyond the existing STR# fixture confidence.
- Race and caste name resource packaging.
- Divinity row-label refinements for advanced Race/Caste matrices where screenshots/manual wording are not enough to prove runtime meaning.
- Any writer expansion outside current `Data Spell`, `Data Race`, and `Data Caste` command paths.
