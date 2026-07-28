# Evidence Card: Scenario Music And Format Marker Files

## User-Facing Unlock

Providence manages authored standard MOD scenario music without confusing it with `snd ` sound effects. It also preserves unsupported legacy music and zero-byte `Format` compatibility markers in the import annex.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| Realmz-Castle/realmz PR `#306` | Current scenario-music contract defines three custom slots named `Custom 1 Music`, `Custom 2 Music`, and `Custom 3 Music`. |
| Realmz-Castle/realmz PR `#306` | The slots are playlists `15`, `16`, and `17`, selected by custom landlooks whose final picture IDs are `6`, `7`, and `8`. |
| Realmz-Castle/realmz PR `#306` | Authored scenario music accepts standard MOD modules. MAD/MADG, MIDI, S3M, XM, IT, MTM, MED, and PlayerPRO formats are not part of the authoring contract. |
| Realmz-Castle/realmz PR `#306` | The known 60,224-byte legacy MADG Outdoor Music blob (MD5 `1A2E7CC637BCF082D21204E2DA1028B2`) redirects to a bundled standard MOD replacement. Providence mirrors that exact compatibility alias without adding general MADG support. |
| `Trouble in the Sword Lands/Custom 1 Music` | 241,158-byte `8CHN` standard MOD titled `Approaching Antares` (SHA-256 `b26e7cc22a19fab1cf6e345f370c76f072b7a73c0435caa533f63e2418e3e53f`). It is canonical scenario music, distinct from that scenario's MADG `Custom 2 Music`. |

## Byte Layout Notes

### `Custom N Music`

- Files are scenario-local music modules, not `snd ` sound effects.
- The current authored contract has exactly three slots: `Custom 1 Music`, `Custom 2 Music`, and `Custom 3 Music`.
- Providence stores each as a managed `music` asset with an explicit `scenarioMusicSlot` from 1 through 3.
- Import validates a standard 31-sample MOD structure. The original module bytes remain canonical and are written unchanged to native Mac and Windows scenario folders.
- Imported `Custom 1 Music` through `Custom 3 Music` files that pass that validation become canonical managed music assets. Supported signatures include common four-channel and multichannel forms such as `M.K.` and `8CHN`.
- Assets previews MOD files through libopenmpt. Preview support does not broaden the native export contract to the other tracker formats libopenmpt can decode.
- Providence's protected built-in Custom Library includes the PR #306 standard MOD replacement for Outdoor Music.
- The replacement is kept byte-identical to PR #306. Its sample headers overstate the trailing payload by four bytes, so Providence permits that discrepancy only for the replacement's exact SHA-256; other truncated MOD files still fail validation.
- When imported `Custom 1 Music`, `Custom 2 Music`, or `Custom 3 Music` bytes match the known legacy blob exactly, the raw MADG stays in the compatibility annex while the replacement MOD becomes the canonical scenario music asset used for preview and export. Unmatched MADG remains annex-only.

### Legacy `Custom N`

- `Custom 1` is observed in `Lord of the Abyss` scenario roots with a module-like data fork beginning with track/instrument text such as `beast music 1`.
- The modern Realmz music manager looks for `Custom N Music`, so the unsuffixed name remains a legacy compatibility/preservation case until binary/manual evidence proves the exact lookup path.
- Providence preserves `Custom 1` through `Custom 9` names byte-for-byte as known pass-through files.

### `Format`

- Observed `Format` files are zero bytes in every visible byte-roundtrip root.
- No Realmz source consumer has been found yet.
- Treat as a scenario compatibility/export marker and preserve it exactly.

## Corpus Evidence

The byte-roundtrip audit found:

| File | Frequency | Observed Size Pattern |
| --- | ---: | --- |
| `Format` | 47/87 | All observed files are zero bytes. |
| `Custom 1 Music` | 13/87 | Module-sized binary files from 60,224 to 241,158 bytes. |
| `Custom 2 Music` | 9/87 | Module-sized binary files from 60,224 to 184,221 bytes. |
| `Custom 3 Music` | 6/87 | Module-sized binary files from 73,480 to 184,108 bytes. |
| `Custom 1` | 3/87 | Legacy unsuffixed module-like data fork, 85,324 bytes. |

## Providence Policy

- Keep scenario music separate from short sound effects in Assets.
- Show authored custom music under Scenario Assets as files that ship with the scenario.
- Preserve unsupported imported music and legacy slots 4 through 9 only in the bounded compatibility annex.
- Omit canonical music from Realmz Remake scenario v3 and report an explicit limitation until that contract defines scenario music and playlist meanings.
- Keep `Format` hidden in normal UI or shown as an Advanced compatibility marker.

## Writer Gate

Do not rewrite module bytes unless the user explicitly imports/replaces a scenario music file. Do not synthesize or remove `Format` unless Divinity or Realmz source evidence proves when it is required.
