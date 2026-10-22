# Local MCP authoring

The current candidate shares native commands and project history with a local
stdio MCP client. The complete authoring plan is still in progress. Full native
task coverage, nested input schemas, the authored scenario/runtime journey,
and three-platform distribution are separate gates. The owner accepted the
scoped native MCP controls after both critics passed Native R5.

Build `providence-mcp` and `providence-native-adapter` together. They require the
same embedded source, schema, dependency lock, target and profile identities.
The [generated tool reference](capabilities.md) accounts for exposed native routes;
it does not certify missing author tasks. Rebuild MCP, then run
`python tools/generate-mcp-reference.py --mcp <executable> --write` after changing
the registry. MCP verification checks that the reference still matches.
The server checks the adapter before creating project files. The official Rust
SDK is pinned to `rmcp = 3.5.1` in Cargo.lock. Process tests exercise current
2026-07-28 discovery and the 2025-11-25 initialization path.

[Typed instruction queries](action-queries.md) expose the core's signed-reference
behavior and target selection, including caller context and shared-use limits.
They retain the session guards and existing exact signed-word mutation contract.

```json
{
  "mcpServers": {
    "providence": {
      "command": "C:\\Providence\\providence-mcp.exe",
      "args": [
        "--project-root", "C:\\ProvidenceProjects",
        "--output-root", "C:\\ProvidenceExports"
      ]
    }
  }
}
```

Both roots must exist. An existing project may be the project root itself or a
descendant; new projects and export destinations must be descendants of their
configured canonical roots. The server never installs client configuration. Native
**Tools → MCP Connections → Client Setup** copies an explicit configuration,
including the active support options. Portable projects use shared sessions.
Paste that configuration into the MCP client's settings and reconnect its server;
saving the Providence setup fields alone does not update the client. Codex uses
the `[mcp_servers.providence]` table in its `config.toml` rather than the JSON wrapper.
`PROVIDENCE_SHARED_SESSION=0` retains the exclusive legacy adapter for bounded
comparison checks; it cannot collaborate with an MCP host.

The private host also enforces each MCP client's output grant. Optional repeated
`--input-root` arguments grant at most eight existing input directories; file
inputs must use absolute paths. Grants stay with the connection, outside portable
truth and application-support pairing. After resolving change-set references the
host checks file-reading arguments against those grants. Configuring a grant does
not expose an unsupported import tool: Classic folders and supported scenario
media use their named tools; archive import and other missing families remain
separate work.
The private host contract is version 3; it is independent of the adapter and MCP
protocol versions and package schema v6.

The server accepts explicit application-library, reference-catalog, Classic
application-rules, Monster Library, personal-library and Scrapbook options.
These are the same support inputs used by the native adapter. Immutable support
bytes are fingerprinted; replacing a file at its configured path invalidates
prepared changes. Configuration discovery, tokens and disconnected editing
holds stay in local user settings. They are not scenario annotations.

For headless New Project, configure `--application-rules-root` to the packaged
`Realmz Data` folder, alongside the exact application library. This uses the
same stock initializer as native New Project: 30 races, 30 castes, 420 standard
spells, item definitions and terrain catalogs. With no rules root configured,
creation explicitly reports `stockInitialized: false` and leaves those catalogs
empty. `authoring-stock-r1/receipt.json` exercises the initialized path through
MCP, including race/caste catalog reads and the contract journey. Storage's
`authored_project` fixtures separately verify the complete initialized records,
blobs, reopen and media ownership. This is not runtime traversal evidence.

To import Classic content, create a new unedited project, then use
`providence_project_inspect_classic_scenario_import` with explicit scenario and
application-data directories. Both directories need input grants. Begin the
native import job, poll its progress and commit the ready result at its exact
revision. The importer establishes the initial baseline without an Undo entry;
subsequent authoring uses shared history. MCP cannot use it to replace an
existing authored scenario. A native draft blocks submission/commit, and edits
during preparation make the result stale. Cancelled jobs report `settled` when
their owned staging is gone. A late cancellation reports a committed import
accurately. Prepared import jobs belong to that connection and are not resumed
after disconnect; retained operation receipts never authorize blind replay.

An imported Classic rule choice is a separate guarded edit. Read
`providence_classic_rule_selection_open`, retain the source-set hash and previous
context identity, and supply an explicit intended menu selection through the
set tool. Clearing that choice uses the same guards and shared Undo. An
author-configured selection is not a captured Classic runtime witness; do not
assume selection 19 for every scenario. Unresolved selection remains explicit.

