# StuffIt dependency and format provenance

Upstream: `benletchford/stuffit-rs`, version 0.3.1, commit
`84e1a9d4c4dd209063cebcdbeab84f7c9b3dcd86`, `src/lib.rs`.
The MIT and Apache-2.0 notices accompany this dependency.

The two serialization fixes are the exact patch qualified by Packsmith commit
`73e79e57582022cea7fefa50c54fc20ca0300321`,
`assessment/patches/stuffit-rs-0.3.1-writer.patch`: encode names as MacRoman and
label an empty data fork as stored. Patched source SHA-256:
`1e6842602435b456c5fe2ec3c71b459d00eb99e64997f04256d62a2590ccade6`.
The standalone manifest excludes the CLI and FFI; library dependencies retain
their upstream declarations. No decoder or compression algorithms are changed.

Packsmith's XAD known-byte checks cover methods 0 and 13; method 14 is excluded.
These SIT5 checks did not establish original Expander restoration. The
production adapter now uses its own Classic stored writer; this dependency
supplies its independent decoder, not production compression.
The upstream name reader uses UTF-8 for StuffIt 5; Providence separately verifies
the raw MacRoman name bytes instead of treating that reader as a name oracle.

The experimental Providence SIT5 investigation finalized entry-header CRCs after sibling pointers have
been written. It covers the full header with the CRC field zeroed, following
the format description in Packsmith's pinned
`source/XADMaster/XADStuffIt5Parser.m`. The vendored writer remains byte-exact;
header-only invariants remain in test-only `classic_stuffit/verify.rs`.

That investigation also replaced the upstream fixed archive-header CRC with CRC16 of
the complete header through its first-entry offset, with bytes 98..100 zeroed.
This matches the original Hax 1.3 archive header (CRC `1f1a`), retained as a
114-byte regression fixture. Source MacBinary SHA-256:
`adf4259be232a3eb6c521f2a2749433d0b495d14461b30cde6988431ad22fa9c`;
contained StuffIt SHA-256:
`dc72d16dd27f4e9fb37e470085afd967ae53c552ba124cf79222d830c0554471`.
Packsmith independently corroborated this calculation on its previously
Expander-qualified Hax and BOutS fixtures. XAD skips this checksum; its fork
round trips alone could not detect the defect. Corrected native Expander
restoration remains a separate pending check.

The one-root flat profile also finalizes the directory's field at 38..42 as
the sum of uncompressed data and resource fork bytes of all files. Packsmith's
authentic Hax and BOutS comparison corroborates this across eight directories.
It is checked against the prepared fork lengths, not the compressed span.

Metadata field 2..4 is also CRC16/ARC, covering its 36-byte version-1 block
and the 14-byte resource descriptor when present, with field 2..4 cleared.
This matches all 172 logical entries in Packsmith's two authentic fixtures.
Header-only folder and resource-bearing fixtures own the 36/50-byte spans;
no proprietary payloads are included. The investigation finalized and checked this
field, which both the vendored writer and XAD's reader leave unverified.

## Production Classic stored writer

`crates/providence-native-adapter/src/classic_stuffit/classic_format.rs` is a
small one-root/flat-files stored writer. Geometry and fork/Finder/date offsets
are grounded in the pinned Packsmith `source/XADMaster/XADStuffItParser.m`,
commit `73e79e57582022cea7fefa50c54fc20ca0300321`, and the vendored Classic reader.
It emits `SIT!`, `rLau`, archive version 1, one top-level folder, 22-byte archive
header, 112-byte records and method 0 fork bytes. Start/end folder methods are
0x20/0x21. Fork CRCs and header CRC over the first 110 bytes use CRC16/ARC.
No source payloads or donor modules were copied.

The owner successfully expanded the full Hax stored diagnostic with Expander
5.5 and imported/played it in Realmz 7.1.2. Its exact archive hash and independent
fork receipt are recorded in `docs/certification/classic-stuffit-export.md`.
That diagnostic had unset Finder metadata; production preserves captured fields
and verifies their decoding separately. The experimental SIT5 writer remains
byte-exact in this dependency, but is not called by production export.
