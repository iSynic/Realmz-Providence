# Writing Realmz Remake scenario scripts with Providence

This is the practical authoring guide for the coordinated Providence and Realmz Remake scripting work. It explains what to click in Providence, what the different script choices actually mean, how a script joins an Action Point or encounter, what Remake does with it, and how to preview and debug the result.

The short version is:

- Providence is where you author the scenario.
- Realmz Remake is where the scenario runs.
- Normal Classic Action Points still use the central scenario interpreter.
- Safe scripts add a small, typed, GDScript-like language to that same interpreter.
- Sandboxed and trusted scripts are advanced escape hatches, not the normal starting point.
- A script never gets direct ownership of the map, combat UI, inventory, or save system. It requests a declared operation, and the existing runtime ports perform it.

This guide describes the current feature branches and bundle v3 contract. The scripting UI and runtime are still pre-release. The ordinary Safe Script path is the part authors should build around first. The full-GDScript tiers have working policy and execution foundations, but they intentionally have stricter deployment requirements and less polished player-facing setup.

## The mental model

Providence and Remake are not two competing scenario engines.

Providence owns:

- the editable project;
- Classic records such as maps, APs, encounters, battles, monsters, items, spells, races, and castes;
- named Remake scripts and their typed state;
- validation and target-support decisions;
- deterministic bundle v3 export; and
- the desktop preview launcher.

Remake owns:

- campaign installation and readiness checks;
- the central `ScenarioInterpreter`;
- Classic opcode handlers;
- safe-script VM frames;
- sandboxed and trusted script execution policy;
- map, combat, inventory, character, presentation, and persistence ports;
- save and restore; and
- the actual game window used for preview.

The normal execution path looks like this:

```text
Player steps on an AP
  -> ScenarioInterpreter reads the next Classic or semantic instruction
  -> core.script.call opens a named scenario-script frame
  -> the script runs until it finishes or requests a yielding operation
  -> the command router sends that request to the owning Remake port
  -> the port shows text, asks a choice, teleports, starts combat, and so on
  -> the response resumes the same script frame
  -> the script returns to the original AP instruction list
```

That last point matters. Safe scripts do not create a second AP executor. They extend the interpreter that already handles the imported Realmz logic.

## Start by choosing the scenario format

Open the **Scenario** tool and find **Scenario Format**.

You will see two choices:

- **Classic Realmz scenario** keeps the project eligible for both native Realmz and Remake export.
- **Realmz Remake scenario** reveals the **Scripting** tool and permits Remake-only features.

Changing the format selector does not itself rewrite or discard content. Providence computes actual export support from the features in the project.

For example:

- Merely selecting the Remake format does not make a project permanently incompatible with native Realmz.
- Recommending `core.samuel` instead of `core.classic` does not make it Remake-only.
- Adding a scenario script does make it Remake-only.
- Adding a semantic operation or an active Remake provider binding also makes it Remake-only.
- Providence will not let you return to the Classic format while those Remake-only features remain. You must deliberately remove or convert them first.

This gives you room to start with a Classic-compatible scenario, use the regular AP and encounter editors for most behavior, and opt into Remake scripting only where it buys you something real.

## Which execution tier should I choose?

Providence currently shows three execution tiers. They are intentional, but they are not three equally ordinary ways to write the same script.

| Tier | What you author | Where it runs | Best use |
| --- | --- | --- | --- |
| **Safe VM subset** | A small typed GDScript-like language | Inside the central scenario VM | Normal scenario logic, quests, choices, state, teleports, and battles |
| **Sandboxed full GDScript** | Exact GDScript source using a reducer contract | A separate restricted Godot process on Windows | Advanced logic that needs more language flexibility but should not receive the user's full account privileges |
| **Trusted full GDScript** | Exact GDScript source using the same reducer contract | Inside the main Remake process after explicit approval | Developer-controlled code that genuinely cannot fit the safe or sandboxed model |

A good rule of thumb is:

1. Use ordinary Classic AP actions when an existing opcode already expresses the behavior.
2. Use a Safe Script when you need clearer stateful logic or a combination of supported operations.
3. Use a built-in extension/provider when the behavior should become a reusable, reviewed game feature.
4. Use Sandboxed full GDScript only when the safe language is too small and the Windows sandbox is available.
5. Use Trusted full GDScript only when you control and trust the package as software.

Do not choose Trusted merely because it says “full GDScript.” A trusted script executes with the user's account privileges. It is closer to installing a mod or program than opening scenario data.

### What “Safe GDScript” really means

The Safe tier is not arbitrary GDScript with a word blacklist.

Providence parses an allowlisted language, type-checks it, and stores a canonical syntax tree. Export turns that tree into deterministic VM instructions in `remake/scripts.json`. No `.gd` file is generated, packaged, or executed for a Safe Script.

The syntax deliberately resembles GDScript so authors do not have to learn a completely alien notation. The security and determinism come from the fact that only the supported grammar exists.

### What “Sandboxed full GDScript” really means

The Sandboxed tier preserves the exact UTF-8 source in the package. Remake launches it through a separate headless Godot runner inside a Windows AppContainer and Job Object. The helper limits filesystem and network authority, process count, memory, CPU time, message size, state size, and request count.

The script does not receive a node from the main game or a reference to Remake's `SceneTree`. It receives an event, explicit JSON state, and a restricted context. It can return a declared command request. Remake validates that request before routing it.