## Build connected milestones

Plan the premise, ending conditions, alternatives and costs in conversation.
Inspect the native catalogs, definitions and valid targets before allocating
records. Create maps/startup, then prepare small connected milestones. Existing
labels describe records; they do not establish an authored quest name or a
runtime requirement.

1. Use `providence_project_create` or `providence_project_open` and describe the
   session. Retain its project ID, session generation and revision.
2. Inspect named tool definitions and `providence://authoring/capabilities`.
   Native forms and target queries supply opcode/operand context.
3. Prepare named steps with `providence_changes_prepare`. Allocate producers
   first, then refer to earlier results using
   `{"$result":"step-name","pointer":"/native-result-field"}`. The native
   allocator supplies identities. Step results use private staged revisions;
   the live commit always uses the preview's `baseRevision`.
4. Review allocations, references, diagnostics and paint previews. Paint plans
   include changed, unchanged/protected and neighbor cells through the existing
   semantic planners. A structural failure discards the entire private stage.
5. Commit the exact preview token and revision with a unique operation ID. A
   successful group creates one live revision and one shared Undo entry.
6. Query Flow backward from endings and forward from startup. Inspect physical
   map connections separately. Shared quest values are state relationships;
   Flow does not prove a party can reach or execute an encounter.
7. Validate, revise, checkpoint and export. Current package exports use schema
   v6; portable snapshot and adapter/MCP versions remain independent.

Preparation does not write applied project truth. The cache retains at most
eight private previews; change sets allow at most 64 steps and 2 MiB of input.
Oversized previews are rejected rather than silently reducing an edit. Bounded
diagnostic summaries include their totals/truncation. Ordinary record edits
also prepare a change; commit is explicit.

Use the named Level Settings form for level names, darkness, line of sight and
renderer choices. A prepared change includes `changePreviews`, including shared
Custom Landlook impact. Source descriptors and random regions remain under their
own native ownership. Startup, Contact and Restrictions use separate complete
forms and native validation; read current contact values before changing one
field. Global hooks use the dedicated hook commands. MCP does not expose the
adapter's whole-map metadata or whole-campaign setters.

Race/Caste authoring uses `rule.catalog`, `rule.open-authoring` and the native
allocation/copy/reset reviews before `rule.draft.apply`. Keep the returned family
and copy guards. Custom author numbers are distinct from canonical IDs: the
editor displays 0–29 while `classicId` remains 1–30. Names and notes are project
labels; native document flags identify runtime limitations, including maximum
spells per round. Reset retains a native record and is not deletion or a promise
that its slot becomes vacant. Eligibility changes use the native reciprocal
planner rather than editing a raw Race/Caste source row.

## Collaborate without losing drafts

Both clients attach to one host. A storage writer lock prevents independent
writable sessions. The host serializes commands and never refreshes a stale
expected revision and retries an edit. Shared Undo/Redo targets the current
history head, including the other client's change.
Pairing checks include a compiled authoring-source fingerprint, so a matching
commit and dirty flag cannot disguise different development builds. A mismatch
requires rebuilding the MCP server and adapter together.

Native attachment pauses MCP writes initially. Unapplied or disconnected
native drafts block MCP project changes and history. Before an external write,
each connected native client freezes input, settles pending controls, checks all
drafts and grants a permit for that exact request/revision. Merely polling a
clean draft flag would leave a late-typing race. Reads remain available.

Apply/discard remains the author's decision. Releasing a disconnected editing
hold requires explicit native confirmation and never recovers or discards text.
If the editor reconnects with a draft after the project changed, retain the
draft and its pending invalidation until reconciliation.

Operation receipts distinguish committed, rejected, pending and uncertain
outcomes. Repeating an acknowledged operation ID with identical arguments
returns its receipt; changing its arguments fails. After uncertainty, reopen,
inspect the receipt/current records and use `providence_operation_reconcile`.
Recovery reports when the original result is unavailable. It never replays the
write. An unexplained outcome blocks further writes. Project revision alone
cannot establish an external publication's outcome.

A change set's envelope owns its project, session and base revision. Individual
step metadata may be omitted or match that exact envelope; contradictions are
rejected before preparation. Step arguments cannot carry an `operationId`:
commit owns the durable operation identity. Private step revisions are internal
sequencing, never permission to replace a stale caller context.

