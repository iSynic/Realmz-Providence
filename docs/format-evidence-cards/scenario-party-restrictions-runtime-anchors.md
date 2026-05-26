# Runtime Note: Scenario Party Restrictions

## User-Facing Unlock

This note makes the Scenario tool more than a read-only shell. Providence can show the real party admission rules Realmz applies before a new game starts: scenario description, maximum party size, maximum total party level, banned races, and banned castes.

The implementation should treat these as scenario-authored restrictions from `Data RI`, separate from the marker/main scenario file fields `reclevel` and `maxlevel`.

## Runtime Model

Realmz reads two restriction sources during party selection:

- the marker/main scenario file supplies `reclevel` and `maxlevel` for recommended/maximum total party level display and checks;
- optional `Data RI` supplies a user-facing restriction description, maximum party character count, maximum party level, banned race flags, and banned caste flags.

If `Data RI` is absent, the scenario has no extra race/caste/party-count restriction dialog evidence.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\structs.h:29` | Defines `struct restrictinfo`: `description`, `maxpc`, `maxlevel`, `canrace[30]`, `cancaste[30]`. |
| `F:\Realmz\src\realmz_orig\convert.c:287` | `CvtRestrictionInfoToPc` converts the two short fields; flag arrays are bytes. |
| `F:\Realmz\src\realmz_orig\partyselect.c:48` | Party selection opens the marker/main scenario file by current scenario name. |
| `F:\Realmz\src\realmz_orig\partyselect.c:55` | Party selection reads marker/main `reclevel`. |
| `F:\Realmz\src\realmz_orig\partyselect.c:57` | Party selection reads marker/main `maxlevel`. |
| `F:\Realmz\src\realmz_orig\partyselect.c:207` | Party selection opens optional scenario `Data RI`. |
| `F:\Realmz\src\realmz_orig\partyselect.c:209` | Party selection reads one `restrictinfo` record. |
| `F:\Realmz\src\realmz_orig\partyselect.c:461` | Candidate character level is rejected when over `restrictinfo.maxlevel`. |
| `F:\Realmz\src\realmz_orig\partyselect.c:466` | Candidate addition is rejected when party size reaches `restrictinfo.maxpc`. |
| `F:\Realmz\src\realmz_orig\partyselect.c:471` | Candidate race is rejected when `canrace[race - 1]` is nonzero. |
| `F:\Realmz\src\realmz_orig\partyselect.c:476` | Candidate caste is rejected when `cancaste[caste - 1]` is nonzero. |
| `F:\Realmz\src\realmz_orig\partyselect.c:731` | Restriction dialog displays the `description` string. |
| `F:\Realmz\src\realmz_orig\partyselect.c:732` | Restriction dialog displays `maxpc`. |
| `F:\Realmz\src\realmz_orig\partyselect.c:733` | Restriction dialog displays `maxlevel`. |
| `F:\Realmz\src\realmz_orig\partyselect.c:742` | Restriction dialog labels race flags from `STR# 129`. |
| `F:\Realmz\src\realmz_orig\partyselect.c:745` | Restriction dialog labels caste flags from `STR# 131`. |

## Data RI Layout

`Data RI` is one fixed 320-byte record when present.

| Offset | Size | Field | Notes |
| ---: | ---: | --- | --- |
| 0 | 256 | `description` | `Str255` text shown in the restriction dialog. |
| 256 | 2 | `maxpc` | Maximum party character count. Zero means no extra limit. |
| 258 | 2 | `maxlevel` | Maximum character/party level gate in party selection. Zero means no extra limit. |
| 260 | 30 | `canrace[30]` | Nonzero means the race is banned, despite the field name reading like "can race." |
| 290 | 30 | `cancaste[30]` | Nonzero means the caste is banned. |

The banned-race and banned-caste arrays are byte flags. User-facing UI should label them as "Banned races" and "Banned castes" to match runtime behavior rather than raw field names.

## Corpus Evidence

Local output corpus under `F:\Realmz\out_win_clang\Scenarios`:

- `Data RI` appears in 24 of 28 scenarios.
- Every observed file is exactly 320 bytes.

Base corpus under `F:\Realmz\base\Realmz\Scenarios`:

- `Data RI` appears in 13 scenarios.
- Every observed file is exactly 320 bytes.

The broader 44-scenario format inventory should add `Data RI` to the next regenerated corpus summary.

## Providence Implications

- `Data RI` should be a tracked scenario file.
- Scenario tool should show a real restriction section when `Data RI` is present.
- Race/caste flag labels should resolve through bundled/shared `STR# 129` and `STR# 131` evidence when available.
- Race/caste pickers from the Rules evidence pass should power the restriction editor.
- `Data RI` can be parsed now and written later once Scenario editor command/write fixtures are added.

## Validation Candidates

- `Data RI` length should be exactly 320 bytes when present.
- `description` must fit one `Str255`.
- `maxpc` and `maxlevel` should be non-negative.
- Race/caste flag arrays should be 30 bytes each.
- Restrictions should warn when they ban every race or every caste.
- Restrictions should warn when `maxpc` is impossible for Realmz party setup.

## Divinity Evidence Still Needed

- Divinity Scenario Restrictions dialog labels/defaults.
- Whether `Data RI` is omitted for no restrictions or written as an all-zero/default record.
- Exact authoring semantics for `maxlevel`: the runtime compares candidate character level in some paths, while marker/main `maxlevel` is also used as total-party-level metadata.
- Whether Divinity calls the race/caste flags "not allowed," "excluded," or another user-facing term.

## Providence Follow-Up Slice

1. Add a Scenario Restrictions panel backed by parsed `Data RI`.
2. Add typed commands for `updateScenarioRestrictions` after writer fixtures exist.
3. Add race/caste label pickers with shared-vs-override Rules badges.
4. Add validation warnings beside the restriction controls and in the global linter.