The source scanner rejects known dangerous Godot API tokens as defense in depth. The operating-system process boundary is the actual security boundary; a blacklist by itself would not be sufficient.

If the sandbox helper is unavailable, a campaign that requires it fails readiness. Remake does not silently run the script as trusted code.

### What “Trusted full GDScript” really means

The Trusted tier also preserves exact source and uses the reducer contract, but it runs in the main Remake process. It therefore must be treated as executable code.

Remake requires:

- Developer Scripting to be enabled;
- approval of the exact package hash;
- approval of the package's aggregate requested capabilities; and
- a fresh approval after any script or manifest change.

Approvals are user-local. They are not stored in the Providence project, exported package, or campaign save.

The runtime policy is implemented, but the current feature branch does not yet have a finished player-facing approval screen. Treat Trusted scripts as a developer path until that UI exists.

## Your first Safe Script: a complete quest offer

This walkthrough makes an AP ask the party to accept a quest, records the answer, shows a message, teleports the party, and starts a battle.

### 1. Prepare the ordinary scenario records

Before writing code:

1. Create or identify the AP that should offer the quest.
2. Create the battle you want to start and note its numeric battle ID.
3. Confirm the destination map, map index, and coordinate.
4. Decide whether the quest state belongs in a Classic quest flag or a named Remake variable.

Use a Classic quest flag when:

- existing Realmz actions already read or write that flag;
- imported scenario logic depends on it; or
- you want the state to remain easy to compare with the original scenario.

Use a named Remake variable when:

- the state has no Classic equivalent;
- a descriptive name is clearer than a numeric flag;
- you need `bool`, `float`, `String`, or a typed array; or
- the state belongs only to new Remake behavior.

For this example, create an integer variable named `beast_quest_stage`.

### 2. Switch the project to Remake

In **Scenario**:

1. Set **Scenario format** to **Realmz Remake scenario**.
2. Leave **Recommended gameplay profile** at **Classic fidelity** unless the scenario is intentionally designed around Samuel's native behavior.
3. Click **Open Scripting**, or choose **Scripting** from the left-side domain rail.

### 3. Create persistent state

In **Scripting**, open **State & Hooks**.

Click **Add Variable** and set:

- **Name:** `beast_quest_stage`
- **Type:** `int`
- **Array maximum:** blank
- **Default:** `0`

Persistent variables are part of campaign state and are included in saves. Their names and types are validated when the package is exported and when a save is restored.

### 4. Add the script

Open **Scripts** and click **Add Script**.

Providence creates:

- a stable namespaced script ID;
- a display name;
- a Safe tier definition;
- a `void` return type; and
- a minimal function body.

Change the display name to something useful, such as **Offer beast quest**. Put the design intent in **Documentation**, for example:

> Offers the stable-master quest once, sets its stage, moves the party to the paddock, and starts battle 7.

Use the Documentation field for durable notes. Safe-source comments are accepted while editing, but the canonical source of truth is the parsed AST, so comments are not currently preserved when Providence prints that AST again.

Leave:

- **Execution tier:** `Safe VM subset`
- **Return type:** `void`
- **Typed parameters:** `[]`
- **Explicit state schema:** `{}`

Replace the script text with:

```gdscript
func offer_beast_quest() -> void:
    if persistent.beast_quest_stage == 0:
        var accepted: int = await choose("Will you help stop the wild beasts?", ["Yes", "Not yet"])
        if accepted == 0:
            persistent.beast_quest_stage = 1
            write_quest(42, 1)
            await show_text("The stable master marks the paddock on your map.")
            await teleport("land", 2, 10, 6)
            await start_battle(7)
        else:
            await show_text("The stable master tells you where to find him.")
    else:
        await show_text("The stable master is waiting for news.")
    return
```

Then click **Apply Script**.

Providence will parse and type-check the script. If it succeeds, the canonical AST replaces the previous version. If it fails, the existing canonical script remains unchanged and the editor shows diagnostics. The invalid text is only a draft, so do not navigate away assuming it has been committed.

### 5. Attach the script to the AP

Still in **Scripting**, open **State & Hooks** and click **Add Attachment**.

Set:

- **Target:** `AP / XAP`
- **Stable record ID:** the AP's stable ID
- **Slot / result:** the instruction slot that should call the script
- **Lifecycle hook:** disabled
- **Script:** `Offer beast quest`

The slot is zero-based in this advanced editor. Slot `0` is the first action, slot `1` is the second, and so on.

At export, Providence replaces that exported slot with:

```json
{
  "kind": "semantic",
  "slot": 0,
  "operation": "core.script.call",
  "parameters": {
    "scriptId": "scenario.example.offer-beast-quest"
  }
}
```

The rest of the AP stays in its normal Classic representation. The script call can therefore sit before, between, or after ordinary Classic actions.

Be deliberate about replacement: attaching a script to an occupied slot replaces the action exported at that slot. It does not insert a ninth AP action or shift the remaining actions.

### 6. Preview it

Open **Export** and find **Realmz Remake Preview**.

The managed companion requires Providence desktop. Browser Providence can author, validate, and export the package, but a browser page cannot launch the local Remake process.

For a Remake source checkout:

1. Set **Godot executable** to the Godot executable you use for the Remake project.
2. Set **Remake checkout or executable** to either the repository root or the folder containing `project.godot`.
3. Set **Entry point** to **Action point ID**.
4. Enter the same stable AP ID.
5. Click **Apply and Restart**.

