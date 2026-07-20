# Authoritative Compiler Merge Readiness

Audit date: 2026-07-20

## Verdict

The authoritative Realmz compiler work is ready for maintainer review and integration from the
compiler, canonical-project, native-package, and imported-compatibility perspectives.

Repository-wide `npm run check` is not yet green because the separately tracked ISY-319/320/321
module-size milestone remains unresolved. Stock Classic Realmz execution of the Classic-Mac target
also remains an external acceptance check. Neither condition is evidence of a remaining
authoritative compiler architecture or native-writer blocker.

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
reload. A stock Classic Realmz run remains required for target-specific packaging acceptance, not
for the canonical ownership verdict.

### Optional follow-up work

Rust/Wasm compiler unification, custom music authoring, arbitrary PICT editing, and uncommon legacy
sidecar authoring remain optional follow-ups. Imported unsupported payloads continue through the
bounded compatibility annex.

## Integration sequence

1. Refresh and verify the mainline relationship:

   ```powershell
   git fetch origin main
   git merge-base --is-ancestor origin/main HEAD
   ```

2. Run `npm run check:authoritative-compiler-closeout`.
3. Complete the stock Classic acceptance run when the executable environment is available.
4. Resolve ISY-319/320/321 and run the full `npm run check` before release.
5. Integrate this existing Providence branch; do not create a replacement repository or a Realmz
   source branch for compiler ownership.
