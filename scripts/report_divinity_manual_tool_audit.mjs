import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const manualPath = path.join(repoRoot, "public", "divinity-manual", "index.html");
const parityMapPath = path.join(repoRoot, "docs", "divinity-parity-map.md");
const registryPath = path.join(repoRoot, "src", "editor", "workbench", "registry.tsx");
const markdownOut = path.join(repoRoot, "docs", "divinity-manual-tool-audit.md");
const jsonOut = path.join(repoRoot, "docs", "generated", "divinity-manual-tool-audit.json");
const checkMode = process.argv.includes("--check");

const STATUS_DEFINITIONS = {
  "covered": "Providence handles the authoring behavior.",
  "partial": "Providence handles core behavior but misses labels, affordances, validation, previews, or workflow parity.",
  "inspect-only": "Providence can browse/import/explain but not author/export.",
  "fixture-gated": "Likely authorable, but needs Divinity before/after or source confirmation.",
  "not-applicable": "Manual chapter is reference/license/platform material rather than Providence tool behavior.",
  "unknown": "Manual behavior has not been confidently mapped."
};

const AUDIT_BY_PAGE = {
  1: audit({
    status: "partial",
    domain: "Project / Scenario",
    tools: ["New/Open/Import", "Scenario", "Export"],
    parityKeys: ["Getting Started"],
    registryLabels: ["Startup Info", "Export Plan"],
    summary: "Manual setup covers creating a scenario folder, registering it with Divinity, selecting it for editing, and understanding common editor controls.",
    handling: "Providence supports browser/desktop project creation, opening/importing scenarios, and export readiness, but the flow is intentionally modernized rather than Divinity menu-based.",
    evidence: ["docs/divinity-parity-map.md: Getting Started", "src/editor/docs/documentationContent.ts: Projects"],
    gaps: ["Blank scenario defaults and scenario registration/removal language are not fully compared against the manual.", "Common Divinity control semantics are documented unevenly across Providence tools."],
    followUp: ["Audit blank-project resource defaults against the manual's New Scenario expectations.", "Add cross-reference notes for Divinity-only control conventions that Providence replaces."]
  }),
  2: audit({
    status: "partial",
    domain: "Maps",
    tools: ["Land Editor", "Land Layout"],
    parityKeys: ["Land Editor / Land Layout"],
    registryLabels: ["Land Editor", "Land Layout"],
    summary: "Manual land editing covers outdoor painting, land layout adjacency, map movement, random terrain behavior, and editor navigation.",
    handling: "Providence can paint and inspect land levels, manage map records, and expose land layout/navigation, with richer previews than Divinity.",
    evidence: ["docs/divinity-parity-map.md: Land Editor / Land Layout", "docs/generated/map-record-evidence.json", "docs/generated/map-field-value-evidence.json"],
    gaps: ["Land layout/start records need a manual-by-manual comparison.", "Some terrain/random-painting and custom landlook behaviors remain separate archaeology topics."],
    followUp: ["Produce a Maps-specific checklist from the manual's Land Editor commands.", "Verify land layout edge travel, starts, and random tile affordances against imported scenarios."]
  }),
  3: audit({
    status: "partial",
    domain: "Scenario",
    tools: ["Startup Info", "Restrictions", "Contact Info", "Security"],
    parityKeys: ["Scenario Startup Information"],
    registryLabels: ["Startup Info", "Restrictions", "Contact Info", "Security"],
    summary: "Manual startup information covers scenario shell fields, initial location, party restrictions, contact info, registration/security, and release metadata.",
    handling: "Providence authors source-backed startup, contact, and restriction data and preserves legacy security segments.",
    evidence: ["docs/generated/scenario-shell-evidence.json", "docs/generated/scenario-party-restrictions-evidence.json", "docs/generated/scenario-music-format-evidence.json"],
    gaps: ["Legacy security and release/registration workflows are preserved or inspected more than edited.", "Some release metadata fields need exact Divinity label checks."],
    followUp: ["Compare each manual startup field against Scenario tabs and export behavior.", "Keep registration/security edits fixture-gated until classic behavior is verified."]
  }),
  4: audit({
    status: "partial",
    domain: "Action Points",
    tools: ["Action Points", "Extra Action Points", "Global Events", "Quests"],
    parityKeys: ["Action Points / GOSUBs", "Macros / Quests"],
    registryLabels: ["Action Points", "Extra Action Points", "Global Events", "Quests"],
    summary: "Manual AP/GOSUB workflow covers AP records, Extra APs, stack/GOSUB behavior, code/id slots, and script linking.",
    handling: "Providence authors APs, reachable macros, EDCD rows, quest links, diagnostics, and preserves unlinked ED3 evidence.",
    evidence: ["docs/divinity-parity-map.md: Scripts V1/V2 contracts", "docs/generated/ap-opcode-coverage.json", "docs/generated/extra-ap-reachability-source-map.json"],
    gaps: ["Manual examples and all opcode-specific parameter windows are not fully mirrored as guided forms.", "Some ED3 rows remain evidence until reachability is source-backed."],
    followUp: ["Use opcode coverage reports to drive remaining AP parameter-form parity.", "Keep dispatcher no-ops distinct from unknown executable behavior."]
  }),
  5: scriptingAudit(5, "Scripting Codes 1-29"),
  6: scriptingAudit(6, "Scripting Codes 30-59"),
  7: scriptingAudit(7, "Scripting Codes 60-89"),
  8: scriptingAudit(8, "Scripting Codes 90-End"),
  9: audit({
    status: "covered",
    domain: "Workbench",
    tools: ["Editor Tool Rail", "Search", "Documents"],
    parityKeys: ["HUB"],
    registryLabels: [],
    summary: "Manual HUB is the Divinity navigation surface for opening editors and reference windows.",
    handling: "Providence replaces HUB with persistent domain navigation, search, library, documents, and tool-specific tabs.",
    evidence: ["src/editor/workbench/registry.tsx", "src/editor/components/EditorToolRail.tsx"],
    gaps: ["No functional gap identified; this is an intentional UI replacement."],
    followUp: ["Keep Divinity chapter cross-links discoverable from relevant Providence help pages."]
  }),
  10: audit({
    status: "partial",
    domain: "Combat",
    tools: ["Battle Editor"],
    parityKeys: ["Battle Editor"],
    registryLabels: ["Battle Editor"],
    summary: "Manual Battle Editor covers battle records, before/after strings, distance, battle macro, monster placement, erase mode, and Force Friends.",
    handling: "Providence authors Data BD battle shells with grid placement, signed Force Friends behavior, before/after string pickers, distance guidance, and Battle Macro links that write the runnable end-of-round Extra Action Point form. Battle records still store only signed monster IDs, but the editor can preview the battle against Normal, Monster, or Mega scenario monster sets. The placement palette exposes scenario monsters only; Monster Library templates must be copied into Scenario Monsters before they can be painted into a battle. Monster 0 and the observed non-authorable 218+ placeholders are excluded from painting. Source-backed UI guardrails keep zero-valued Monster and Battle Macro records out of controls where `0` means empty/inactive.",
    evidence: ["docs/generated/battle-record-evidence.json", "docs/combat-battle-editor-parity-audit.md", "docs/format-evidence-cards/bestiary-source-alignment.md", "F:/Realmz/src/realmz_orig/combatsetup.c", "F:/Realmz/src/realmz_orig/getup.c"],
    gaps: ["Missing-monster repair is source-backed by matching Monster Scrapbook IDs, but still needs imported-scenario fixture examples.", "Imported positive Battle Macro values are preserved and warned, but no fixture currently proves a scenario depends on that compatibility state."],
    followUp: ["Add fixture examples for battle-grid missing-monster repair.", "Keep Battle Macro field behavior aligned with the manual/source end-of-round execution model."]
  }),
  11: audit({
    status: "partial",
    domain: "Combat",
    tools: ["Monster Editor"],
    parityKeys: ["Monster Editor"],
    registryLabels: ["Monster Editor"],
    summary: "Manual Monster Editor covers Data MD monster templates, description text, combat stats, behavior, attacks, spells/items, icon, traitor, menu visibility, and monster macro.",
    handling: "Providence edits scenario Data MD monsters, Data DES descriptions, icons, macro references, required-weapon restrictions, weapon/item/spell references, and many source-backed numeric fields. Scenario Monsters is set-aware: Normal edits Data MD, Monster edits Data MD1, and Mega edits Data MD-1, with descriptions shared by monster ID. Imported Data MENU is treated as generated bestiary cache evidence and is omitted from export so Realmz rebuilds it from Data MD. Direct selected-set editing, exact Copy Current To All Sets, selected-set Switch With, and Providence Generate Variants are supported. Divinity Create Sets remains intentionally superseded rather than cloned exactly.",
    evidence: ["docs/generated/monster-record-evidence.json", "docs/generated/monster-description-set-evidence.json", "docs/format-evidence-cards/bestiary-source-alignment.md", "docs/format-evidence-cards/monster-descriptions-and-sets-runtime-anchors.md", "F:/Divinity - Codex/docs/handoffs/monster-required-weapon-rel7-to-providence.md", "F:/Realmz/src/realmz_orig/structs.h", "F:/Realmz/src/realmz_orig/attack.c"],
    gaps: ["Several manual labels and meanings remain uncertain: attack row semantics, type flags, summon options, and runtime-looking fields.", "Providence Generate Variants needs broader authored-scenario smoke testing against exported Data MD1/Data MD-1.", "Exact Divinity Create Sets quirks remain intentionally deferred because Mega spell-point rounding, overflow/clamp behavior, and rel 45 persistence are not confidence-complete; rel 7 direct-save authoring is fixture-proven."],
    followUp: ["Run remaining Monster Editor field-by-field label audits with Divinity screenshots/fixtures.", "Add regression tests for set-aware editing, Copy Current To All Sets, Switch With, and Generate Variants.", "Keep exact Divinity Create Sets behavior fixture-gated unless a separate compatibility need appears."]
  }),
  12: audit({
    status: "partial",
    domain: "Combat / Library",
    tools: ["Monster Scrapbook", "Monster Editor"],
    parityKeys: ["Monster Scrapbook"],
    registryLabels: ["Monster Scrapbook", "Monster Editor"],
    summary: "Manual Monster Scrapbook provides reusable editor/library monster templates for copying, comparison, and basic scrapbook-side editing.",
    handling: "Providence treats bundled Realmz/Divinity Monster Scrapbook entries as protected built-in templates, then adds an editable workspace-scoped Providence Monster Library for overrides and variants. Built-ins can be customized by creating an override, restored by deleting that override, or copied into Scenario Monsters as Normal only, exact all-set records, or generated variants. Scenario Monsters remains the runtime/export layer; Providence library data itself is not emitted as a Realmz Monster Scrap Book file.",
    evidence: ["src/editor/panels/CombatPanel.tsx", "src/editor/monsterLibrary.ts", "src-tauri/src/workspace.rs", "src/editor/browser/library.ts"],
    gaps: ["Copy behavior needs export fixture proof for Data MD and Data DES.", "Providence-native library entries intentionally exceed Divinity's 1000-entry scrapbook model and do not export as a Realmz Monster Scrap Book file.", "Any Divinity-specific scrapbook filtering or copy target rules are not fully compared."],
    followUp: ["Add before/after fixtures for copying scrapbook monsters into a scenario.", "Add fixture-backed copy/export checks for library entry -> Data MD/Data DES.", "Keep Realmz-compatible Monster Scrap Book export deferred unless there is a separate product need."]
  }),
  13: audit({
    status: "partial",
    domain: "Economy",
    tools: ["Treasure"],
    parityKeys: ["Treasure Editor"],
    registryLabels: ["Treasure"],
    summary: "Manual Treasure Editor covers fixed rewards, item slots, treasure links, and reward authoring.",
    handling: "Providence authors treasure shells, item slots, gold/gems/jewelry/experience fields, and preserves unsupported bytes.",
    evidence: ["docs/generated/item-treasure-shop-evidence.json", "docs/divinity-parity-map.md: Treasure Editor"],
    gaps: ["Item reward picker quality, validation, and manual-specific limits need a dedicated audit.", "Some reward behavior remains writer-confidence gated by evidence."],
    followUp: ["Compare each Treasure Editor field against Data TD handling.", "Add validation for unresolved or out-of-family item rewards if missing."]
  }),
  14: audit({
    status: "partial",
    domain: "Economy",
    tools: ["Items", "Bag of Holding", "Vault of Arcana"],
    parityKeys: ["Item Editor", "Vault of Arcana"],
    registryLabels: ["Items", "Bag of Holding", "Vault of Arcana"],
    summary: "Manual Item Editor and shared item libraries cover standard items, scenario custom items, icons, descriptions, and item behavior values.",
    handling: "Providence browses built-in item families and imported scenario items, supports custom item workflows where source-backed, and lets custom scenario items choose protected Vault icons or editable Providence item-icon library entries. Providence-owned item icons are exported as scenario `cicn` resources only when a scenario item references them.",
    evidence: ["docs/generated/item-treasure-shop-evidence.json", "docs/generated/resource-icon-evidence.json"],
    gaps: ["Full 900-999 custom item names/descriptions and all behavior labels remain incomplete.", "Vault copy/adapt workflow is not full item parity beyond icon-library copying."],
    followUp: ["Run a separate Item Editor field audit against Data NI and library item summaries.", "Keep item icon resource writes explicit and reference-driven; unused Providence icon-library entries should remain workspace/catalog data only."]
  }),
  15: audit({
    status: "partial",
    domain: "Economy",
    tools: ["Shops"],
    parityKeys: ["Shop Editor"],
    registryLabels: ["Shops"],
    summary: "Manual Shop Editor covers shop inventory, quantities, inflation/pricing, and restricted shop behavior.",
    handling: "Providence authors shop shells, item IDs, quantities, inflation, and preserves unsupported bytes.",
    evidence: ["docs/generated/item-treasure-shop-evidence.json", "docs/divinity-parity-map.md: Shop Editor"],
    gaps: ["Item picker, bulk fill, pricing quality checks, and restricted shop gate semantics need manual comparison."],
    followUp: ["Audit Data SD fields against manual controls.", "Add validations for unresolved item references and unusual quantities/prices."]
  }),
  16: audit({
    status: "partial",
    domain: "Encounters",
    tools: ["Simple Encounter"],
    parityKeys: ["Simple Encounter Editor"],
    registryLabels: ["Simple Encounter"],
    summary: "Manual Simple Encounter Editor covers prompt setup, action choices, result scripts, branch behavior, and text buffers.",
    handling: "Providence authors simple encounter shells, action rows, prompt strings, result script columns, target links, same-type record navigation, and preserved imported bytes. Option 1 exposes the source-backed `-4` auto-run Result #4 sentinel; other option results stay constrained to `0..4`.",
    evidence: ["docs/encounters-manual-parity-audit.md", "docs/generated/encounter-record-evidence.json", "docs/format-evidence-cards/encounter-record-runtime-anchors.md"],
    gaps: ["Corpus `Data ED` tail/packing debt remains preserve-and-investigate work, not a UI blocker."],
    followUp: ["Keep `Data ED` tail bytes preserved until parser/writer archaeology closes the confidence debt."]
  }),
  17: audit({
    status: "partial",
    domain: "Encounters",
    tools: ["Complex Encounter"],
    parityKeys: ["Complex Encounter Editor"],
    registryLabels: ["Complex Encounter"],
    summary: "Manual Complex Encounter Editor covers prompt strings, action choices, magic/item/typed responses, rogue links, max times, and result scripts.",
    handling: "Providence authors complex encounter shells with pickers for same-type records, prompt strings, action choices, magic/item responses, typed replies, rogue links, and result scripts. Low spell-class shortcuts follow modern Realmz source behavior, which consumes nonzero IDs below 7 even though Divinity text says 1 through 7. Legacy unconsumed bytes such as `thieffail` are preserved, but they are not normal authoring parity requirements for modern Realmz 8+.",
    evidence: ["docs/encounters-manual-parity-audit.md", "docs/generated/encounter-record-evidence.json", "docs/format-evidence-cards/encounter-record-runtime-anchors.md", "F:/Realmz/src/realmz_orig/encounters.c:1004"],
    gaps: [],
    followUp: []
  }),
  18: audit({
    status: "partial",
    domain: "Encounters",
    tools: ["Rogue Encounter"],
    parityKeys: ["Rogue Encounter Editor"],
    registryLabels: ["Rogue Encounter"],
    summary: "Manual Rogue Encounter Editor covers thief action tests, trap/lock setup, prompt string, trap sound/spell, damage, lock tumblers, and open/disarm chances.",
    handling: "Providence authors the core TD2 thief/rogue fields with Divinity-style trap/lock grouping, trap prompt text, Trap Sound authoring with preview, spell helpers, and action test rows. Divinity lower-left string/sound preview controls are not treated as source fields.",
    evidence: ["docs/encounters-manual-parity-audit.md", "docs/generated/thief-timed-encounter-evidence.json", "docs/format-evidence-cards/thief-timed-encounter-runtime-anchors.md"],
    gaps: ["Divinity preview-only lower-left string/sound controls should remain documented so they are not reintroduced as authored source fields.", "Writer confidence for TD2 remains fixture-gated at the binary-layout level, even though current UI edits existing project fields."],
    followUp: ["Keep Rogue Encounter Prompt Sound and Divinity lower-left String/Sound preview affordances out of authorable UI unless a new fixture proves scenario writes; this does not apply to the authorable Trap Sound row.", "Add writer fixtures for TD2 trap/lock edits before broadening the authoring surface."]
  }),
  19: audit({
    status: "partial",
    domain: "Encounters",
    tools: ["Timed Encounter"],
    parityKeys: ["Time Encounter Editor"],
    registryLabels: ["Timed Encounter"],
    summary: "Manual Time Encounter Editor covers schedule, position requirements, repeat behavior, and timed mutation controls.",
    handling: "Providence exposes timed encounters with position-required picker, schedule fields, compatibility data, and record navigation.",
    evidence: ["docs/encounters-manual-parity-audit.md", "docs/generated/thief-timed-encounter-evidence.json", "docs/format-evidence-cards/thief-timed-encounter-runtime-anchors.md", "scripts/report_timed_encounter_reserved_fields.mjs"],
    gaps: ["`stuff[1..9]` compatibility fields still lack author-facing meanings.", "Extra AP, item, quest, and map gates are numeric fields rather than full target pickers."],
    followUp: ["Keep Timed Compatibility Data collapsed/read-only until source or fixture evidence names `stuff[1..9]`.", "Consider picker upgrades for Extra AP, item, quest, and position references without changing storage."]
  }),
  20: audit({
    status: "partial",
    domain: "Maps",
    tools: ["Map Records", "Land Editor", "Dungeon Editor"],
    parityKeys: ["Map Editor"],
    registryLabels: ["Land Editor", "Dungeon Editor", "Land Layout"],
    summary: "Manual Map Editor covers map records, map names, starts, flags, Action Point overlays, random rectangles, and map display behavior.",
    handling: "Providence authors many map record fields, map tiles, AP placement, random rectangles, map flags, and source-backed map setup data.",
    evidence: ["docs/generated/map-record-evidence.json", "docs/generated/random-level-evidence.json", "docs/generated/map-field-value-evidence.json"],
    gaps: ["Map note/start authoring beyond decoded MD2 fields remains incomplete.", "Manual map display rules and naming/resource packaging need detailed audit."],
    followUp: ["Compare each map record field and map display option to current Maps UI.", "Separate authored map records from runtime/generated files in the audit."]
  }),
  21: audit({
    status: "inspect-only",
    domain: "Maps",
    tools: ["Dungeon Editor"],
    parityKeys: ["Dungeon Editor"],
    registryLabels: ["Dungeon Editor"],
    summary: "Manual Dungeon Editor covers dungeon geometry, walls/doors, darkness, line-of-sight, and dungeon-specific behavior.",
    handling: "Providence imports, renders, and explains dungeon levels, darkness, LOS, and render provenance, but does not fully author dungeon geometry.",
    evidence: ["docs/generated/dungeon-bitfield-evidence.json", "docs/generated/dungeon-byte-ownership.json", "docs/generated/outdoor-visibility-evidence.json"],
    gaps: ["Dungeon geometry and flag authoring are not full parity.", "Bit ownership needs more source/manual/fixture proof before safe writing."],
    followUp: ["Use dungeon coverage reports to split inspect-only fields from writer-ready fields.", "Keep geometry editing disabled until bit-level writer gates are met."]
  }),
  22: audit({
    status: "partial",
    domain: "Action Points",
    tools: ["Extra Action Points", "Quests"],
    parityKeys: ["Macros / Quests"],
    registryLabels: ["Extra Action Points", "Quests"],
    summary: "Manual Macros/Quests covers reusable scripts, quest flag behavior, battle macros, monster macros, and examples.",
    handling: "Providence authors reachable macros and quest flag links, exposes macro flow, and validates missing targets.",
    evidence: ["docs/generated/global-macro-evidence.json", "docs/generated/ap-opcode-coverage.json", "src/editor/generated/divinityOpcodeHelp.json"],
    gaps: ["Dedicated quest registry and macro graph parity remain incomplete.", "Manual examples should be tied to current flow preview behavior."],
    followUp: ["Audit battle/monster macro examples against current AP flow and target pickers.", "Add quest registry requirements from manual examples if needed."]
  }),
  23: audit({
    status: "partial",
    domain: "Combat / Library",
    tools: ["Combat / Icon Set", "Monster Library", "Scenario Icons"],
    parityKeys: ["Monster Mash"],
    registryLabels: ["Monster Mash", "Scenario Icons"],
    summary: "Manual Monster Mash provides shared monster icon material and icon-set workflows.",
    handling: "Providence keeps Monster Mash as protected reference material and adds a Combat Build Icon Set workflow for scenario-owned monster icon overrides. The editor stores override intent as standard target icon -> Monster Mash, imported scenario-resource, or Providence Icon Library source icon, exports both facing `cicn` resources at the target IDs, and restores defaults by removing the override so Realmz falls back to Family Jewels. Protected Monster Mash sources can be copied into the editable Providence Icon Library as variants, and Providence-owned monster icon sets can be imported from image files as mirrored or custom-facing paired `cicn` resources. Realmz source draws monster art through direct `GetCIcon(iconid)` / `GetCIcon(iconid + 308)` resource lookup; no runtime icon-set count array has been found.",
    evidence: ["src/editor/panels/CombatPanel.tsx", "src/editor/iconLibrary.ts", "src/editor/browser/realmzParser.ts", "src/editor/projectCommands/targetRecordCommands.ts", "src-tauri/src/exporter.rs", "F:/Realmz/src/realmz_orig/drawbody.c", "F:/Realmz/src/realmz_orig/combatupdate-2.c", "docs/generated/resource-icon-evidence.json"],
    gaps: ["Editing global Monster Mash itself is intentionally not implemented; Providence edits workspace-scoped icon-library copies instead.", "Classic Realmz documents an approximate per-scenario monster icon-set limit; Providence treats it as a compatibility warning, not a source-proven hard runtime cap.", "Imported scenario-owned overrides require complete paired `cicn` resources.", "Image import creates Providence icon-library entries only; it does not mutate Monster Mash or Family Jewels."],
    followUp: ["Add a focused imported-scenario regression fixture for existing icon-set overrides.", "Consider a later explicit Monster Mash-compatible export file, separate from scenario export."]
  }),
  24: audit({
    status: "partial",
    domain: "Economy / Library",
    tools: ["Vault of Arcana", "Items", "Providence Icon Library"],
    parityKeys: ["Vault of Arcana"],
    registryLabels: ["Vault of Arcana", "Items"],
    summary: "Manual Vault of Arcana is shared item/icon reference material for item authoring.",
    handling: "Providence imports and browses Vault/library item material as protected reference data. Vault `cicn` icons can be copied into editable Providence Icon Library entries, and custom scenario items can reference Providence item-icon entries; referenced custom item icons are packaged into the scenario resource fork on export.",
    evidence: ["src/editor/workbench/registry.tsx", "src/editor/panels/SuiteDomainPanel.tsx", "src/editor/iconLibrary.ts", "src-tauri/src/exporter.rs", "docs/generated/resource-icon-evidence.json", "docs/generated/item-treasure-shop-evidence.json"],
    gaps: ["Editing global Vault of Arcana itself is intentionally not implemented; Providence edits workspace-scoped icon-library copies instead.", "Copy/adapt vault item definitions into scenario custom item records is not full parity beyond icon copying."],
    followUp: ["Audit Vault item workflows together with Item Editor custom item work.", "Consider a later explicit Vault-compatible export file, separate from scenario export."]
  }),
  25: audit({
    status: "partial",
    domain: "Assets / Combat / Economy",
    tools: ["Scenario Icons", "Monster Editor", "Items"],
    parityKeys: ["Adding Monster & Item Icons"],
    registryLabels: ["Scenario Icons", "Monster Editor", "Items"],
    summary: "Manual icon chapter covers adding custom monster and item icons into scenario resources and assigning them.",
    handling: "Providence manages scenario icon resources through explicit use sites: Combat Build Icon Set exports paired monster override `cicn` resources, and Economy custom items can package referenced Providence item-icon resources. Protected Monster Mash and Vault files remain immutable defaults, while user additions live in the workspace-scoped Providence Icon Library. Monster icon-set import supports 32x32, 32x64, 64x32, and 64x64 paired `cicn` resources.",
    evidence: ["docs/generated/resource-icon-evidence.json", "docs/format-evidence-cards/resource-fork-taxonomy-authoring.md", "src/editor/iconLibrary.ts", "src-tauri/src/exporter.rs"],
    gaps: ["Monster Mash and item icon resource ID conflict rules need fixture-backed policy.", "Item icon image import and Vault-compatible export files remain deferred beyond the current monster icon-set import flow."],
    followUp: ["Add fixtures for custom cicn resource writes before claiming full icon-authoring parity.", "Add a later Vault-compatible item icon image import workflow."]
  }),
  26: audit({
    status: "partial",
    domain: "Assets / Maps",
    tools: ["Special Land Tiles", "Scenario Assets"],
    parityKeys: ["Creating Special Land Tiles"],
    registryLabels: ["Special Land Tiles", "Scenario Assets"],
    summary: "Manual special land tile workflow covers creating/importing custom special tile art and using it in maps.",
    handling: "Providence imports, previews, places, validates, and preserves special land/icon tiles as negative field values with Data Solids evidence.",
    evidence: ["docs/generated/tile-attribute-evidence.json", "docs/generated/custom-landlook-coverage.json", "docs/generated/map-field-value-evidence.json"],
    gaps: ["Special tile asset creation/editing and all landlook metadata writing are not complete.", "Some solidity/attribute behavior remains evidence-gated."],
    followUp: ["Compare manual special tile steps with Assets and Maps workflows.", "Keep custom landlook writes behind writer gates until coverage is complete."]
  }),
  27: audit({
    status: "partial",
    domain: "Assets / Strings / Scripts",
    tools: ["Scenario Pictures", "Scenario Sounds", "Scenario Assets"],
    parityKeys: ["Pictures & Sounds"],
    registryLabels: ["Scenario Pictures", "Scenario Sounds", "Scenario Assets"],
    summary: "Manual picture/sound chapter covers adding PICT and snd resources and using them from scripts or scenario presentation.",
    handling: "Providence manages scenario-owned pictures and sounds, reference libraries, previews, and target pickers for script usage.",
    evidence: ["docs/generated/resource-byte-ownership.json", "docs/generated/string-sound-audit.json", "docs/generated/resource-icon-evidence.json"],
    gaps: ["Resource ID conflict resolution and richer previews need more coverage.", "String sound-field archaeology remains a known follow-up."],
    followUp: ["Audit picture/sound ID ranges and export behavior against manual claims.", "Make scenario-owned versus shared-library source explicit in all target pickers."]
  }),
  28: audit({
    status: "inspect-only",
    domain: "Assets / Maps",
    tools: ["Reference Libraries", "Land Editor"],
    parityKeys: ["Standard Land Tile Editor"],
    registryLabels: ["Reference Libraries", "Land Editor"],
    summary: "Manual Standard Land Tile Editor covers modifying land tile metadata, terrain properties, and tile art behavior.",
    handling: "Providence browses current landlook atlases and decoded tile metadata, but built-in landlook editing remains read-only.",
    evidence: ["docs/generated/custom-landlook-coverage.json", "docs/generated/tile-attribute-evidence.json", "docs/format-evidence-cards/custom-landlook-writers.md"],
    gaps: ["Tile-attribute writing remains future work.", "Custom landlook file/resource behavior needs complete writer proof."],
    followUp: ["Keep standard tile editing inspect-only until every exported byte is understood.", "Use existing custom-landlook coverage to define the first writer-ready subset."]
  }),
  29: audit({
    status: "partial",
    domain: "Rules",
    tools: ["Spell Editor"],
    parityKeys: ["Spell Editor"],
    registryLabels: ["Spell Editor"],
    summary: "Manual Spell Editor covers built-in spell browsing, copying/creating custom spells, spell class, target, icon/sound, range, damage, duration, resistance, and text.",
    handling: "Providence browses shared spells as read-only references and authors scenario Data Spell custom overrides for the source-backed 30-byte custom spell records. The picker/new/clear flow now matches the Race/Caste custom override model, and project validation checks custom spell slot and byte-field bounds.",
    evidence: ["docs/rules-manual-parity-audit.md", "docs/generated/rules-spell-race-caste-evidence.json", "docs/generated/core-rules-record-evidence.json", "src/editor/browser/project.ts"],
    gaps: ["Custom spell name/description resource packaging remains fixture-gated beyond current STR# confidence.", "Manual labels for some advanced presentation fields can continue improving without changing storage."],
    followUp: ["Keep custom spell name/description packaging behind fixtures.", "Add semantic validation only when modern Realmz source behavior is clear."]
  }),
  30: audit({
    status: "partial",
    domain: "Rules",
    tools: ["Race Editor"],
    parityKeys: ["Race Editor"],
    registryLabels: ["Race Editor"],
    summary: "Manual Race Editor covers browsing standard races, copying/creating scenario custom races, race names, stats, aging, caste permissions, usability, descriptors, and conditions.",
    handling: "Providence browses shared races as read-only references and authors source-backed scenario Data Race override records through copy/new/clear workflows. Race picker labels are zero-based, and project validation checks Data Race record range, fixed matrix shapes, numeric bounds, and attribute min/max inversions. A Divinity non-name fixture created scenario-local Data Race and confirms sampled fields under the current 30 x 408-byte model. Divinity custom race names are fixture-proven in external Data Files:Custom Names.rsrc STR# 129, and modern Realmz opens that support resource at startup, but Divinity Format does not package that global resource into the scenario. Providence imports labels for context and saves edits in the project only; scenario export writes Data Race non-name fields and does not export Custom Names.",
    evidence: ["docs/rules-manual-parity-audit.md", "docs/generated/rules-spell-race-caste-evidence.json", "F:/Divinity - Codex/docs/handoffs/custom-race-caste-authoring-to-providence.md", "F:/Divinity - Codex/docs/handoffs/custom-race-caste-names-to-providence.md", "src/editor/panels/rules/RaceRulesEditor.tsx", "src/editor/browser/project.ts"],
    gaps: ["Race Base Attacks and usable-item flag bytes still need isolated fixtures.", "Some Divinity advanced row phrasing can continue improving as fixture screenshots surface."],
    followUp: ["Run second-toggle fixtures for Race Base Attacks and usable-item flags.", "Refine labels only when manual/source evidence is stronger than the current source-backed field names."]
  }),
  31: audit({
    status: "partial",
    domain: "Rules",
    tools: ["Caste Editor"],
    parityKeys: ["Caste Editor"],
    registryLabels: ["Caste Editor"],
    summary: "Manual Caste Editor covers standard/custom caste editing, caste names, stats, spellcasting access, progression, item usability, conditions, starting items, and default icon.",
    handling: "Providence browses shared castes as read-only references and authors source-backed scenario Data Caste override records through copy/new/clear workflows. The editor exposes the known caste matrices and project validation checks record range, fixed matrix shapes, numeric bounds, byte arrays, and attribute min/max inversions. A Divinity non-name fixture created scenario-local Data Caste and confirms sampled fields under the current 30 x 576-byte model. Divinity custom caste names are fixture-proven in external Data Files:Custom Names.rsrc STR# 131, and modern Realmz opens that support resource at startup, but Divinity Format does not package that global resource into the scenario. Providence imports labels for context and saves edits in the project only; scenario export writes Data Caste non-name fields and does not export Custom Names.",
    evidence: ["docs/rules-manual-parity-audit.md", "docs/generated/rules-spell-race-caste-evidence.json", "F:/Divinity - Codex/docs/handoffs/custom-race-caste-authoring-to-providence.md", "F:/Divinity - Codex/docs/handoffs/custom-race-caste-names-to-providence.md", "src/editor/panels/rules/CasteRulesEditor.tsx", "src/editor/browser/project.ts"],
    gaps: ["Caste class, default icon, spellcasting rows, starting items, and victory values still need isolated fixtures.", "Some advanced matrix labels/order remain candidates for Divinity screenshot/source refinement."],
    followUp: ["Run targeted fixtures for remaining Caste fields called out by the handoff.", "Record ambiguous matrix wording as fixture-gated rather than adding unsupported behavior."]
  }),
  32: audit({
    status: "partial",
    domain: "Strings",
    tools: ["String Editor", "Export Check", "Reference Strings"],
    parityKeys: ["Text Import / Export / Spell Checking"],
    registryLabels: ["String Editor", "Export Check", "Reference Strings"],
    summary: "Manual text chapter covers importing/exporting strings for spell checking and authoring scenario text.",
    handling: "Providence authors Data SD2 strings, two-choice option labels, search/find, length checks, and plain text import/export workflows.",
    evidence: ["docs/generated/text-message-evidence.json", "docs/generated/string-sound-audit.json"],
    gaps: ["String sound-field behavior remains archaeology-backed but not fully authoring-polished.", "Manual spell-check workflow should be compared to current import/export commands."],
    followUp: ["Audit every text import/export command and byte-limit diagnostic against the manual.", "Keep message/string naming consistent; avoid reintroducing 'message' as user-facing string terminology."]
  }),
  33: audit({
    status: "inspect-only",
    domain: "Scenario / Export",
    tools: ["Security", "Export Plan"],
    parityKeys: ["Scenario Security / Registration Codes"],
    registryLabels: ["Security", "Export Plan"],
    summary: "Manual security chapter covers scenario registration codes and legacy release/security gates.",
    handling: "Providence preserves and inspects legacy registration/security segments and can report code usage, but does not fully author classic security workflows.",
    evidence: ["docs/scenario-format-integration.md", "scripts/check_registration_codes.mjs", "docs/generated/scenario-shell-evidence.json"],
    gaps: ["Legacy security field editor and compatibility warnings are incomplete.", "Classic registration behavior needs careful fixture/source verification before editing."],
    followUp: ["Keep security authoring preserve-first until runtime behavior is verified.", "Use registration-code checks to produce audit findings rather than editing controls."]
  }),
  34: audit({
    status: "partial",
    domain: "Linter / Export",
    tools: ["Issues", "Readiness", "Export Plan"],
    parityKeys: ["Release Checklist"],
    registryLabels: ["Issues", "Readiness", "Export Plan"],
    summary: "Manual release checklist covers pre-release validation and compatibility checks before distributing a scenario.",
    handling: "Providence has validation, export readiness, issue grouping, and desktop release gate scripts.",
    evidence: ["src/editor/workbench/registry.tsx: Linter/Export", "scripts/run_desktop_release_gate.ps1", "docs/generated/functional-authoring-readiness.json"],
    gaps: ["Divinity-style release checklist is not yet a first-class checklist mapped line-by-line to manual advice.", "Some Realmz compatibility gates remain broader linter topics."],
    followUp: ["Translate manual release checklist into explicit Linter/Export readiness rows.", "Mark checks as automated, manual smoke, or future evidence-needed."]
  }),
  35: audit({
    status: "not-applicable",
    domain: "Reference",
    tools: ["Documents"],
    parityKeys: ["Realmz Win95/98/NT4, FAQ, What's New, License"],
    registryLabels: [],
    summary: "Manual platform chapter documents historical Realmz Windows compatibility.",
    handling: "Providence treats this as reference material, not an editor tool.",
    evidence: ["public/divinity-manual/index.html"],
    gaps: ["No authoring gap."],
    followUp: ["Mine only if a platform-specific scenario packaging issue appears."]
  }),
  36: audit({
    status: "not-applicable",
    domain: "Reference",
    tools: ["Documents"],
    parityKeys: ["Realmz Win95/98/NT4, FAQ, What's New, License"],
    registryLabels: [],
    summary: "Manual FAQ contains support/reference guidance rather than a discrete editor surface.",
    handling: "Providence exposes manual/help content as reference.",
    evidence: ["public/divinity-manual/index.html"],
    gaps: ["No direct authoring gap unless an FAQ item describes scenario behavior not covered elsewhere."],
    followUp: ["Mine FAQ items only when they contain runtime or packaging behavior not represented in evidence docs."]
  }),
  37: audit({
    status: "not-applicable",
    domain: "Reference / Compatibility",
    tools: ["Documents", "Linter"],
    parityKeys: ["Realmz Win95/98/NT4, FAQ, What's New, License"],
    registryLabels: [],
    summary: "Manual What's New describes historical version changes, including some scenario behavior changes.",
    handling: "Providence treats this as reference material, with relevant behavior folded into opcode/evidence docs when discovered.",
    evidence: ["public/divinity-manual/index.html", "docs/generated/divinity-opcode-help.json"],
    gaps: ["Behavior notes may still hide compatibility requirements that are not in current linter/evidence docs."],
    followUp: ["Mine What's New for behavior changes tied to scripts, terrain, and rules when auditing those domains."]
  }),
  38: audit({
    status: "not-applicable",
    domain: "Reference",
    tools: ["Documents"],
    parityKeys: ["Realmz Win95/98/NT4, FAQ, What's New, License"],
    registryLabels: [],
    summary: "Manual license chapter is legal/reference material.",
    handling: "Providence can display reference documents but has no scenario-authoring behavior to compare.",
    evidence: ["public/divinity-manual/index.html"],
    gaps: ["No authoring gap."],
    followUp: ["No parity work unless packaging/legal display requirements change."]
  })
};

