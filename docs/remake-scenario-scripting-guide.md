# Scenario behaviors in Providence and Realmz Remake

Providence is the authoring environment. Realmz Remake owns execution and presentation.

A scenario behavior never receives a Godot node, `GameGlobal`, a scene, a resource, a file path, or a mutable character or item dictionary. It receives an immutable typed context and requests validated operations from the Scenario API. Remake routes those requests through the same map, combat, inventory, character, presentation, and persistence ports used by the Classic interpreter.

This keeps one execution model:

1. A Classic AP opcode, semantic action, or gameplay hook enters `ScenarioInterpreter`.
2. The interpreter creates a typed behavior frame.
3. Local queries execute deterministically. Yielding operations become typed commands.
4. The owning port validates and performs the command.
5. The response resumes the same serialized frame.

Safe behavior is the normal authoring path. Sandboxed GDScript is an advanced escape hatch that uses the same roles and capability API in a separate restricted process. Scenario packages never execute source in the main game process. Raw Godot access belongs to separately installed engine plug-ins.

## Start a Remake-enhanced scenario

Open **Scenario**, then select **Remake Enhanced** as the authoring target. Providence does not discard Classic compatibility merely because that switch is visible: target support is computed from the features actually used.

- A project with only Classic records can still export to native Realmz.
- Adding a Safe or sandboxed behavior makes the project Remake-only.
- Returning the UI to Classic Compatible does not delete incompatible behavior. Providence reports what must be removed or converted.

The Scenario tool owns the target choice because this is a package-wide authoring decision. **Spells, Races & Castes** remains a definition editor; it is not a gameplay-rules panel.

## Your first behavior

1. Open the AP, encounter, spell, item, monster, or Scenario record that should own the behavior.
2. Expand its **Behavior** section.
3. Choose **Create Safe Behavior**.
4. Build the logic in the vertical outline.
5. Open **Source** when a larger behavior is easier to read as code.
6. Choose **Preview This** to launch the temporary package in the real Remake window.

Providence creates and retains stable IDs internally. Normal authoring does not require record IDs, capability IDs, flattened encounter slots, argument JSON, or state-schema JSON.

The dedicated **Scripting** workbench is the project-wide library. Use it to:

- find and reuse behaviors;
- edit larger outlines or Safe source;
- declare persistent state;
- inspect attachments and argument mappings;
- define save migrations;
- configure built-in extensions and engine plug-in requirements;
- inspect the Scenario API;
- launch preview profiles and debug a behavior.

## Behavior roles

Every entry behavior has one role and hook. The role controls its input context, allowed operations, whether it may yield, and its result.

| Role | Hooks | Result |
| --- | --- | --- |
| Action | `run` | Continue, halt, call, replace, or return |
| Encounter | `enter`, `option`, `result`, `complete` | Continue, resolve, repeat, close, or branch |
| Spell | `validate`, `cast`, `effect` | Applied, no effect, or invalid |
| Item | `use-field`, `use-combat` | Used, rejected, or no effect |
| Monster AI | `decide` | Attack, cast, move, flee, wait, or use item |
| Lifecycle | campaign start/resume, map, movement, rest, time, battle, character, and party events | Completion |
| Rule modifier | a named calculation family | Additive, multiplicative, minimum, or maximum changes |
| Helper | no hook; called by another behavior | Its declared typed value |

Validation and rule-modifier hooks are pure. They cannot yield or mutate state. Other roles may yield only through operations whose API entry says they yield.

The generated API reference distinguishes runtime-connected hooks from reserved hooks. Providence will not export a behavior attached to a reserved hook. Spell duration tick/expiration, item equip/unequip/attack/defense/passive, and campaign completion are reserved for later runtime seams rather than silently accepted as no-ops.

### Action Points and XAPs

An Action behavior attaches to one AP/XAP action position. The binding remembers the trigger and slot, so several behavior calls on one AP do not all fire together.

Classic actions remain unchanged until an author deliberately adds a behavior. Export represents the call as the reserved `core.script.call` semantic instruction, and the central interpreter remains responsible for GOSUB frames, replacement, return, limits, tracing, and saves.