Exports, runtime launches and personal-library changes have their own history
scope. Published files are outside project Undo. Output is no-clobber by default;
explicit replacement requires its prior artifact hash. Broader crash/cancellation
interleavings remain open work.

Use `providence_export_begin` for a captured Classic or v6 compiler job, then
`providence_export_poll` with its native `jobId`. At most two jobs compile at
once. Later edits do not change captured content, revision or support identities.
Classic output must retain the scenario startup filename as its directory name.
Submission acknowledges the job; its operation receipt also records the job ID.
Inspect the terminal job's `committed` value and artifact hash for publication.
Poll file/warning pages explicitly; neither page truncation nor cancellation
changes the compiled content.

`providence_export_cancel` remains available during native drafts. It stops
publication at a phase boundary; a compiler already running may finish its phase.
A completed publication remains committed even if cancellation arrives later.
Only the job's staging directory is removed. Reopening preserves terminal jobs;
an interrupted compiler is not restarted. A lost publication acknowledgement
reports `uncertain` with `committed: null`, even when the destination matches the
prepared hash. Inspect the receipt and artifact before making another request.
Rebuilt jobs, synchronous publication and package inspection accept an explicit
`packageFinalization` object: `applicationPackage`, `applicationCampaignId`,
`applicationPackageHash`, optional `applicationMediaCatalogPath`, and
`classicApplicationDataDirectory`. Every consumed file needs an input-root grant;
no installed location is guessed. Jobs capture bounded archive, catalog and
Data Caste bytes (128 MiB archive, 16 MiB catalog, 1 MiB Data Caste), report
their hashes, compile from owned copies, and reject
changed original inputs before publication. The native finalizer checks the
asserted package identity and media pairing. Classic exports reject this option.
For explicit replacement, call `providence_export_inspect_artifact` with the
format and output path, then pass `replacement: {expectedSha256: ...}` to the
job. A changed artifact rejects the request. The publisher moves the complete
old artifact to a unique sibling backup without clobbering anything, verifies
its hash again, and retains that backup after success. Jobs report the backup
path and `planned`, `retained`, `restored` or `restore-blocked` state. `planned`
does not establish that a backup exists. Cancellation or publication failure
restores the original only if the destination remains vacant. If another output
appears there, both it and the backup survive and the job reports the blocked
restoration. Inspection is bounded hashing, not package or gameplay validation. Its revision
annotation describes the project context at inspection. Export-job receipts
carry the artifact producer revision.
A recovered `uncertain` job never restores or publishes automatically; inspect
both reported paths before deciding on a new request. Synchronous exports keep
their no-clobber behavior.

Terrain mapping uses `providence_terrain_mapping_open`, `_review` and `_accept`.
Read the resolved atlas and available layout revision before preparing an edit.
The native feature owns the 200 accepted tile fingerprints; callers supply the
exact `atlasBlob`, `expectedMappingRevision`, chosen layout, explicitly reviewed
families, excluded tile numbers (1–200) and bounded labels. Inspect actual
custom artwork before qualifying its geometry. Labels do not alter native tile
words; exclusions keep affected joins unavailable. Acceptance previews and
commits through the same grouped history as other project edits.

## Coverage and verification

Success output schemas are being added to the checked registry and published in
MCP tool definitions and the capability resource. Artifact inspection currently
has a closed contract for artifact identity, hash algorithm and shared-host
revision/support metadata, verified with the official client in both protocol
eras. Other success contracts, including lifecycle/grouped results, remain open.
This schema work does not change native project validation or package versions.

The [worked crossroads milestone](worked-milestone.md) shows linked native
allocation, alternative solutions, costs and re-entry checks. It is also an
offline MCP resource, `providence://authoring/worked-milestone`; it is guidance,
not a certified campaign.

The [generated tool reference](capabilities.md) lists currently exposed native
routes, ownership, prerequisites, history scope and defined checks. Named tools
and the schema resource share one compiled registry. This is not yet a complete
inventory of every native author task or a complete typed output contract.

Current bounded journeys cover native string, item and Custom spell allocation,
copy/reset, Monster allocation and field edits, battles, rewards, shops, Player
Map record/name edits, linked map/AP/start creation, named level and scenario
settings, dormant AP filters, Flow, Rogue/Timed drafts, configured Race/Caste
allocation/copy/reset and shared history after Save/reopen. The collaboration
journey alternates actual native Messages edits with
MCP edits. These are authoring checks, not a connected playable scenario or
complete preservation/export certification.

