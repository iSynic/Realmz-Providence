# Example: a crossroads and two ways into a keep

This is an authoring example, not a certified playable campaign. Build and
verify the executable details with the current native forms. The conversation
may call a milestone “required”; Providence stores native records and labels,
not that narrative assertion.

The premise is a closed keep. The player can earn the gatekeeper's trust by
returning a signet, or pay an entry fee. Both solutions open the same gate. An
optional well gives a useful reward; it must not silently become a prerequisite.
Leaving the keep after the ending remains a separate outcome from completing it.

## Allocate the opening together

Create/open a project, read `providence_session_describe`, and use its exact
`projectId`, `sessionGeneration` and `revision` as metadata. A new project needs
configured application rules and artwork before a meaningful export.

Pass the following `steps` to `providence_changes_prepare`, together with that
metadata. The references use earlier step results, so no native map/AP identity
is guessed:

```json
[
  {
    "name": "crossroads",
    "tool": "providence_map_create",
    "arguments": {"levelType": "land"}
  },
  {
    "name": "gatekeeper",
    "tool": "providence_action_point_create",
    "arguments": {
      "mapIdentity": {"$result": "crossroads", "pointer": "/changedEntities/0"},
      "x": 10,
      "y": 11
    }
  },
  {
    "name": "arrival",
    "tool": "providence_start_location_set",
    "arguments": {
      "location": {
        "map": {"$result": "crossroads", "pointer": "/changedEntities/0"},
        "coordinate": {"x": 10, "y": 10}
      }
    }
  }
]
```

Inspect the allocations, changed identities and diagnostics before committing
the returned preview token with `providence_changes_commit`. Reuse the metadata
for the prepared revision and provide a unique operation ID. A stale preview
requires a new inspection and preparation; do not silently retry the old edit.
The commit is one shared Undo entry. Undo from either client reverses that
entire entry, including startup.

## Author each solution as a small milestone

Read the AP document and inspect `providence_action_definition_list` before
choosing instructions. Use the available target/form tools for operand meanings
and caller-specific Extra Code. Allocate Messages, encounters, XAPs and items
through their native allocators/reviews. Keep the returned stable identities and
native numbers together. A copied instruction's shared settings require the
native ownership guard; changing one caller must not silently rewrite another.

For the signet route, define acquisition, possession checking, any consumption,
the trust-state change and the gate-opening effect explicitly. Record whether
the signet can be recovered and whether returning after payment offers another
reward. A quest label alone supplies none of these effects.

For payment, inspect failure and success branches separately. Preserve the
failure destination, verify the amount and deduction, and avoid placing the
gate-opening effect before a successful result. An assumed winnable battle
does not supply entry money or the signet. If victory awards either, author that
reward and verify the aftermath separately.

Decide what happens on re-entry after either solution. Avoid charging twice or
re-awarding the signet reward unless intended. Keep the optional well outside
the opening condition. A timed event needs explicit scheduling and eligibility;
put its deadline and consequences in the design conversation and verify them
through the paired runtime rather than inferring them from Flow.

## Review code and geography separately

Query `providence_discovery_flow` backward from the ending and forward from the
gatekeeper AP. Inspect ordered branches, callers, cycles and truncation. Query
quest checks/changes as state relationships. Sharing a quest number is not proof
that acquisition runs before the gatekeeper.

Read bounded map regions and rendered previews around startup, the signet,
gate and optional well. Review paint previews before applying terrain, roads,
walls or dungeon features. Check protected AP/secret cells and neighbor changes.
Initial AP activation is authored state; neither its overlay nor Flow proves
that a party can walk there. Check transitions, secrets, directional entry and
return access separately.

Validate, save/reopen, then export Classic and v6 using explicit support and
output roots. Record the captured revision, hashes and warnings. Independently
traverse both solutions in the pinned runtime, including insufficient funds and
return visits. Prepared states, source reasoning, calculated routes and ordinary
traversal remain distinct evidence. An export or a diagram is not gameplay proof.