### Encounters

Encounter entry behavior runs before the native encounter presentation. A result attachment can be limited to the selected result slot. Completion runs after the resolved response. A close outcome can end the encounter, while a resolve or branch outcome can provide an explicit outcome number.

Use the contextual card on the selected encounter result instead of manually computing a flattened result ID.

### Spells

Spell validation is pure. Cast and effect behavior run through the Character and Combat ports. An attached custom implementation owns that spell resolution; ordinary Classic or shared-data spells continue through the established spell implementation.

Use separate helpers for reusable targeting or effect calculations. Duration tick and expiration hooks are reserved in the catalog but are not authorable until Remake has a single native duration-event owner. Store explicit duration state now; do not depend on a live coroutine or Godot object.

### Items

Field and combat use attachments are visible to the native item pickers. Remake resolves the `ItemInstance` to its stable definition and instance identities, then gives the behavior immutable snapshots. Item-instance state remains owned by that exact item instance scope.

Native item hooks still work for existing content. A scenario behavior is checked first only when a matching binding exists.

### Monster AI

A Monster AI behavior receives the monster snapshot and immutable combat snapshot. It returns one decision, which the combat bridge validates before converting it to a native move, attack, cast, flee, wait, or item action.

Do not mutate combat from an AI decision. Return the decision; use spell or item behavior for the resulting effect.

### Lifecycle

Lifecycle hooks currently cover campaign start/resume, map entry/leave, party movement, rest start/completion, time advancement, battle start/completion, character defeat, and party defeat. They all use the same serialized event queue. Campaign completion is reserved until Remake has an explicit, authoritative completion boundary.

Lifecycle behavior is ordered by binding priority and stable binding ID.

### Rule modifiers

Scenario behavior may modify a calculation, but cannot replace the active gameplay rules provider.

Resolution order is:

1. active gameplay-profile provider;
2. built-in extension modifiers;
3. scenario modifiers by priority and stable binding ID;
4. domain validation and clamping;
5. post-resolution notifications.

Initial families are attack chance, damage, healing, spell cost, movement cost, fatigue, experience, loot, encounter chance, rest recovery, time advancement, and condition resistance.

A modifier returns any combination of:

```gdscript
{"add": 5, "multiply": 1.25, "minimum": 0, "maximum": 50}
```

## The guided outline and Safe source

The outline and source editor share one canonical AST. They are two views of the same behavior, not two scripts.

- Outline edits update the AST and printed source.
- Valid source edits parse and type-check before replacing the AST.
- Invalid or unsupported source remains an editor draft.
- Providence never changes execution tier automatically.

The outline supports:

- If / Else If / Else
- Match
- bounded For Each
- Any / All / Find / Count / Filter
- local assignment
- persistent-state assignment
- helper calls
- typed Scenario API queries and actions
- role-appropriate return values

Safe source is deliberately GDScript-like:

```gdscript
func captain_offer() -> ActionOutcome:
    var wealth: WealthSnapshot = await party_wealth()
    var now: TimeSnapshot = await current_time()
    var party: Array[CharacterSnapshot] = await party_members()
    var healthy: bool = any(party, member, member.alive)
    if wealth.gold >= 500 and now.day <= 3 and healthy:
        await take_wealth(500)
        write_variable("paid_the_captain", true)
        await show_text("The captain accepts your payment.")
    else:
        await show_text("You have returned too late or without the money.")
    return {"kind": "continue"}
```

The exact collection-expression spelling available in a build is shown by autocomplete and the generated API reference. Unsupported syntax does not damage the last valid program.

### Safe language limits

Safe behavior supports typed primitives, optionals, enums, opaque references, read-only context records, homogeneous bounded arrays, locals, typed helper calls, conditionals, match, bounded iteration, and catalog operations.

It does not support:

- `while`;
- recursion;
- classes or inheritance;
- signals, lambdas, or arbitrary callables;
- reflection or dynamic method calls;
- nodes, resources, engine singletons, or autoloads;
- filesystem, network, processes, native code, or wall-clock access.