For an installed Remake build, set **Remake checkout or executable** directly to the game executable. In that case Providence does not need the Godot executable to launch it.

Providence will:

- export the current project to a temporary v3 package;
- create an ephemeral preview profile;
- launch an external Remake window;
- admit a deterministic test party;
- start the selected AP;
- report runtime events back to Providence; and
- remove the temporary session when the preview stops.

Every **Apply and Restart** run begins from clean package and profile state. Editing a script does not patch a running VM.

### 7. Verify the behavior, not just the absence of errors

For the sample quest, check all of these:

- The first visit presents the choice.
- Choosing **Not yet** does not advance either state value.
- Choosing **Yes** sets both the named stage and Classic quest flag.
- The text closes and the teleport occurs once.
- Battle 7 starts once.
- Returning to the AP follows the already-started branch.
- Saving while a choice or presentation command is pending can restore the script continuation.

That is a much stronger test than “the AP did not crash.”

## Safe Script language reference

The Safe language currently accepts exactly one typed function per named script.

### Function form

```gdscript
func function_name(parameter_name: int, label: String) -> bool:
    return true
```

The function header must match the script definition shown above the editor:

- parameter names must match;
- parameter order must match;
- parameter types must match; and
- the return type must match.

The function name itself is local documentation. Other scripts call the stable script ID, not the function name.

### Supported value types

| Providence type | Safe source spelling | Notes |
| --- | --- | --- |
| `void` | `void` | Only valid as a return type |
| `bool` | `bool` | `true` or `false` |
| `int` | `int` | Signed 64-bit integer contract |
| `float` | `float` | 64-bit floating-point contract |
| `string` | `String` | UTF-8 text |
| `bool-array` | `Array[bool]` | Homogeneous, bounded |
| `int-array` | `Array[int]` | Homogeneous, bounded |
| `float-array` | `Array[float]` | Homogeneous, bounded |
| `string-array` | `Array[String]` | Homogeneous, bounded |

Arrays cannot nest. Every authored array is limited to 256 elements, and array parameters or persistent variables should declare the smaller practical maximum when one is known.

### Locals and assignment

Declare a typed local:

```gdscript
var stage: int = 2
var greeting: String = "Welcome back."
var choices: Array[String] = ["North", "South"]
```

Assign to an existing local:

```gdscript
stage = stage + 1
```

Read or write a declared persistent variable:

```gdscript
var stage: int = persistent.beast_quest_stage
persistent.beast_quest_stage = stage + 1
```

You can also use `read_variable` and `write_variable`, but `persistent.name` is usually clearer when the variable name is fixed:

```gdscript
var stage: int = read_variable("beast_quest_stage")
write_variable("beast_quest_stage", stage + 1)
```

### Conditions

```gdscript
if stage == 0:
    await show_text("Nothing has happened yet.")
elif stage == 1:
    await show_text("The quest is active.")
else:
    await show_text("The quest is complete.")
```

Supported control flow is intentionally bounded:

- `if`
- `elif`
- `else`
- `return`

There are no `for`, `while`, `match`, or unbounded retry constructs.

### Expressions

The current expression grammar supports:

- integer, float, string, boolean, and array literals;
- local and persistent variable references;
- unary `not` and numeric negation;
- `+`, `-`, `*`, `/`, and `%`;
- `==`, `!=`, `<`, `<=`, `>`, and `>=`; and
- boolean `and` and `or`.

Use explicit, small expressions. Safe scripts are scenario logic, not a general-purpose math runtime.

### Comments

Use `#` for comments while editing:

```gdscript
# This flag is shared with the original AP chain.
write_quest(42, 1)
```

Comments are stripped by the current canonical parser. Put important design explanations in the script's **Documentation** field.

### Available operations

Safe scripts use friendly function names. Providence compiles them to stable capability IDs for Remake.

| Safe function | Capability | Yields? | Result |
| --- | --- | --- | --- |
| `read_quest(id)` | `core.state.read` | No | `int` |
| `write_quest(id, value)` | `core.state.write` | No | `void` |
| `read_variable(name)` | `core.state.read` | No | Declared variable type |
| `write_variable(name, value)` | `core.state.write` | No | `void` |
| `show_text(text)` | `core.presentation.text` | Yes | `void` |
| `choose(prompt, options)` | `core.presentation.choice` | Yes | Selected zero-based index |
| `teleport(level_type, level_index, x, y)` | `core.map.teleport` | Yes | `void` |
| `start_battle(battle_id)` | `core.encounter.start-battle` | Yes | `void` |
| `roll(maximum)` | `core.rng.roll` | No | Integer from 1 through `maximum` |

Yielding operations must use `await`:

```gdscript
await show_text("The door opens.")
var answer: int = await choose("Enter?", ["Enter", "Leave"])
await teleport("dungeon", 3, 12, 8)
await start_battle(15)
```

Non-yielding operations must not use `await`:

```gdscript
var flag: int = read_quest(42)
write_quest(42, 2)
var die: int = roll(6)
```

Providence reports both mistakes:

- forgetting `await` on a yielding operation; and
- adding `await` to an operation that completes locally.

### Calling another named Safe Script

Use `script_call` with the target's stable script ID followed by its arguments:

