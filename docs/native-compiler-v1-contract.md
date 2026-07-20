# Providence Native Compiler v1 Contract

## Decision

Providence v1 supports two native Realmz compiler implementations: the Rust desktop compiler and
the TypeScript browser compiler. They are projections of the same canonical schema-v5 project,
not conversions of each other's output.

This is an accepted production boundary, not a temporary proof shortcut. A Rust/Wasm browser
surface may replace the TypeScript implementation later, but it is not required for authoritative
scenario ownership or the v1 compiler closeout.

## Shared authority

| Concern | Authoritative source |
| --- | --- |
| Persisted scenario semantics and origin | `schemas/providence-project.schema.json` |
| Native filenames, roles, presence rules, capacities, and record geometry | `schemas/realmz-native-manifest-policy.json` |
| Fresh race/caste compiler defaults | `src/shared/rulesCompilerBaseline.json` |
| Imported compatibility bytes | Project compatibility annex, never the canonical project model |
| Generated runtime caches | Realmz runtime, intentionally omitted from compiler output |

Both implementations must consume generated projections of the shared contracts. Native layout or
presence policy must not be introduced as an untracked browser- or desktop-only constant.

## Intentionally independent implementation

The following mechanics remain independently implemented in Rust and TypeScript:

- semantic field encoding into native records;
- resource-fork construction and managed-resource updates;
- imported compatibility-annex overlay execution;
- target-specific folder or ZIP materialization.

Independence here provides a useful cross-check only while exact output parity remains mandatory.
It does not permit the two compilers to assign different meanings to canonical fields or native
bytes.

## Required gates

The v1 boundary is enforced by these repository checks:

1. `check:providence-project-contract` rejects persisted TypeScript/Rust schema drift.
2. `check:realmz-native-manifest-policy` rejects native-policy and consumer drift.
3. `check:browser-desktop-scenario-parity` compares both native targets for imported, edited, and
   representative resource-bearing scenarios.
4. `check:authoritative-scenario-proof` compiles the annex-free canonical ownership fixture twice,
   compares browser and desktop bytes for both targets, and reimports the result.

`check:native-compiler-convergence` runs the policy and browser/desktop parity gates, and the
aggregate `npm run check` includes it. The authoritative proof remains part of the Scenario JSON
gate so an authored fixture cannot silently fall out of coverage.

## Change policy

- A new persisted semantic field starts in the canonical schema and must have matching generated
  TypeScript and Rust projections.
- A filename, role, presence rule, capacity, record width, or compatibility range starts in the
  native-manifest policy.
- A field-layout change must update both codecs and fixed-format tests, then pass exact byte parity.
- A compatibility-overlay change must pass imported no-edit and edited corpus parity without
  introducing annex reads into authored compilation.
- A resource change must pass parsed-resource and serialized-byte parity for both target packages.

If these gates become insufficient for a new feature, strengthen the shared specification or parity
fixture first. Extract a single Rust/Wasm compiler only when it removes demonstrated maintenance or
correctness cost; do not make that extraction a prerequisite for unrelated authoring work.
