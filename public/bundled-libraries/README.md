# Bundled Realmz/Divinity Library Fixtures

Providence includes these non-commercial Realmz/Divinity reference libraries so end users do not need to locate or import the original editor/reference folders before using shared authoring tools.

Sources used for this fixture snapshot:
- Divinity: F:\Divinity CD\Divinity CD\Install Options\World of Realmz\Divinity
- Realmz reference data: F:\Realmz\base\Realmz\Data Files

These files are treated as read-only library fixtures. Providence copies them into the managed workspace catalog on first run and marks unsupported formats inspect-only until parser/writer behavior is fixture-backed.

`providence/Outdoor Music.mod` is the standard MOD compatibility replacement from Realmz-Castle/realmz PR #306 (commit `7f6d7fa`). Providence exposes it as a protected built-in Custom Library asset. The replacement is used automatically only when a scenario's `Custom 1 Music`, `Custom 2 Music`, or `Custom 3 Music` payload exactly matches the known 60,224-byte legacy Outdoor Music blob (MD5 `1A2E7CC637BCF082D21204E2DA1028B2`). This is a single-file compatibility alias, not general MADG or PlayerPRO support.