```gdscript
func advance_quest(next_stage: int) -> void:
    script_call("scenario.example.record-stage", next_stage)
    await show_text("Your journal has been updated.")
    return
```

The target script must already exist in the project. Providence validates the argument count and rejects call cycles. Remake also caps runtime call depth.

Use named helper scripts when the behavior has one clear job and is reused from several APs. Do not split a three-line linear action into six tiny scripts merely to make it “modular.”

### Unsupported Safe syntax

The following are not part of the Safe tier:

- loops;
- recursion;
- nested arrays;
- classes or `class_name`;
- `extends`;
- node creation;
- inheritance;
- signals;
- lambdas or callables;
- reflection;
- dynamic method calls;
- file or directory access;
- networking;
- threads;
- direct Godot APIs; and
- arbitrary scene or autoload access.

Unsupported source stays an editor draft and does not replace the last valid AST. Providence may eventually offer a clearer advanced-tier workflow, but it never changes a script from Safe to full GDScript automatically.

## Common Safe Script recipes

### Show an introduction only once

Create a `bool` persistent variable named `intro_seen` with default `false`:

```gdscript
func show_intro() -> void:
    if not persistent.intro_seen:
        await show_text("Rain falls over the eastern gate.")
        persistent.intro_seen = true
    return
```

### Use a Classic quest flag as a state machine

```gdscript
func visit_watch_captain() -> void:
    var stage: int = read_quest(12)
    if stage == 0:
        var accepted: int = await choose("Investigate the old tower?", ["Yes", "No"])
        if accepted == 0:
            write_quest(12, 1)
            await show_text("The captain gives you the tower key.")
    elif stage == 1:
        await show_text("The old tower lies beyond the north road.")
    else:
        await show_text("The captain thanks you for your help.")
    return
```

### Make a deterministic random branch

```gdscript
func roadside_event() -> void:
    var result: int = roll(100)
    if result <= 20:
        await show_text("Bandits spring from the brush.")
        await start_battle(21)
    elif result <= 60:
        await show_text("You find wagon tracks leading east.")
    else:
        await show_text("The road is quiet.")
    return
```

`roll` uses campaign-owned deterministic RNG state. Its result survives the same save/restore boundary as the script VM. Do not replace it with time, operating-system, or Godot-global randomness.

### Choose a destination

```gdscript
func use_waystone() -> void:
    var destination: int = await choose("Where should the waystone carry you?", ["Bywater", "Mithril Vault", "Remain here"])
    if destination == 0:
        await teleport("land", 0, 2, 2)
    elif destination == 1:
        await teleport("land", 4, 0, 0)
    return
```

The choice result is zero-based. The first option is `0`.

### Start a battle and continue afterward

```gdscript
func confront_guardians() -> void:
    await show_text("Stone guardians grind to life.")
    await start_battle(33)
    persistent.guardians_defeated = true
    await show_text("The vault falls silent.")
    return
```

The script yields while the normal Remake combat lifecycle runs. When combat returns a response, the VM resumes after `start_battle`.

If the scenario needs different behavior for victory, escape, or another battle outcome, confirm the current battle response contract before authoring around it. The first Safe catalog exposes battle start, but does not yet expose a rich, typed battle-outcome object in the source language.

## Parameters and return values

Scripts can accept typed parameters. In the current UI, **Typed parameters** is a JSON array.

For:

```gdscript
func set_stage(stage: int, announce: bool) -> void:
    persistent.quest_stage = stage
    if announce:
        await show_text("Your journal has been updated.")
    return
```

enter:

```json
[
  {
    "name": "stage",
    "valueType": "int",
    "maxLength": null
  },
  {
    "name": "announce",
    "valueType": "bool",
    "maxLength": null
  }
]
```

Then set **Return type** to `void`.

The current AP attachment editor calls a named script without an argument-mapping UI. Parameterized scripts are therefore most useful as helpers called by another Safe Script. A future attachment form can expose typed argument values without changing the bundle contract.

## Script attachments: what runs where

The **State & Hooks** tab currently offers these target kinds:

- **AP / XAP**
- **Simple encounter result**
- **Complex encounter result**
- **Campaign lifecycle**

AP/XAP and encounter-result attachments are the usable authoring path today. Providence materializes them as `core.script.call` semantic instructions in the selected action/result slot.

For encounter attachments:

- use the stable encounter record ID;
- use the result/action slot expected by that encounter record;
- remember that the attachment replaces the exported action in that slot; and
- test every player response that can reach it.

Campaign lifecycle attachments are represented and validated in schema 7 and `remake/scripts.json`, but the current runtime does not yet turn those attachment records into executable lifecycle calls. Do not depend on a script attachment such as `campaign_start` or `campaign_quit` yet.

The separate **Bindings** tab can point lifecycle keys at built-in extension provider IDs. That is a different mechanism and only works for providers compiled into Remake.

## Persistent state and saves

There are three relevant kinds of state.

### Classic quest state

Classic quest flags live in the compatibility runtime and are visible to imported Classic opcodes as well as scripts:

```gdscript
var value: int = read_quest(42)
write_quest(42, value + 1)
```

Use this for state that participates in existing Realmz behavior.

### Named Safe state

Typed persistent variables are declared in Providence and stored in the campaign save:

```gdscript
persistent.bridge_repaired = true
persistent.guild_rank = 3
```

Remake checks saved variables against the current declarations during restore. Removing or renaming a variable can make an old save incompatible, which is better than silently loading the wrong meaning.

