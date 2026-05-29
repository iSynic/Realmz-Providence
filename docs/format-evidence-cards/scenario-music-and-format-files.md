# Evidence Card: Scenario Music And Format Marker Files

## User-Facing Unlock

Providence can preserve and eventually manage custom scenario music without confusing it with `snd ` sound effects. It can also classify zero-byte `Format` files as compatibility markers rather than unknown binary payloads.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\MusicManager.cpp:31` | Runtime playlist table defines built-in music playlists and custom scenario playlists. |
| `F:\Realmz\src\MusicManager.cpp:45` | `Custom 1 Music` is playlist `12` and scenario-local. |
| `F:\Realmz\src\MusicManager.cpp:46` | `Custom 2 Music` is playlist `13` and scenario-local. |
| `F:\Realmz\src\MusicManager.cpp:47` | `Custom 3 Music` is playlist `14` and scenario-local. |
| `F:\Realmz\src\MusicManager.cpp:48` | Custom playlist support continues through `Custom 9 Music`. |
| `F:\Realmz\src\MusicManager.cpp:118` | Scenario music lookup roots are built from the active scenario path. |
| `F:\Realmz\src\MusicManager.cpp:173` | Music parser supports PlayerPRO `MADG` modules. |
| `F:\Realmz\src\MusicManager.cpp:287` | Other supported module formats are passed to the ResourceDASM module parser. |
| `F:\Realmz\src\realmz_orig\music.c:6` | Legacy `music(short playlist)` dispatches playlist numbers to the music manager. |

## Byte Layout Notes

### `Custom N Music`

- Files are scenario-local music modules, not `snd ` sound effects.
- Names observed in the corpus are `Custom 1 Music`, `Custom 2 Music`, and `Custom 3 Music`; runtime supports up to `Custom 9 Music`.
- Modern Realmz source supports PlayerPRO `MADG` and other module formats through ResourceDASM.
- Providence currently preserves these files byte-for-byte. Import/preview/edit support is a future asset-workbench target.

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

## Providence Follow-Up

- Follow-up: `preserve-only`, then `editor-ui` for music preview/import.
- Keep scenario music separate from short sound effects in Assets.
- Show custom music files under Scenario Assets as files that ship with the scenario.
- Use the module parser for preview/playback only after fixture checks confirm supported formats.
- Keep `Format` hidden in normal UI or shown as an Advanced compatibility marker.

## Writer Gate

Do not rewrite module bytes unless the user explicitly imports/replaces a scenario music file. Do not synthesize or remove `Format` unless Divinity or Realmz source evidence proves when it is required.
