# Authoritative Compiler Merge Readiness

Audit date: 2026-07-20

## Verdict

The authoritative Realmz compiler work is ready for maintainer review and integration for current
Realmz from the compiler, canonical-project, native-package, and imported-compatibility
perspectives.

Repository-wide `npm run check` is not yet green because the separately tracked ISY-319/320/321
module-size milestone remains unresolved. A stock Realmz 7.1.2 test also identified a deferred
Classic-Mac HFS resource-fork packaging gap. Neither condition is evidence of a remaining
authoritative compiler architecture, canonical-model, or native-writer blocker for current Realmz.

## Mainline relationship

The audit fetched `origin/main` and verified:

- `origin/main` is `0837de8dc2fee322eb31863f73ffbe1879e6a67b` (`Update asset smoke for Realmz Gallery`);
- that commit is the merge base and an exact ancestor of the authoritative compiler branch;
- there are no commits unique to `origin/main` and therefore no current rebase or conflict work;
- `git diff --check origin/main...HEAD` and `git fsck --no-dangling` pass.

The branch can enter review directly. If `origin/main` advances before integration, repeat the
ancestor check and the closeout gate against the new merge base rather than assuming this result
still holds.

## Reproducible closeout gate

Run:

```powershell
npm run check:authoritative-compiler-closeout
```

The command intentionally covers the authoritative compiler surface that occurs after the current
module-size stop:

| Gate | Result |
| --- | --- |
| Native-manifest contract v14 and browser/desktop native parity | Passed |
| Canonical project schema v5 and 39-field persisted contract | Passed |
| TypeScript typecheck | Passed |
| Imported and authored browser project-package checks | Passed |
| Browser native scenario-package compatibility checks | Passed |
| Scenario JSON schema, fixtures, and report | Passed; 77 step kinds |
| Scenario generation smoke | Passed; 10 lanes and 20 Windows/Classic-Mac exports |
| Annex-free authoritative ownership proof | Passed; deterministic output and exact browser/Rust parity on both targets |
| Generated scenario and rules baselines | Passed |
| Production browser build | Passed; existing large-chunk warnings remain nonfatal |
| Full Rust suite and imported fixture corpus | Passed; 263 tests, 2 ignored |

During this audit the gate exposed a stale browser project-package harness dependency: it compiled
`fsAccess.ts` without its generated native-manifest module. The harness now includes that dependency,
and the focused package check and complete closeout command pass.

## Known separate conditions

### ISY-319/320/321

`npm run check` runs compiler convergence first and passes it, then reaches the existing module-size
failures in the map UI, `realmz/assembly.rs`, and stylesheet owners. The authoritative closeout
does not waive or rebaseline those failures. Resolve them in their dedicated milestone, then rerun
the complete aggregate check.

### Stock Classic acceptance

The Classic-Mac folder target is structurally deterministic and byte-parity-gated. The modern
Oracle runtime has exercised the ownership scenario through movement, an Action Point, save, and
reload. A manual Realmz 7.1.2 run under Basilisk II discovered the scenario and began startup, then
failed while loading its Custom 1 map with `EL412` and the paired messages `Could not locate
required map data.` and `You need to update your copy of Realmz or this scenario.`

Realmz source makes this result specific: `loadpixmap(6)` requests `PICT 306` and calls
`scratch(412)` when that resource is unavailable. The generated `Scenario.rsrc` contains the valid,
decoded `PICT 306`, but the acceptance ZIP stores `Scenario` and `Scenario.rsrc` as two ordinary
entries and contains no AppleDouble, MacBinary, or other fork metadata. Expanding that ZIP on an
HFS volume therefore does not attach the sidecar bytes as the resource fork of `Scenario`.

This run proves stock Classic scenario discovery and identifies the remaining failure as transport,
not a scenario-version handshake or canonical compiler defect. Fork-aware Classic-Mac packaging is
deferred because current Realmz is the required compatibility target; it remains optional before a
Classic 7.1.2 gameplay claim can be made.

### Optional follow-up work

Rust/Wasm compiler unification, Classic-Mac fork-aware packaging, arbitrary
PICT editing, and uncommon legacy sidecar authoring remain optional follow-ups. Imported
unsupported payloads continue through the bounded compatibility annex.

The optional-media and legacy-sidecar classifications are recorded in
[`native-file-ownership-matrix.md`](native-file-ownership-matrix.md). Scenario `snd ` effects are
not deferred with custom music: Providence authors them as managed resources and projects decoded
WAV runtime media into the Realmz Remake Classic bundle. Standard MOD assets in the three current
`Custom N Music` slots now compile into both native targets; they remain an explicit Realmz Remake
Remake scenario-v3 limitation because that contract has no playlist semantics.

## Integration sequence

1. Refresh and verify the mainline relationship:

   ```powershell
   git fetch origin main
   git merge-base --is-ancestor origin/main HEAD
   ```

2. Run `npm run check:authoritative-compiler-closeout`.
3. Integrate this existing Providence branch; do not create a replacement repository or a Realmz
   source branch for compiler ownership.
4. Resolve ISY-319/320/321 and run the full `npm run check` before release.
5. Add fork-aware packaging and repeat the Classic 7.1.2 gameplay run only if Classic-Mac support is
   promoted from optional compatibility work.