### Full-tier reducer state

Sandboxed and trusted scripts return explicit JSON-compatible state on every reducer step. Remake stores it per script and validates it against the script's declared JSON schema.

The campaign save pins:

- the package hash;
- the capability-catalog hash;
- script hashes;
- script API versions;
- state-schema hashes;
- Safe VM frames;
- pending commands;
- deterministic RNG state; and
- full-tier reducer state.

A changed package or incompatible script schema is not treated as the same executable campaign. This avoids resuming into different code at an old instruction pointer.

## Sandboxed full GDScript

Use this tier only when you need language features the Safe AST does not offer and your target users can run the Windows sandbox helper.

### Source contract

A full-tier script implements:

```gdscript
func step(event: Dictionary, state: Dictionary, context) -> Dictionary:
    return {
        "state": state,
        "result": context.continued()
    }
```

The three arguments are:

- `event`: why the reducer is running;
- `state`: the script's previous explicit JSON state; and
- `context`: the restricted operation/result factory.

The return object must contain:

- `state`: the complete next JSON state; and
- `result`: one of `continue`, `yield`, `halt`, or `error`.

### Event flow

The first event has:

```json
{
  "kind": "invoke",
  "arguments": {}
}
```

After a routed command finishes, the next event has:

```json
{
  "kind": "command-result",
  "capability": "core.presentation.choice",
  "response": {}
}
```

State, RNG, and other locally handled capabilities may return an `operation-result` event inside the reducer loop rather than leaving the runtime process.

### Example reducer

Set **Requested capabilities** to:

```text
core.presentation.text, core.presentation.choice
```

Set **Explicit state schema** to:

```json
{
  "type": "object",
  "properties": {
    "phase": {
      "type": "integer"
    }
  },
  "required": [
    "phase"
  ],
  "additionalProperties": false
}
```

Then use:

```gdscript
func step(event: Dictionary, state: Dictionary, context) -> Dictionary:
    var next_state := state.duplicate(true)
    var phase := int(next_state.get("phase", 0))
    var event_kind := str(event.get("kind", ""))

    if event_kind == "invoke":
        next_state["phase"] = 1
        return {
            "state": next_state,
            "result": context.command(
                "core.presentation.text",
                {"text": "The mechanism hums beneath your hand."}
            )
        }

    if event_kind == "command-result" and phase == 1:
        next_state["phase"] = 2
        return {
            "state": next_state,
            "result": context.command(
                "core.presentation.choice",
                {
                    "prompt": "Turn the dial?",
                    "options": ["Clockwise", "Counterclockwise", "Leave it"]
                }
            )
        }

    return {
        "state": next_state,
        "result": context.continued(event.get("response"))
    }
```

The important discipline is that every step is reconstructable from `event + previous state`. Do not hide campaign state in nodes, resources, callables, or live coroutines.

### Available context results

The current restricted context supplies:

```gdscript
context.command(capability_id, arguments)
context.continued(value)
context.halted(value)
context.failed(message)
```

Every `context.command` capability must appear in **Requested capabilities**, and it must exist in Remake's built-in capability catalog. The current catalog is still the same quest vertical slice used by Safe scripts. Full GDScript gives you more language flexibility; it does not magically create more game APIs.

### Sandbox availability

At readiness, Remake checks:

- the operating system is Windows; and
- `scenario-sandbox-host.exe` is installed next to the Remake executable.

If either check fails, the campaign is blocked with `sandbox-unavailable`.

The sandboxed source is also:

- confined to a declared `remake/source/*.gd` path;
- checked against the exported SHA-256;
- limited to bounded JSON messages and state;
- limited in reducer and request counts; and
- denied undeclared capability requests.

## Trusted full GDScript

Trusted scripts use the same `step(event, state, context)` reducer contract and the same declared capabilities. The difference is where the script runs.

Because it runs in the main game process, a malicious Trusted script may be able to reach APIs beyond the supported context. The context is the compatibility contract, not a security sandbox.

Use Trusted only when:

- the author and player understand it is executable code;
- the package comes from a trusted source;
- the exact package hash has been reviewed;
- the feature cannot reasonably become a Safe capability or built-in extension; and
- invalidating approval on every code change is acceptable.

Do not distribute a Trusted script with language that implies it is “safe because Providence scanned it.” Providence preserves and hashes the source. Remake's explicit trust decision is the security boundary.

## Extensions, semantic actions, and bindings

The Scripting workspace also has **Extensions** and **Bindings** tabs. These are not places to load arbitrary GDScript from a campaign folder.

### Built-in extensions

An extension is trusted code shipped under Remake's `res://` tree and registered by a stable, namespaced ID. A scenario can:

- require that built-in extension and API version;
- provide JSON configuration allowed by its schema;
- call one of its declared semantic operations; or
- bind scenario records to one of its declared providers.

A scenario cannot:

- replace a core Classic opcode;
- override a core command ID;
- point at an arbitrary `.gd` path;
- load a PCK or native library; or
- cause Remake to scan its folder for scripts.

At the moment, the generated extension catalog contains a conformance fixture that proves the extension surfaces. It is not a production gameplay library for scenario authors. Treat the Extensions and Bindings tabs as architecture-facing until real built-in providers are added.

### Semantic actions

A semantic action is a namespaced operation placed in a Classic action slot:

