# Evidence Card: Resource Fork Taxonomy And Authoring Scope

## User-Facing Unlock

Providence can separate scenario media that ships with the scenario from Realmz/Divinity reference resources used only for preview and picker context. This prevents bundled UI art or reference assets from appearing as project-owned media.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\misc.c:2753` | Scenario `Data Spell` can open a scenario resource fork for custom spell evidence. |
| `F:\Realmz\src\realmz_orig\mapstuff.c:67` | Map records read `Data MD2` and may reference picture-backed views. |
| `F:\Realmz\src\realmz_orig\loadland-loadpixmap.c:36` | Landlooks load graphics and mapstats from library/custom landlook resources/files. |
| `F:\Realmz\src\realmz_orig\textbox-time.c:34` | Scenario text display uses `Data SD2`, distinct from resource-fork `TEXT`/`STR#` references. |
| Existing card | `docs/format-evidence-cards/resource-icon-runtime-anchors.md` covers negative tile/icon runtime behavior. |

## Divinity Evidence

| Manual Line | Evidence |
| ---: | --- |
| 4526 | Divinity supports creating Special Land Tiles. |
| 4632 | Divinity has a chapter for Adding Pictures & Sounds To Your Scenario. |
| 4700-4704 | Custom sounds should be System Sound resources. |
| 4993 | Picture Editor is tied to adding scenario pictures. |
| 5017 | Special land icons are `cicn` resources placed into the Scenario file. |

## Byte Layout Notes

- Scenario-owned resources may include `PICT`, `cicn`, `snd `, `STR#`, `TEXT`, `styl`, `RLMZ`, and `vers`.
- Realmz library resources are runtime built-ins and should usually be referenced, not copied.
- Divinity editor/manual/UI resources are reference data and should be hidden from normal authoring pickers unless they are also valid Realmz runtime targets.
- Resource fork writing remains a separate writer-safety surface from fixed scenario data files.

## Corpus Evidence

- Generated corpus summaries list resource types including `cicn`, `snd `, `RLMZ`, `STR#`, `PICT`, `TEXT`, `styl`, and `vers`.
- Resource-type counts exist, but the authoring role/origin taxonomy still needs generated classification.

## Providence Follow-Up

- Follow-up: `parser-writer`, `editor-ui`, `validation`.
- Use export scopes everywhere: `Ships With Scenario`, `Realmz Built-In Reference`, `Divinity Reference`, `UI Reference`, and `Unknown / Advanced`.
- Add resource-origin classification to generated summaries.
- Keep UI reference artwork out of authoring lists by default.
- Use one shared resolver for Rules, Maps, Scripts, Scenario, Text/Strings, and Assets.

## Writer Gate

Only project-owned resources should be written to scenario export. Library/reference resources stay reference-only unless the user imports/copies them into the scenario and the resource writer supports that type.

## Compatibility Baggage

- Empty data-fork companion files such as `Icon_` can accompany `Icon_.rsrc` resource sidecars in extracted scenario roots. The resource fork is the meaningful asset payload; the empty data fork is preserved as compatibility baggage.
- Text files such as `Read Me (nice to know)` are scenario distribution documentation rather than Realmz runtime resources. Providence preserves them but should not surface them as authored scenario data unless a future package/files view is added.
