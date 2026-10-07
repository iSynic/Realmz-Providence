# Architecture and maintenance

The Rust core owns canonical authored state, typed commands, references,
diagnostic meaning and compilation. It has no dependency on Godot, operating
system dialogs or filesystem paths. Godot presents bounded projections and
keeps local interaction state, including uncommitted drafts.

`providence-storage` stores deterministic portable snapshots and
content-addressed blobs. SQLite indexes and journal infrastructure can be
rebuilt; they are not an alternate source of authored truth.

`providence-native-adapter` owns filesystem materialization, native process
transport, asynchronous jobs and application-library resolution. Routine
commands carry an expected revision and return bounded changes. A stale or
uncertain response must not silently overwrite a draft or retry an authoring
operation.

`providence-rebuilt-package` validates and materializes the versioned package
contract. `providence-application-library` builds and normalizes stock support.
`providence-cli` exposes the headless toolkit. `providence-rebuilt-preview`
keeps preview/playtest in a separate process so runtime failure cannot corrupt
an editor session.

Imported projects retain original source bytes. Export writes only fields owned
by authored semantic changes and preserves unrelated compatibility residue.
Stock resources remain in a separate reference library; exact scenario-owned
resource keys shadow them. Diagnostic relevance and reachability are derived
views and cannot authorize deleting source-owned catalogs or artwork.

Godot workbenches own their presentation and local interactions. Named scenes
own fixed layouts. Shared helpers must expose explicit interfaces rather than
reaching into another workbench's private state. Tests and capture harnesses
may inspect internals to verify production behavior without becoming runtime
authoring authority.

Prefer cohesive modules, direct control flow and comments explaining ownership
or failure boundaries. UI/orchestration modules target 600 substantive lines
and functions 60 lines; narrowly documented codec tables can reach 900. Existing
exceptions are debt, not permission to grow. Add behavior tests at the smallest
responsible boundary and batch relevant checks; corpus archaeology is a
separate bounded job.