```json
{
  "kind": "semantic",
  "slot": 2,
  "operation": "scenario.example.open_portal",
  "parameters": {
    "destination": "vault"
  }
}
```

The operation must belong to a required built-in extension and match its parameter schema. Providence validates that relationship before export.

`core.script.call` is the one reserved core semantic operation authors normally use indirectly through script attachments.

### Provider bindings

Bindings connect scenario identities to stable providers in these families:

- spells;
- items;
- encounters;
- monster AI; and
- lifecycle hooks.

The provider must be compiled into Remake and declared by a required extension. Bindings do not embed implementation code.

If a behavior would be valuable in many scenarios, a built-in provider is usually a better long-term home than copying a full GDScript reducer into every package.

## Previewing Providence projects in Remake

### Browser versus desktop

The Providence browser build can:

- create and edit scripts;
- parse and type-check Safe source;
- validate project relationships;
- compute target support; and
- export v3 packages.

It cannot launch a local process.

Providence desktop adds:

- machine-local Godot and Remake paths;
- atomic temporary export;
- external process management;
- authenticated loopback communication; and
- streamed Remake diagnostics and traces.

### Setting up the companion

Open **Export** and find **Realmz Remake Preview**.

If using a source checkout:

- **Godot executable:** the Godot executable that can run the Remake project;
- **Remake checkout or executable:** either the repository root, its `src` project folder, or another directory containing `project.godot`.

If using an installed build:

- **Remake checkout or executable:** the installed executable;
- **Godot executable:** not used for that launch.

These paths live in Providence workspace settings on that machine. They do not enter `project.json` or the exported scenario.

### Entry points

The preview panel currently supports:

- **Campaign start**
- **Map location**
- **Action point ID**
- **Battle ID**

Use campaign start to test the real admission and startup path.

Use a map location to get quickly to an exploration state at a chosen land or dungeon coordinate.

Use an AP stable ID to run a specific trigger through the interpreter.

Use a battle ID to validate a battle without walking the whole route.

These shortcuts are for iteration, not substitutes for an end-to-end campaign-start playtest.

### What Apply and Restart does

Providence:

1. stops the previous managed session;
2. exports the project to a fresh temporary v3 package;
3. starts a loopback WebSocket listener with a random nonce;
4. launches Remake with the package, nonce, port, and ephemeral profile path;
5. waits for the authenticated Remake handshake;
6. asks Remake to load the package;
7. asks it to launch the chosen entry point; and
8. displays received runtime events.

Remake:

1. validates the package and its readiness;
2. discovers it through the normal campaign installer;
3. creates the deterministic preview party;
4. enters exploration;
5. runs the requested AP, battle, or teleport through normal runtime services; and
6. reports command starts, command finishes, runtime errors, location, and VM trace.

The preview protocol can also report diagnostics, current location, state summary, and source-linked trace data. The current Providence panel shows the latest raw event rather than a finished graphical debugger.

### Source-linked traces

Safe-script statements receive source-node IDs when Providence parses them. Remake records those IDs in the script trace. For Classic actions, it can resolve a stable trigger ID through `classic/evidence.json`.

This lets a diagnostic connect:

```text
Remake command failure
  -> script ID
  -> safe AST source node
  -> Providence source line
```

The source map is for diagnostics. Runtime gameplay does not load the full Classic evidence sidecar unless trace resolution is requested.

## Exporting and running a package normally

In Providence desktop:

1. Open **Export**.
2. Choose **Realmz Remake Scenario Folder**.
3. Click **Export Remake Scenario Folder**.
4. Select an absent or empty output directory.

Providence writes a self-contained v3 campaign folder containing:

- `campaign.json`;
- Classic runtime documents under `classic/`;
- `classic/evidence.json`;
- `runtime.json`;
- `remake/scripts.json`;
- declared full-tier source under `remake/source/`;
- scenario-owned assets; and
- decoded runtime media.

For a source checkout, install or copy the resulting campaign folder under the Remake project's configured `Campaigns` directory. For an installed build, use that build's campaign installation location.

Remake validates:

- format and document versions;
- every manifest file's size and SHA-256;
- the package hash;
- declared script source paths and hashes;
- the capability-catalog hash;
- required built-in extensions and APIs;
- script tiers and policy;
- trusted approval;
- sandbox availability; and
- general campaign readiness.

Undeclared `.gd` files, `.gdc`, PCKs, native libraries, executables, WebAssembly, and symlinks are invalid package content.

### Native Realmz export

Once you add a script, Providence marks native Realmz export unavailable. That is intentional: native Realmz has no `core.script.call` VM.

The rest of the project remains ordinary canonical Providence data. If you later remove all scripts, attachments, semantic actions, and active Remake-only bindings, native eligibility is recomputed rather than permanently lost.

## Debugging checklist

### The Scripting tool is missing

- Open **Scenario**.
- Set **Scenario format** to **Realmz Remake scenario**.
- Return to the project workbench.
- Confirm **Scripting** appears in the left-side domain rail.

### Apply Script reports a syntax error

Check:

- the script contains exactly one typed function;
- the body is indented;
- parameter names and types match **Typed parameters**;
- the return type matches **Return type**;
- every yielding operation uses `await`;
- non-yielding operations do not use `await`;
- every persistent name was declared under **State & Hooks**;
- arrays are homogeneous and no longer than 256 entries; and
- the source does not use loops, classes, signals, or other unsupported syntax.