Limits are enforced by Providence, export validation, and Remake:

- 4,096 AST nodes;
- 256 entries per array;
- 32 behavior frames;
- one deterministic 65,536-step execution budget.

Frames, locals, iterators, return values, event context, pending commands, and deterministic RNG state are serializable.

## Scenario API

Providence and Remake consume byte-identical copies of `remake-scenario-capabilities.v2.json`. The catalog is the contract, not a handwritten list in this guide.

Each operation declares:

- stable ID and API version;
- friendly label and category;
- owning port;
- parameter and result types;
- compatible roles;
- yield and mutation behavior;
- minimum security tier;
- deprecation information;
- summary, reference, example, and editor hints.

Open **Scripting → API Reference** for searchable in-app documentation. The generated [Scenario API v2 reference](generated/scenario-api-v2.md) is built from the same file. CI rejects public operations without role compatibility, parameter/result descriptions, and a compiling example.

Queries return immutable snapshots and opaque references. Commands validate their request before touching game state. An operation unavailable in the loaded catalog is an export/readiness error; Providence and Remake do not insert a fallback.

## State

Choose state by ownership:

| Scope | Use |
| --- | --- |
| Campaign | Multi-stage quests and campaign-wide choices |
| Map | Per-map mutations and visits |
| Encounter | A running encounter's explicit state |
| Character | State attached to one stable character |
| Item instance | Charges or custom state belonging to one carried instance |
| Combat | State that lasts for one battle |
| Transient | Local execution only; never saved |

Classic quest flags remain available through the named compatibility adapter. Prefer named typed state for new work.

Each state definition has a type, default, schema version, documentation, and optional owner. Saves include persistent values plus their schema contracts.

## Scenario updates and migrations

A released scenario update keeps the same stable campaign identity and changes its content version. If persistent state changes, add an exact migration chain in **Scripting → State → Save Migrations**.

A migration:

- names an exact source and target content version;
- calls a Safe helper with no parameters and a `void` return;
- is pure with respect to presentation and gameplay commands;
- cannot yield;
- must produce values matching the target state schemas.

Remake never guesses. A missing, cyclic, ambiguous, yielding, or incompatible chain blocks the save with an actionable message. A suspended behavior cannot be migrated mid-command.

Idle saves and suspended saves both retain scenario state. Save schema 5 pins:

- campaign identity, content version, and package hash;
- API catalog hash;
- behavior versions and hashes;
- state-schema versions;
- Safe frames and pending commands;
- sandbox reducer state;
- resolved gameplay rules;
- required plug-ins and API versions.

## Preview and debugger

Providence exports the current project atomically to a temporary v3 package and launches an external Remake window with an ephemeral profile, deterministic party, and RNG seed.

**Preview This** selects the owning behavior and entry point. Preview profiles can set party composition, stats, inventory, wealth, time, flags, location, rules, and seed. Profiles and assertions remain authoring data and are not shipped.

The debugger dock shows:

- source-linked diagnostics;
- active behavior and call stack;
- locals and persistent values;
- immutable context snapshots and watches;
- event and command timeline;
- pending yield;
- source-node breakpoints;
- step into, over, out, resume, refresh, and restart;
- runtime errors and presentation screenshots.

Safe behavior pauses at block boundaries. Sandboxed scripts pause at reducer boundaries. **Apply and Restart** starts from clean package state at the selected entry point; live VM patching is intentionally not part of this contract.

## Sandboxed GDScript

Choose **Advanced → Convert to Sandboxed GDScript** only when the Safe language cannot express the behavior.

Sandboxed source is preserved byte-for-byte and hashed. It runs in a separate persistent Godot process under the same role and capability contract. Each reducer step receives an event, previous explicit JSON state, and restricted context, then returns new JSON state plus continue/yield/halt/error.

On Windows the runner uses AppContainer/LPAC isolation and Job Object limits. It denies network, child processes, native libraries, arbitrary filesystem access, PCK loading, and main-process access. Messages, state, depth, process count, memory, CPU time, wall time, and request rate are bounded.

