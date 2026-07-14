# Windows Resource Promotion Fixture

`windows_export_promotes_macosx_scenario_resource_fork` verifies that a
resource fork stored in `__MACOSX/._Scenario` is promoted to `Scenario.rsrc`
when a Mac-packaged scenario is exported for Windows Realmz.

The old test depended on
`C:/Users/Eric/Desktop/City of Bywater/__MACOSX/._Scenario`. Its AppleDouble
envelope contained a 113,707-byte resource-fork payload, but the embedded
resource map was zeroed. Providence therefore could not inventory `STR# Map
Names` or any other valid resource from that payload. The test expected Map
Names that were not present in its source fixture.

The integration test now constructs a deterministic AppleDouble sidecar around
the stable City of Bywater `Scenario.rsrc`, removes the direct `.rsrc` copy,
and imports through the same promotion path. A no-edit Windows export must:

- create `Scenario.rsrc` from the AppleDouble sidecar;
- preserve the complete resource fork byte-for-byte;
- preserve every parsed resource entry, including `STR# Map Names`;
- report no authored resource writes.

Map Names remain author-owned only when a map record has
`mapNameAuthored = true`. A no-edit export does not synthesize or replace them.