Remember that a failed Apply leaves the previous valid AST in place.

### The AP fires, but the script does not

Check:

- the attachment target is **AP / XAP**;
- **Stable record ID** exactly matches the AP ID, including spaces and punctuation;
- the slot is correct and zero-based;
- the AP is active and reachable;
- no later edit deleted the named script;
- the exported `classic/scripts.json` slot contains `core.script.call`; and
- the VM trace contains the script ID.

### The encounter prompt appears, but its script result does not continue

Check:

- the attachment target matches simple versus complex encounter;
- the stable record ID is the encounter's actual ID;
- the result slot is the one reached by the chosen response;
- the script's first yielding command returns through the presentation port; and
- no unrelated player action changes state while the interpreter is pending.

Test every response branch. Encounter result numbering is easier to get wrong than a single AP slot.

### A persistent variable is unknown

- Declare it under **State & Hooks**.
- Match spelling and case exactly.
- Give it a default value matching its type.
- Do not use `void` as a variable type.
- Set an array maximum for array state.

### Remake says the capability catalog hash does not match

Providence and Remake are from incompatible contract revisions.

Regenerate and check Providence's trusted catalogs against the intended Remake checkout:

```powershell
npm run generate:remake-extension-catalog -- --remake-root "C:\path\Realmz-Remake"
npm run check:remake-extension-catalog -- --remake-root "C:\path\Realmz-Remake"
```

Do not edit a generated catalog by hand to silence the mismatch.

### Remake reports `sandbox-unavailable`

- Confirm the game is running on Windows.
- Confirm `scenario-sandbox-host.exe` is installed beside the Remake executable.
- Confirm the sandbox helper belongs to the same build.
- Do not change the script to Trusted merely to bypass the error.

If portability matters, rewrite the behavior as a Safe Script or add the required operation as a reviewed built-in capability.

### Remake reports trusted approval is required

The package contains a Trusted script.

- Confirm that Trusted was intentional.
- Review the exact exported source and requested capabilities.
- Enable Developer Scripting through the supported developer policy path.
- Approve the exact package hash and capability set.

The current feature branch still needs a finished player-facing approval screen. This is not a normal scenario-player workflow yet.

### A save no longer loads after script edits

Scripted saves intentionally pin executable identity.

Look for changes to:

- package hash;
- script content;
- script API version;
- state schema;
- declared variables;
- required provider versions; or
- capability catalog.

During development, begin a fresh preview playthrough after an intentional contract change. For a released campaign, treat script and state-schema compatibility as a versioned migration problem, not something to bypass silently.

### Preview starts at the wrong place

- Confirm the selected entry type.
- For map entry, verify land versus dungeon, map index, X, and Y.
- For AP entry, use the stable trigger ID, not its visible label or array position.
- For battle entry, use the numeric battle record ID.
- Use **Campaign start** when testing the scenario's real start coordinate.

### Preview has no useful diagnostics

The current panel shows the latest raw runtime event. Use the event's:

- `type`;
- `event`;
- `command`;
- `payload`;
- `response`;
- `trace`;
- `scriptId`;
- `sourceNode`; and
- `sourceLocation`

to identify the last completed boundary. If the failure happens before a script starts, inspect campaign readiness and the Classic AP path first.

## Choosing the right authoring mechanism

| Goal | Preferred mechanism |
| --- | --- |
| Show existing text, branch, set a Classic flag, or call an encounter exactly as Realmz did | Classic AP opcode |
| Add a readable quest state machine using supported state, presentation, map, and battle operations | Safe Script |
| Share a small helper across several scripted APs | Named Safe Script plus `script_call` |
| Add a new reusable spell or item behavior for many scenarios | Built-in extension/provider |
| Add a new safe operation such as grant item or change time | Extend the shared capability catalog and owning Remake port |
| Use richer language features without main-process trust | Sandboxed full GDScript |
| Integrate developer-owned code that genuinely needs in-process Godot access | Trusted full GDScript |
| Reproduce an original scenario behavior already represented by Classic CODE/ID | Improve the Classic handler, not a scenario-specific script |

The important architectural line is whether a behavior belongs to one scenario or to the game.

If five scenarios need the same new operation, that is probably a Remake capability or provider. If one quest needs to combine three existing operations with some state, that is a Safe Script.

## Current support versus future surface

The scripting architecture reserves room for:

- map and time operations;
- combat operations;
- inventory operations;
- character operations;
- presentation;
- persistence;
- spell implementations;
- item behaviors;
- encounter resolvers;
- monster AI;
- lifecycle hooks; and
- bounded gameplay-rule modifiers.

The currently registered author-facing capability catalog implements:

- Classic quest flag read/write;
- typed persistent variable read/write;
- text presentation;
- choices;
- teleport;
- battle start; and
- deterministic RNG.

It does not yet provide a general author-facing API for:

- granting or removing items;
- changing money;
- directly damaging or healing characters;
- casting arbitrary spells;
- creating monsters;
- altering the world clock;
- changing gameplay-rule providers;
- custom monster AI;
- arbitrary lifecycle-script attachments; or
- direct UI and scene manipulation.

Those are expansion points, not working functions authors should guess into source. Unknown capability IDs fail validation or readiness.

## For contributors: adding a new Safe capability

Suppose authors need:

```gdscript
grant_item(901, 1)
```

Do not implement it only in the Providence parser.

A complete addition crosses both repositories:

