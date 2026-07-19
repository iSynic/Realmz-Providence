# Evidence Card: Minimum Scenario Resource Fork

## Decision

A fresh third-party scenario requires an openable scenario resource fork, but it does not require
synthetic `RLMZ` metadata. Providence's authoritative minimum is therefore a deterministic,
zero-entry Resource Manager container. Project-owned map names, icons, pictures, sounds, text, and
styles are compiled into that container only when the canonical project uses them.

## Realmz Source Evidence

| Source | Evidence | Confidence |
| --- | --- | --- |
| `F:\Realmz\src\realmz_orig\misc.c:2678-2684` | Scenario selection opens `:Scenario` as a resource file and immediately fails if the open returns a negative reference number. | source-supported |
| `F:\Realmz\src\realmz_orig\misc.c:2687` | After opening the fork, selection computes `CountResources('RLMZ') - 1`; it does not require a positive `RLMZ` count before continuing. | source-supported |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:21-26` | The `RLMZ` count/index consistency check applies only while `currentscenario < 20`, the built-in scenario range. | source-supported |
| `F:\Realmz\src\realmz_orig\loadsavedgame.c:528-533` and `save-direction-order.c:23-28` | Load and save repeat the same built-in-only `RLMZ` index check. | source-supported |

Synthesizing an `RLMZ` entry for a new third-party scenario would therefore invent built-in index
metadata and could change registration/index behavior. It is not part of the neutral compiler
baseline.

## Corpus Evidence

`docs/generated/resource-fork-inventory.json` currently contains 87 captures of main scenario
resource forks named `Scenario`, `Scenario.rsrc`, `Scenario.rsf`, or `._Scenario`. Forty-nine have
no `RLMZ` resource, including authored third-party scenarios and Divinity's `New Scenario` and
`Tutorial` roots. The remaining captures use 5-17 `RLMZ` resources and correlate with the built-in
scenario index behavior in Realmz source.

This proves that `RLMZ` is not universally required scenario payload. It does not prove every
possible resource referenced by a particular authored scenario is optional; those resources remain
owned by their canonical map, asset, text, icon, and rules models.

## Compiler Contract

The minimum fresh container is exactly 46 bytes:

- data offset: 16;
- map offset: 16;
- data length: 0;
- map length: 30;
- standard empty type-list marker: `0xffff`;
- parsed resource entry count: 0.

Both the Rust and browser compilers call a named minimum-resource-fork writer. The generated
baseline and authoritative ownership proof require the exact 46-byte representation, zero parsed
entries, repeated byte identity, and browser/desktop parity. Imported resource payloads remain in
the compatibility annex unless replaced or removed through supported canonical resource models.

## Runtime Evidence And Remaining Acceptance Boundary

The existing authoritative Realmz runtime gate has selected and started the fresh scenario with
this zero-entry fork, then exercised movement, an Action Point and message, save, displacement, and
reload in the existing Oracle-instrumented modern runtime binary. This Providence branch made no
Realmz source or binary changes, but the Oracle executable itself is a diagnostic build rather than
an unmodified release binary. The Oracle's separate `scenario-not-appearing` fixture proves that
removing the resource sidecar prevents selection; that fixture proves file/container presence, not
a required payload entry.

Stock Classic Realmz acceptance remains a separate manual gate. The current `mac-classic-folder`
transport emits `Scenario.rsrc`; it does not create an HFS resource fork or AppleDouble wrapper.
Consequently, this slice proves the resource-container payload contract, while native Classic-Mac
metadata/transport remains an explicit packaging unknown.