function audit(entry) {
  return {
    status: entry.status,
    domain: entry.domain,
    tools: entry.tools ?? [],
    parityKeys: entry.parityKeys ?? [],
    registryLabels: entry.registryLabels ?? [],
    manualClaimSummary: entry.summary,
    currentHandling: entry.handling,
    evidence: entry.evidence ?? [],
    gaps: entry.gaps ?? [],
    recommendedFollowUp: entry.followUp ?? []
  };
}

function scriptingAudit(page, title) {
  return audit({
    status: "partial",
    domain: "Scripts",
    tools: ["Action Points", "Extra Action Points", "Code Helper"],
    parityKeys: [title],
    registryLabels: ["Action Points", "Extra Action Points"],
    summary: `Manual ${title} documents opcode meanings, Code/ID behavior, options, and Extra Code parameter shapes.`,
    handling: "Providence provides guided opcode picking, descriptions, target pickers, EDCD shape hints, flow summaries, diagnostics, and preservation of imported code slots.",
    evidence: ["docs/generated/ap-opcode-coverage.json", "docs/generated/opcode-edcd-crosswalk.json", "src/editor/generated/divinityOpcodeHelp.json"],
    gaps: ["Not every manual example has a dedicated guided form or inline example.", "Manual/source discrepancies, such as opcode 84, require explicit status rather than blind parity claims."],
    followUp: ["Use existing AP action coverage checks to produce opcode-by-opcode parity rows.", "Promote only source-backed or fixture-backed opcode behaviors into authoring controls."]
  });
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractManualChapters() {
  const html = readText(manualPath);
  const chapters = [];
  const sectionRe = /<section\s+id="page-(\d+)"[^>]*data-page="\d+"[^>]*data-title="([^"]+)"/g;
  let match;
  while ((match = sectionRe.exec(html))) {
    chapters.push({ page: Number(match[1]), title: decodeHtml(match[2]) });
  }
  return chapters.sort((a, b) => a.page - b.page);
}

