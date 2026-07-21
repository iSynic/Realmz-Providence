# PICT conformance fixtures

`manifest.json` is the shared byte-level contract for Providence's Rust and
browser PICT preview decoders. Each payload is stored as base64 so both
runtimes consume exactly the same bytes without normalizing imported data.

Claims use three evidence labels:

- `specification-backed`: the stream shape comes from documented QuickDraw
  PICT structure and still needs corpus confirmation where noted.
- `fixture-proven`: the shape is already exercised by a real Realmz-family
  payload or an established Providence regression fixture.
- `unknown`: the fixture records a bounded gap without claiming its intended
  rendered result.

`ownerIssue` identifies the parser milestone expected to replace a recorded
known-gap outcome. DirectBits fixtures remain authoritative even where early
PICT notes predate those later opcode meanings.

`currentExpectations` is executable in both runtimes and records today's exact
status, dimensions, RGBA checksum, version, opcode, and diagnostics.
`targetExpectations` names only deliberate known-gap outcomes; parser issues
move those entries into the current contract as they are implemented.

The matrix also covers ordered composition of multiple bitmap drawing commands,
the stream shape used by Kalypso's Island PICT 30128.

Run `npm run audit:pict-corpus -- --check` for the full local scenario pass. It
inventories every PICT occurrence, compares browser and Rust RGBA output,
round-trips each resource fork, and writes PNGs plus JSON/Markdown evidence to
`tmp/pict-corpus-audit`. `fixtures/pict-corpus-review.json` binds the completed
visual review to both the payload set and rendered-output fingerprints, so new
PICT bytes or changed rendering require another visual review.