If the isolation feasibility check fails, a scenario requiring sandboxed code fails readiness. It never falls back to in-process execution.

## Engine plug-ins

Raw Godot or Remake access belongs to a separately installed engine plug-in:

- installed and approved independently from the scenario;
- versioned against the engine plug-in API;
- able to register namespaced capabilities or providers;
- unable to replace reserved core opcodes, commands, or providers;
- declared as a package requirement.

A missing or incompatible plug-in blocks readiness. The scenario package contains only the plug-in ID, API requirement, and data configuration—not the executable plug-in.

## Recipes

### Gold plus deadline plus party condition

Query wealth, time, and party snapshots; combine the conditions; take wealth; update campaign state; present the result. This is the canonical example of logic Classic AP slots could not express as one condition.

### Multi-stage quest

Use a campaign enum or integer state. Entry APs inspect it, encounter results advance it, and completion APs return a role outcome. Keep dialogue in Text records or presentation operations rather than using state names as player text.

### Timed encounter

Use a time-advanced lifecycle behavior, inspect the deterministic scenario calendar, set a campaign guard state, then start or schedule the encounter. The guard prevents duplicate dispatch after save/restore.

### Custom spell and status effect

Use pure validation, cast presentation, and effect application. Store duration in combat or character state. Damage, healing, effects, spawning, and animation go through their catalog operations. Tick/expire bindings remain unavailable until Remake exposes the authoritative duration-event boundary.

### Combat and field item use

Attach separate `use-field` and `use-combat` behaviors to the same item. Share calculations in a helper. Store per-copy state in item-instance scope.

### Encounter result

Select the result card in the Encounter editor and create its Behavior. Providence records the result slot internally. Return continue, resolve, close, repeat, or branch.

### Monster priorities

Read the immutable combat snapshot, select one legal target, and return one decision. Keep the function deterministic; use scenario RNG when a tie must be randomized.

### Campaign start and map entry

Use lifecycle behaviors to initialize named state or present one-time material. Guard one-time actions with campaign or map state because start/resume and map entry are separate events.

### Bounded rule adjustment

Attach a pure rule modifier to the named calculation family. Return additive/multiplicative/clamp fields and use explicit priority when several modifiers compose.

## Common mistakes

- Do not type stable IDs when a record picker exists.
- Do not put display text in state or binding names.
- Do not use a rule modifier for an effect that should be a spell, item, or encounter command.
- Do not mutate state from validation or modifier hooks.
- Do not use sandboxed source merely to avoid learning the Safe API.
- Do not expect full GDScript to grant additional game capabilities.
- Do not store a Godot object in state.
- Do not change a released state schema without an exact migration.
- Do not package executable plug-in files inside a scenario.
- Do not assume preview approval or workspace paths ship with the campaign.

## Runtime and package contracts

Providence project schema 8 stores behavior definitions, typed bindings, state definitions, migrations, provider bindings, required extensions, and required engine plug-ins.

Bundle v3 uses `remake/scripts.json` schema 2:

- Safe canonical programs or exact sandboxed source manifests;
- typed behavior metadata and hashes;
- deterministic bindings and priorities;
- state definitions and migrations;
- API catalog hash and shared limits.

Classic decoding evidence lives in `classic/evidence.json`, separate from gameplay documents. Remake validates its package integrity at installation but does not load the evidence sidecar during ordinary play.

For runtime contributors:

- `ScenarioInterpreter` owns all AP/XAP and behavior frames.
- `ScenarioScriptRuntime` owns Safe execution, sandbox reducer state, snapshots, and migrations.
- `ScenarioCommandRouter` enforces one owning port per command.
- the six ports own game-facing mutation and presentation;
- the API catalog owns public script surface and documentation;
- installed extensions and plug-ins register only namespaced, non-core providers.

Adding an operation is incomplete until the catalog, port implementation, Providence authoring surface, Safe parser/printer, save/restore behavior, preview diagnostics, generated reference, examples, and cross-repository tests agree.