function parseParityMap() {
  const markdown = readText(parityMapPath);
  const rows = new Map();
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith("| ") || line.includes("---")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 4 || cells[0] === "Divinity area") continue;
    rows.set(normalize(cells[0]), {
      divinityArea: cells[0],
      providenceDomain: cells[1],
      currentState: cells[2],
      nextEditorWork: cells[3]
    });
  }
  return rows;
}

function parseRegistryTools() {
  const source = readText(registryPath);
  const tools = [];
  const domainRe = /(\w+):\s*\{[\s\S]*?label:\s*"([^"]+)"[\s\S]*?tools:\s*\[([\s\S]*?)\n\s*\]/g;
  let domainMatch;
  while ((domainMatch = domainRe.exec(source))) {
    const domain = domainMatch[2];
    const block = domainMatch[3];
    const toolRe = /t\(\{\s*id:\s*"([^"]+)"\s*,\s*label:\s*"([^"]+)"[\s\S]*?workbench:\s*"([^"]+)"[\s\S]*?description:\s*"([^"]+)"/g;
    let toolMatch;
    while ((toolMatch = toolRe.exec(block))) {
      tools.push({
        domain,
        id: toolMatch[1],
        label: toolMatch[2],
        workbench: toolMatch[3],
        description: toolMatch[4]
      });
    }
  }
  return tools;
}

function parityEntriesFor(auditEntry, parityRows) {
  const entries = [];
  for (const key of auditEntry.parityKeys) {
    const row = parityRows.get(normalize(key));
    if (row) entries.push(row);
  }
  return entries;
}

function registryEntriesFor(auditEntry, registryTools) {
  const labels = new Set(auditEntry.registryLabels.map(normalize));
  return registryTools
    .filter((tool) => labels.has(normalize(tool.label)))
    .map((tool) => ({
      domain: tool.domain,
      id: tool.id,
      label: tool.label,
      workbench: tool.workbench,
      description: tool.description
    }));
}

function buildReport() {
  const manualChapters = extractManualChapters();
  const parityRows = parseParityMap();
  const registryTools = parseRegistryTools();
  const statusValues = new Set(Object.keys(STATUS_DEFINITIONS));
  const missingAudits = [];
  const invalidStatuses = [];

  const chapters = manualChapters.map((chapter) => {
    const entry = AUDIT_BY_PAGE[chapter.page];
    if (!entry) {
      missingAudits.push(chapter);
      return { ...chapter, status: "unknown" };
    }
    if (!statusValues.has(entry.status)) invalidStatuses.push({ page: chapter.page, status: entry.status });
    return {
      page: chapter.page,
      manualTitle: chapter.title,
      status: entry.status,
      domain: entry.domain,
      providenceTools: entry.tools,
      manualClaimSummary: entry.manualClaimSummary,
      currentHandling: entry.currentHandling,
      evidence: entry.evidence,
      gaps: entry.gaps,
      recommendedFollowUp: entry.recommendedFollowUp,
      parityMap: parityEntriesFor(entry, parityRows),
      registryTools: registryEntriesFor(entry, registryTools)
    };
  });

  if (missingAudits.length > 0) {
    throw new Error(`Missing audit entries for manual pages: ${missingAudits.map((chapter) => `${chapter.page} ${chapter.title}`).join(", ")}`);
  }
  if (invalidStatuses.length > 0) {
    throw new Error(`Invalid audit statuses: ${invalidStatuses.map((entry) => `${entry.page}:${entry.status}`).join(", ")}`);
  }

  const statusCounts = {};
  for (const chapter of chapters) statusCounts[chapter.status] = (statusCounts[chapter.status] ?? 0) + 1;

  return {
    version: 1,
    generatedBy: "scripts/report_divinity_manual_tool_audit.mjs",
    sourceInputs: [
      "public/divinity-manual/index.html",
      "docs/divinity-parity-map.md",
      "src/editor/workbench/registry.tsx",
      "docs/generated/*evidence*.json"
    ],
    statusDefinitions: STATUS_DEFINITIONS,
    statusCounts,
    chapterCount: chapters.length,
    chapters
  };
}

function statusBadge(status) {
  return status;
}

function list(items) {
  if (!items.length) return "- None recorded.";
  return items.map((item) => `- ${item}`).join("\n");
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Divinity Manual Tool Audit");
  lines.push("");
  lines.push("Generated by `scripts/report_divinity_manual_tool_audit.mjs`.");
  lines.push("");
  lines.push("This audit compares Divinity Manual 7.0 chapters to Providence tools. It tracks equivalent Realmz scenario-authoring capability, not pixel-for-pixel UI replication.");
  lines.push("");
  lines.push("## Status Vocabulary");
  lines.push("");
  for (const [status, description] of Object.entries(report.statusDefinitions)) {
    lines.push(`- \`${status}\`: ${description}`);
  }
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Status | Count |");
  lines.push("| --- | ---: |");
  for (const status of Object.keys(report.statusDefinitions)) {
    lines.push(`| ${status} | ${report.statusCounts[status] ?? 0} |`);
  }
  lines.push("");
  lines.push("## Chapter Matrix");
  lines.push("");
  lines.push("| Page | Manual Chapter | Status | Providence Domain | Providence Tools |");
  lines.push("| ---: | --- | --- | --- | --- |");
  for (const chapter of report.chapters) {
    lines.push(`| ${chapter.page} | ${chapter.manualTitle} | ${statusBadge(chapter.status)} | ${chapter.domain} | ${chapter.providenceTools.join(", ") || "Reference"} |`);
  }
  lines.push("");
  lines.push("## Chapter Details");
  for (const chapter of report.chapters) {
    lines.push("");
    lines.push(`### ${chapter.page}. ${chapter.manualTitle}`);
    lines.push("");
    lines.push(`- Status: \`${chapter.status}\``);
    lines.push(`- Providence domain: ${chapter.domain}`);
    lines.push(`- Providence tools: ${chapter.providenceTools.join(", ") || "Reference only"}`);
    if (chapter.parityMap.length) {
      lines.push(`- Existing parity map: ${chapter.parityMap.map((entry) => `${entry.divinityArea} -> ${entry.providenceDomain}`).join("; ")}`);
    }
    if (chapter.registryTools.length) {
      lines.push(`- Registry tools: ${chapter.registryTools.map((tool) => `${tool.domain}/${tool.label}`).join("; ")}`);
    }
    lines.push("");
    lines.push("Manual claim summary:");
    lines.push("");
    lines.push(chapter.manualClaimSummary);
    lines.push("");
    lines.push("Current Providence handling:");
    lines.push("");
    lines.push(chapter.currentHandling);
    lines.push("");
    lines.push("Evidence:");
    lines.push("");
    lines.push(list(chapter.evidence));
    lines.push("");
    lines.push("Gaps:");
    lines.push("");
    lines.push(list(chapter.gaps));
    lines.push("");
    lines.push("Recommended follow-up:");
    lines.push("");
    lines.push(list(chapter.recommendedFollowUp));
  }
  lines.push("");
  return `${lines.join("\n")}`;
}

function renderJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function writeOrCheck(filePath, contents) {
  if (checkMode) {
    const current = fs.existsSync(filePath) ? readText(filePath) : null;
    if (current !== contents) {
      throw new Error(`${path.relative(repoRoot, filePath)} is out of date. Run node scripts/report_divinity_manual_tool_audit.mjs.`);
    }
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, "utf8");
}

const report = buildReport();
writeOrCheck(markdownOut, renderMarkdown(report));
writeOrCheck(jsonOut, renderJson(report));

console.log(`Divinity manual tool audit: ${report.chapterCount} chapters, ${Object.entries(report.statusCounts).map(([status, count]) => `${status}=${count}`).join(", ")}`);
if (checkMode) console.log("Audit outputs are current.");
