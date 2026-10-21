# Supported native content

Providence imports and exports Classic scenario folders and supported StuffIt
containers. Exact imported source retention and editable/usable runtime content
are separate guarantees. Review Issues before publishing an imported scenario.

| Content | Supported scope | When preparation is needed |
|---|---|---|
| Text | MacRoman within each native record's byte limit; scrolling TEXT with supported paired styles | Characters outside MacRoman require an author-selected replacement; unsupported original bytes remain preserved |
| Maps | Native 90×90 Land/Dungeon words, features and supported exact resource atlases | Custom joining geometry needs reviewed mappings; unsupported line pieces remain exact-tile brushes |
| PICT/CICN | Existing Classic decoder profiles and required role geometry | Unsupported depth/encoding or malformed artwork is diagnosed; imported originals are retained |
| Sound | Existing supported Classic snd decoder profiles | Unsupported compression/shape requires an external conversion workflow |
| Music | Exact standard 31-sample MOD in Custom 1–3 Music; replacement and audition | General MADG/other tracker formats and composing music are outside this support profile |
| Image import | Supported static PNG and editor media profiles | Animated PNG is rejected; choosing a frame or conversion is an explicit external preparation step |
| Partial/unknown records | Retained original source, explicit diagnostics and guarded runtime projection where supported | Byte retention does not make arbitrary partial records editable or executable |

Present malformed scenario overrides do not silently fall through to stock art.
Application fallback is resolved by exact resource identity and ownership.
Optional imported media can be quarantined from runtime output without discarding
the original. Freshly authored content must pass the stricter authoring checks.

Supported-profile defects are tracked in the completeness register. This table
does not claim support for every historical PICT, CICN or snd variant, original
font rasterization, or independently verified campaign behavior.