Land cell tools expose the existing secret and special-art passability editor;
changing a shared resource's solidity can affect several maps. Smart Terrain,
random-region and catalog stamp tools use their native planners and reference
checks. A prepared stamp also pins the local collection revision: changing that
collection rejects the whole pending project change. Catalog reads and mask
reshaping do not add history. Local paint tools allocate a template, capture map
cells with managed markers stripped, review geometry/features, and create,
replace, delete or remember stamps and palettes. Use the returned local
`resourceRevision` and a native 64-digit hexadecimal operation ID. These saves
have durable receipts and change local editor settings, outside project Undo.
Applying a stamp changes the project through shared Undo.

Collection changes have a separate refresh cursor because they do not advance
project revision. The open native collection keeps its query and clean selected
resource while refreshing after another client changes it. Unapplied native
collection drafts block MCP writes. Dirty or disconnected drafts are never
replaced by a collection refresh.

Scenario media tools allocate available exact native keys, review supported PNG,
UTF-8 text, WAV and standard MOD inputs, import or replace media, change labels,
and review removal. Inputs require configured per-client input roots. Combat
icons require both artwork files; allocation checks both resource keys and
retained/quarantined originals. Allocation does not reserve a slot. Inspect the
native conversion preview before committing; changing bytes, conversion settings,
ownership or revision requires another review.

Stock-media tools page exact descriptors and bounded previews from configured
support. Player Map queries retain resolved resource identities, including portrait
and special-land markers. Item artwork tools prepare stock or existing scenario
CICN assignments through shared history. Stock assignment copies no library payload
into the project; native ownership, shadow and ambiguity checks remain authoritative.
Missing support is explicit, never silently imported.

For linked imports, put `media.import.prepare` and `media.import.commit` steps
in one change set. The commit step can use the earlier review's `/reviewHash`
through a temporary result reference. All successful imports then share one
revision and Undo entry; a failed later step commits none. Removal supports the
same prepare/commit pattern and preserves native reference checks. Personal
library transfers, arbitrary resource editing and unsupported codecs are not
exposed by these tools.

Guided Action Settings tools expose the existing Random Message and Random Area
repair drafts. Prepare the exact caller/slot, inspect choices/uses, change or
choose values, then preview and stage the repair. The default creates independent
settings for that action. Random Message can update compatible shared callers
only after `scope=confirmed-actions` returns their exact confirmation list;
changing another field clears that confirmation. Random Area retains the native
restriction on shared two-row updates. A stale draft must be compared and
explicitly rebased, then reviewed again; it is never refreshed automatically.
Native context fingerprints and preserved spare words remain guarded at commit.

Full task/schema coverage, scenario-package import, complete painting
and other repair coverage, and the connected scenario remain open. Legacy
synchronous operations still share one MCP request lane; captured export jobs
do their compiler work outside that lane. Explicit replacement and finalization use captured export jobs; remaining
crash/platform interleavings retain their separate certification gates. The full UI,
paired runtime and packaged three-platform gates remain separate.
Linux WSL checks cover the headless process boundary, protocols, host restart
and the authoring journey; they are not packaged Linux desktop certification.

The native Connections, Setup, draft and hold controls are owner-accepted at
Native R5. That scoped presentation acceptance does not certify every authoring
task. [Verification evidence](verification.md) identifies the receipts, diagnosed
failures and exact limits. The [completion register](../certification/completeness-status.md)
keeps the broader closeout and MCP program open.

## Terrain generation

`providence_terrain_generation_open` exposes reviewed Land profiles and exact
artwork/mapping context. Preview takes one family, density preference, seed,
bounded mask, locks and required endpoint pairs. `begin`, `poll` and `cancel`
offer the same preview through a connection-owned worker. All preview paths are
read-only. `providence_map_connectivity_preview` checks current ordinary walking
without invoking generation; connected, blocked and unknown remain distinct.

Apply the exact `reviewHash` through the ordinary staged change transaction with
the captured revision. A different revision, map, artwork or mapping requires a
new preview. Results become ordinary editable words in one Undo entry. Uncertain
commit replies use the original operation receipt; never replay an Apply to find
out whether it succeeded. Settings remain local drafts. The real process fixture
is `tools/verify-terrain-generation.py`; the UI lane also exercises the native task.
