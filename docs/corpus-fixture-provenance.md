# Corpus Fixture Provenance

Providence's external scenario corpus is mutable source material. Tests that
assert generated corpus metadata must use stable snapshots when the accepted
source scenario no longer matches the metadata being asserted.

## Fixture Resolution

`src-tauri/tests/fixture_roundtrip.rs` resolves scenario fixtures in this order:

1. `PROVIDENCE_SCENARIO_CORPUS`, when set and the named scenario exists there.
2. `F:/Realmz/corpus-fixtures` for compatibility snapshots.
3. `F:/Realmz/base/Realmz/Scenarios` for the working source corpus.

Keeping compatibility snapshots outside the working source tree prevents a
source update from silently changing the fixture under a fixed expectation.

## City of Bywater

The compatibility snapshot is stored at:

`F:/Realmz/corpus-fixtures/City of Bywater`

It was copied on 2026-07-14 from:

`F:/realmz-edit-text-caret-artifacts-run/bin/Scenarios/City of Bywater`

That package is byte-for-byte identical across all 32 files to the Realmz
source checkout at:

`F:/Realmz Castle Realmz - Codex/base/Realmz/Scenarios/City of Bywater`

Its `Data BD` file is 88,922 bytes with SHA-256:

`c02c3cf86e4948198b0e9e9de2c0fb571a1f221407f957c273b786aa48c63b3e`

This snapshot matches the City of Bywater entry in:

`F:/Realmz Scenario Utility/docs/scenario-format/generated/corpus-summary.json`

Its `Scenario.rsrc` contains one `PICT`, ID 32128. It does not contain custom
landlook atlas resources `PICT 306`, `PICT 307`, or `PICT 308`, so the hardened
fixture test expects no scenario-supplied tile atlas for this package. Stock
landlooks remain available through Providence's bundled Realmz references.

This is a compatibility baseline, not a declaration that this is the
canonical City of Bywater release. It contains beta additions that should have
been reverted. A future corpus refresh should replace this snapshot with the
accepted reverted scenario, regenerate the corpus metadata and tile-atlas
expectations from that package, and then remove this exception.