1. Add a stable capability such as `core.inventory.grant-item` to the shared catalog.
2. Define typed parameters, result type, yield behavior, minimum tier, and owning port.
3. Regenerate the Providence catalog copy.
4. Add the friendly Safe-language function and type checks.
5. Compile it into a canonical operation node.
6. Register or extend the Remake handler/runtime mapping.
7. Route the yielded command through `ScenarioCommandRouter`.
8. Implement it in `InventoryPort`, where actual inventory ownership belongs.
9. Define save/restore behavior if it can be pending.
10. Add Providence parser/export tests.
11. Add Remake runtime/resume/port tests.
12. Add a cross-repository fixture proving identical capability and package hashes.
13. Add an end-to-end preview route.

Do not let the script reach `GameGlobal` or the inventory UI directly. The port boundary is what keeps Safe, sandboxed, trusted, Classic, preview, and saved execution consistent.

## File map for maintainers

In Providence:

- `src/editor/panels/ScriptingPanel.tsx` owns the Scripting workspace shell.
- `src/editor/panels/rules/RemakeRuntimeEditor.tsx` owns the current script, state, extension, and binding forms.
- `src/editor/safeScriptLanguage.ts` parses, type-checks, prints, and source-maps Safe scripts.
- `src/editor/remakeRuntimeCatalog.ts` validates built-in extension use and computes Remake-only support.
- `schemas/remake-scenario-capabilities.v1.json` is Providence's generated capability contract.
- `schemas/remake-extension-catalog.json` is Providence's generated built-in extension catalog.
- `src-tauri/src/remake_exporter/scripting.rs` builds and validates `remake/scripts.json`.
- `src-tauri/src/remake_exporter/documents.rs` materializes script attachments as `core.script.call`.
- `src-tauri/src/preview.rs` manages temporary export and the external Remake process.
- `docs/remake-classic-export.md` documents the full v3 exporter and package contract.

In Remake:

- `src/scripts/scenario_runtime/scenario_interpreter.gd` is the central AP/XAP VM.
- `src/scripts/scenario_runtime/scenario_script_runtime.gd` owns Safe frames, full-tier reducer state, pending operations, RNG, snapshot, and restore.
- `src/scripts/scenario_runtime/handlers/scenario_script_handler.gd` handles `core.script.call`.
- `src/scripts/scenario_runtime/scenario_capability_catalog.gd` loads the built-in capability contract.
- `src/scripts/scenario_runtime/scenario_sandbox_client.gd` connects to the Windows sandbox helper.
- `src/scripts/scenario_runtime/sandbox/scenario_sandbox_runner.gd` runs the isolated reducer protocol.
- `tools/scenario-sandbox-host/` implements the Windows AppContainer and Job Object host.
- `src/scripts/scenario_runtime/scenario_trusted_executor.gd` runs approved in-process reducers.
- `src/scripts/scenario_runtime/scenario_script_policy.gd` stores Developer Scripting and trusted-package approvals.
- `src/scripts/scenario_runtime/preview/scenario_preview_host.gd` implements the Remake side of managed preview.
- `src/scripts/classic_runtime/BUNDLE_CONTRACT.md` is the authoritative bundle v3 consumer contract.

## Coordinated verification

After changing the shared scripting or bundle contract, run Providence's normal focused checks and the cross-repository consumer gate.

Providence:

```powershell
npm run typecheck
npm run lint
npm run test:unit
npm run build
npm run check:remake-extension-catalog -- --remake-root "C:\path\Realmz-Remake"
```

Cross-repository export and consumer verification:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify_remake_classic_export.ps1 `
  -ProvidenceRoot "C:\path\Realmz-Providence" `
  -RemakeRoot "C:\path\Realmz-Remake" `
  -Godot "C:\path\Godot.exe"
```

Then run the representative gameplay routes affected by the change. At minimum, a scripting capability should have:

- parser/type-check proof;
- deterministic export proof;
- Remake document validation;
- execute and resume proof;
- save/restore proof at a yield boundary;
- managed preview proof; and
- one real scenario route that uses the owning port.

## Final author checklist

Before sharing a scripted scenario:

- [ ] The project is intentionally set to **Realmz Remake scenario**.
- [ ] Every script has a stable ID, useful name, and durable Documentation text.
- [ ] Every Safe Script applies with no diagnostics.
- [ ] Every persistent variable has the right type and default.
- [ ] Every attachment points to the correct stable record and zero-based slot.
- [ ] Replaced Classic actions were replaced deliberately.
- [ ] Requested full-tier capabilities are minimal and accurate.
- [ ] No lifecycle attachment is being mistaken for a currently wired script call.
- [ ] Sandboxed campaigns were tested with the packaged Windows helper.
- [ ] Trusted code is clearly disclosed as executable and was not used for convenience.
- [ ] Campaign start, AP shortcut, and affected encounter/battle routes were tested.
- [ ] Save/restore was tested while a dialogue or battle command was pending.
- [ ] A clean v3 export passes Remake readiness.
- [ ] Native Realmz incompatibility is understood and documented.
- [ ] Release notes identify any required Remake build, catalog version, sandbox support, or trust policy.

The safest and most maintainable result is usually a mostly Classic scenario with a few small Safe Scripts at well-chosen seams. That keeps original Realmz fidelity where the format already works, while giving new scenarios readable stateful logic without turning every AP into hand-written engine code.
