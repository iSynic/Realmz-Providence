# Corpus Fixture Provenance

Providence's external scenario corpus is mutable source material. Tests that
assert generated corpus metadata use the accepted Realmz source package, with
an environment override available for isolated fixture runs.

## Fixture Resolution

`src-tauri/tests/fixture_roundtrip.rs` resolves scenario fixtures in this order:

1. `PROVIDENCE_SCENARIO_CORPUS`, when set and the named scenario exists there.
2. `F:/Realmz/base/Realmz/Scenarios` for the canonical source corpus.

The generated corpus metadata records source-file sizes and SHA-256 prefixes,
so a source update cannot silently run against fixed expectations.

## City of Bywater

The canonical package is stored at:

`F:/Realmz/base/Realmz/Scenarios/City of Bywater`

It was accepted on 2026-07-14 from Realmz commit:

`0c19b9159ae1d982147f4dc5a3fd465b65a4e244`

The files that distinguish this reverted package are fingerprinted below:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `Scenario` | 600 | `781f88555e6559eda64f699bab99d83d9fd6e84890922f0ded59ed38eeff7ba9` |
| `Data LD` | 145800 | `0475bfcc39790e97fc3de636e870c99b58ca85b786990b71e7970732f6f6c988` |
| `Data DD` | 36000 | `bf777e5d83053ad2ce105ef3f3f83a60a62118b0ba352a421cff6c0ff61dd1dd` |
| `Data ED2` | 6760 | `0f5b9e534dd2cd4c49c2b8bb781866437c611c1ac76c0490d70bae32ce953158` |
| `Data EDCD` | 52820 | `3ef7625d0624711795d4e02166662e1700adc38e951074fd11e809bab5ddd92d` |
| `Data BD` | 88576 | `fdac766a9a05f2c9574c7c96d1c5184ea14346c89e6bcbf1b7b935b3d39bc42d` |

The retired compatibility snapshot remains at
`F:/Realmz/corpus-fixtures/City of Bywater` only as an archival copy. It is no
longer in Providence's fixture-resolution path. Its beta `Data BD` was 88,922
bytes with SHA-256:

`c02c3cf86e4948198b0e9e9de2c0fb571a1f221407f957c273b786aa48c63b3e`

The canonical package now matches the City of Bywater entry in:

`F:/Realmz Scenario Utility/docs/scenario-format/generated/corpus-summary.json`

Its scenario resource fork contains one `PICT`, ID 32128. It does not contain custom
landlook atlas resources `PICT 306`, `PICT 307`, or `PICT 308`, so the hardened
fixture test expects no scenario-supplied tile atlas for this package. Stock
landlooks remain available through Providence's bundled Realmz references.

The importer has no City of Bywater-specific compatibility branch. The
canonical package is exercised through the same import and fixture contracts
as every other hardened scenario.
