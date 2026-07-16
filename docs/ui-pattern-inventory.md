# Providence UI Pattern Inventory

Shared density, spacing, state, focus, layer, scroll, and keyboard rules are defined in [Providence UI Foundations](ui-foundations.md). This inventory tracks where those contracts are adopted and where domain geometry intentionally remains specialized.

This is the initial ISY-330 inventory. It records implementation families that should be audited before M20 chooses a shared replacement. Counts are baseline evidence, not quality judgments.

## Current Foundation

`src/editor/ui` exports eighteen shared component families:

- `PanelSection` and `CollapsibleSection`
- `FloatingWorkbenchPanel`
- `FieldRow`
- `EntityRow`
- `PreviewCard`
- `IssueGroup`
- `LinkChip`
- `ValidationGate`
- `EmptyState`
- `HelpBubble`
- `ScrollArea`
- `SearchField`
- `ReferenceField`
- `ReferencePicker`
- `ReferencePreview`
- `ModalDialog`
- `WorkbenchTabs`
- `SegmentedControl`

At the ISY-330 baseline, 35 editor files import the shared UI module. This is enough adoption to evolve rather than replace the layer.

## CSS Footprint

The editor owns 38 CSS files with roughly 24,000 nonblank lines. The largest physical owners remain:

| Owner | Approximate lines | Initial interpretation |
| --- | ---: | --- |
| `styles/shell.css` | 4,855 | Shell plus many cross-tool controls; highest consolidation priority |
| `styles/text-scenario.css` | 3,653 | Text and Scenario share a large visual owner despite different workflows |
| `styles/encounters.css` | 2,960 | Dense fixed-record layouts plus repeated picker/preview styling |
| `styles/rules.css` | 1,806 | Record forms, navigation, previews, and rule-specific geometry |
| `styles/assets.css` | 1,659 | Media grid, filters, inspectors, import, and preview windows |
| `styles/combat-battles.css` | 1,315 | Battle-specific geometry mixed with reusable control patterns |
| `ui/workbench.css` | 946 | Existing shared layer; pane-header contracts added under ISY-331 |

M20 should move reusable declarations into the shared layer only as consuming components migrate. File size alone is not a reason to move domain geometry.

## Search Families

### Global navigation

- `workbench/GlobalSearchDialog.tsx`
- Grouped scopes, ranking, pressed filter semantics, combobox active-result ownership, Arrow/Home/End navigation, Enter, Escape, and Ctrl+K.
- This is a navigation system, not the model for choosing a field value.

### Script and encounter references

- `components/RealmzTargetPicker.tsx`
- `panels/scripts/ReferenceIdField.tsx`
- `panels/scripts/ItemIdField.tsx`
- Search-target implementations embedded in `components/EdcdRowEditor.tsx`
- Encounter response, result target, result sound, and code-helper floating panels

This family has the richest target semantics and should supply the data model for the shared reference system. It currently combines several interaction shapes: inline search results, native select, raw numeric input, quick preview, create-target command, and deep-link command.

### Record and library browsers

- String and resource searches in `TextPanel.tsx`
- Asset search and preview filters in `ResourcesPanel.tsx` and `ResourceWidgets.tsx`
- Monster Library, scenario monster, and battle palette searches
- Items, Shops, Treasure, Bag of Holding, and Vault searches
- Rule record navigation and icon selectors
- Land tile and stamp palette searches

These should share query fields, clear behavior, result counts, filter controls, empty states, and large-list policy while retaining domain-specific rows and previews.

### Documentation search

- `views/DocumentsView.tsx`
- Local chapter/content filtering with navigation semantics.
- It should use the shared search field but not a reference picker.

## Picker And Preview Families

| Family | Current examples | Consolidation target |
| --- | --- | --- |
| Inline reference | AP targets, EDCD targets, item IDs | `ReferenceField` with consistent selected and unresolved states |
| Floating reference picker | Encounter response/result panels | `ReferencePicker` shell with pluggable rows and preview renderer |
| Media/icon picker | Item icons, monster icons, Assets | Shared reference shell for item and monster icons; domain asset grids remain specialized |
| Quick preview | Eye actions for strings, sounds, targets, resources | `ReferencePreview` using the same renderer registry as the picker |
| Persistent inspector | Assets, maps, combat, suite details | Shared inspector sections and command placement |

The first shared renderer types should be string, sound, picture/icon, item, monster, battle, treasure, map location, Action Point, and raw resource.

## Overlay Families

Providence now has shared modeless and blocking overlay contracts. Project creation, project close, draft changes, global search, battle-reference repair, Documents, the movable Divinity Manual window, Asset Import, and destructive Action Point confirmations use `ModalDialog` for focus, Escape, backdrop, and focus-return behavior while retaining their domain layouts. Item and monster icon selection use the shared movable reference panel. Menus, palette windows, and reference previews remain modeless surfaces with their own keyboard and dismissal contracts.

## Baseline Findings

- The desktop and compact Extra Action Points captures preserve the same core workflow, but compact width truncates several status labels and reduces list/editor breathing room.
- The shell no longer enforces the former 1100 x 720 document minimum. Compact windows keep topbar and status ownership inside the viewport, while dense workbenches retain local scrolling and responsive rules instead of forcing the entire application off-screen.
- The Complex Encounter desktop capture keeps all response groups in one scan row. At compact width, Typed Reply wraps below the other response groups and Result Scripts falls below the first viewport; the editor remains usable, but its scan order changes substantially.
- Direct tool captures prove populated base layouts. Complex Encounter result targets now provide explicit open, filtered, selected, no-match, and unresolved interaction recipes; the same state set should be reused by later picker migrations.
- Search fields do not consistently expose a clear command, result count, loading state, or the same keyboard behavior.
- Several reference fields expose search, select, raw ID, preview, and navigation simultaneously even when only one authoring choice is primary.
- Eye actions are moving toward a consistent preview meaning, but their floating surfaces remain independently composed.
- Some overview lists still use fixed visible slices. Each occurrence must be classified as deliberate pagination/virtualization or replaced with a complete searchable/scrollable collection.
- Tool tabs, segmented modes, and combinable filters are not always visually distinct.
- Suite, Rules, Scenario, and Combat domain headers now use `PanelHeader` for stable title, description, and project-context regions while preserving a real `h1`; specialized media-heavy tool heroes retain their own geometry until their domain audit.
- Economy, writable-record family, Rules, Combat, Text, and Scripts top-level navigation now use `WorkbenchTabs`, including roving focus and Left/Right/Home/End keyboard selection; specialized map and fixed-grid modes remain candidates for domain-by-domain review.
- Project creation, tile-palette source, stamp-library scope, and the shell's Project/Library switch now use `SegmentedControl`, with pressed-button semantics and the same roving Left/Right/Home/End keyboard model while their domain geometry remains locally owned.

## First Implementation Slice

ISY-332 starts with the shared `SearchField`, now used by Complex Encounter response pickers and the action-code helper. It standardizes the clear action, result count, status line, accessible name, and input geometry while leaving domain result rows intact.

The next implemented layer is the typed `ReferencePicker`. `TargetPicker` now delegates its searchable selected/result presentation to that primitive while retaining Realmz signed-ID, sound, media, creation, and macro-flow behavior. Shared matching is term-based, unresolved values stay visible, and result lists are complete rather than sliced to an arbitrary count.

The pluggable `ReferencePreview` registry now owns text, summary, image, audio, custom-domain, unavailable, and missing presentation without implying navigation or mutation. Complex Encounter result targets use it for their floating preview and expose open, filtered, selected, no-match, and unresolved audit states. Documents is the first non-script surface migrated to the shared `SearchField`; later record and library browsers should reuse the same field and state vocabulary.

Action Point EDCD item, message, sound, and record-target searches now use the same `ReferencePicker` contract. The migration preserves raw and unresolved numeric values plus open, clear, and macro-flow actions, removes arbitrary six- and eight-result slices, and retires the corresponding bespoke search-result CSS. The Action Point audit includes a filtered picker state at desktop and compact widths.

Complex Encounter Magic/Item response browsers and the encounter Sound Preview now use `ReferencePicker`; Sound Preview also delegates playable and unavailable states to `ReferencePreview`. These floating tools no longer maintain local current-selection/result-list styling or truncate their option collections at 100 or 160 entries. Deterministic item-response and sound-preview audit states cover the migrated surfaces.

The Strings workbench now uses `SearchField` for message filtering, occurrence navigation, option labels, scrolling text, and reference resources. Option Labels and Scrolling Text each expose one list-local filter instead of synchronized toolbar and sidebar duplicates. Reference resources retain incremental loading, but the former silent 120-row slice now has an explicit Show More action and reports the full match count.

The Action Point inventory, Action Settings browser, and action chooser now use `SearchField` as one coherent browsing family. All three expose the same clear action, result-count status, input geometry, and accessible search semantics while preserving their map/status/category filters and domain-specific result cards.

The shared layer now includes `ReferenceField` for inline numeric references. EDCD targets and item-ID fields both compose it over `ReferencePicker`, so selected, empty, unresolved, raw-ID, clear, Enter, and Escape behavior no longer depends on separate field implementations. Item searches also return the complete matching collection instead of stopping silently at twelve rows.

Target Record monster fields now use the same inline reference contract, including signed combat-side values and unresolved numeric IDs. Its treasure and shop catalog searches use `SearchField` with complete result counts and explicit incremental paging, replacing silent 36- and 72-row truncation while preserving category filters and record mutation behavior.

Full-size Target Record ID fields now compose `ReferenceField` instead of maintaining a second search, selected-result list, native select, and raw-number control. Signed string and sound behavior, unresolved numeric targets, record creation, and clear actions remain available through the shared picker. Dense rogue/encounter table cells retain their compact select plus raw-ID layout until the compact reference pattern is redesigned as a dedicated surface.

Simple, Complex, Rogue, and Timed encounter record navigation now uses the shared searchable `ReferenceField` instead of long native dropdowns. Navigation remains limited to existing records, missing imported selections remain explicit, and the same component serves setup panels and standalone encounter shells without maintaining a second selector style.

The Complex Encounter Rogue branch now uses the same encounter option model and searchable `ReferenceField`. The branch toggle remains compact, while target selection, unresolved imported IDs, and the separate open-record command share the standard selected/result presentation instead of another setup-bar dropdown.

Action Point target eyes now open the shared movable `FloatingWorkbenchPanel` and render through `ReferencePreview`. Inline sound and picture previews remain owned by `TargetPicker`, so the unreachable duplicate media resolver and legacy preview controls have been removed; destructive confirmations remain modal because they mutate records immediately.

Story Flags now uses `SearchField` for decoded flags and flags available to an author note. Both searches report complete result counts, and the former silent eighteen-flag limit has been removed.

Combat monster and icon browsing now shares `SearchField` across the battle palette, Monster Library, Scenario Monsters, monster icon picker, icon-set library, and icon targets. Specialized virtualized palettes, drag/drop rows, and media grids remain unchanged while search clear actions, result counts, and accessible labels become consistent.

Monster record icon selection now composes the compact `ReferenceField` and paired custom previews. The picker remains limited to complete base/alternate icon pairs, reports source ownership, keeps the selected large monster preview and source badge visible, and exposes the full Icon Set workbench as an explicit action. Its bespoke fixed backdrop, search shell, grid, and Escape handling have been retired in favor of the shared movable picker contract.

Battle record navigation, before/after strings, and the end-of-round Battle Macro now form one shared compact reference family. Record navigation keeps previous/next commands around a searchable Battle picker; string pickers search full message text and provide editing or creation in the picker preview; Battle Macro search preserves signed runnable storage and exposes its Action Point flow. Missing imported numeric references remain explicit, while the former number pagers, eye toggles, and layout-shifting inline disclosures have been retired. The battle board and monster palette remain specialized.

Economy item browsing now uses the same search contract in Items, Shops, and Treasure. Category filtering composes over the canonical item matcher, full match counts remain visible when large collections are capped for rendering, and the existing record and slot geometry remains domain-owned. The custom-item icon field now composes the shared compact `ReferenceField` with selected and result-row image previews: item, project, and library aliases merge by `cicn` ID, imported raw IDs remain selectable as unresolved values, and the former silent modal-specific cap and CSS have been retired. Its 1,500-plus merged references remain fully searchable while the shared picker renders them in explicit 160-row increments with a visible Show More state.

Rules and Combat top-level workbench navigation now use the same tab contract as Economy and writable-record editors. Tool-specific counts, labels, tutorial affordances, and layout widths remain domain-owned while selected state, accessibility roles, and keyboard navigation come from `WorkbenchTabs`.

Text and Scripts top-level workbench navigation now use that contract as well. Text retains conditional Option Labels visibility, per-family counts, tutorial help, and draft-discard guards; Scripts retains its five authoring destinations and draft-discard guard while gaining the shared roving-focus keyboard behavior.

Treasure item slots and Shop stock rows now use one compact Economy item-reference field. The shared picker searches item IDs, names, categories, decoded details, and source ownership; it keeps icon previews and unresolved imported IDs while removing Treasure's duplicate native select plus raw-number controls and Shop's full-catalog select per row. Quantity editing and each tool's fixed slot geometry remain domain-owned.

Large searchable collections now share `IncrementalListFooter` for an explicit visible/total count and Show More command. `ReferencePicker`, the Items browser, Treasure and Shop item pools, and Shop stock no longer use bespoke or silent render caps; the Shop stock grid also contracts without horizontal overflow at compact desktop widths. Remaining fixed summaries are intentionally bounded previews rather than editable search results.

Custom Item sounds now use the shared compact reference and audio-preview controls. The Economy adapter merges scenario, project-catalog, and reference-library sound aliases by direct `snd` ID, keeps signed imported values until an author changes them, and removes the raw number-plus-Play implementation. This remains separate from the Rules sound adapter because spell fields store an offset value rather than the direct item sound resource ID.

Custom Item specific Race and Caste restrictions now use an Economy-owned compact reference adapter instead of long native dropdowns. The picker reuses canonical Realmz names while preserving the Item record's distinct one-based values, its `0 = Any` sentinel, and unusual imported values; Rules record navigation remains zero-based.

Custom Item cursed-form references now use the same Economy item picker as Treasure and Shops. The field searches the complete item catalog with icon previews, preserves `0 = No cursed form` and unresolved imported IDs, and replaces the long native item dropdown without changing Realmz's cursed-item substitution contract.

Custom Item Category and Type now use Economy-owned compact reference pickers. Category searches the full 57-entry Realmz category table and keeps empty or imported multi-category bit pairs explicit until the author chooses a single replacement; Type searches all 26 decoded equipment/use values and preserves unknown imported values. Short behavior-mode and filter enums remain native selects.

Custom Item Special behavior fields now retain their short native mode selectors while decoded condition, power, hit-bonus, ability, monster-type, and party-condition details use the shared compact reference picker. Imported unknown values remain editable in explicit raw-number mode, and the reusable numeric item input no longer leaks through the Item workbench into Shop and Treasure ownership.

The Item workbench now delegates complete Special behavior and use-restriction edit/summary families to Economy-owned modules. Decoding, signed restriction-mask handling, searchable specific Race/Caste references, and fixed checkbox geometry remain together at the domain boundary instead of leaving migrated controls and their storage logic in the workbench router.

Monster record macros, equipped and required weapons, ten spell slots, and six loot-item slots now use one Combat-owned compact reference adapter. These fields search decoded labels and metadata, preserve explicit empty sentinels and unresolved imported values, and retain the required-weapon byte/display conversion at the adapter boundary. The small Summon Eligible enum and fixed battle-board placement controls remain native, specialized controls rather than opening unnecessary search workbenches.

Battle reference repair keeps its destructive confirmation modal but now uses the shared inline reference picker for replacement monsters. Candidates expose names, IDs, active combat stats, and Normal/Monster/Mega record availability; authors can search those facts instead of scanning a long anonymous `Monster N` dropdown before rewriting placed battle cells.

The selected battle-cell inspector now uses the same compact Combat reference picker for its anchor monster. Authors can search the active set by monster ID, name, stats, or icon while Empty, missing imported placements, and the separate force-friend sign control retain their existing battle-grid semantics; the board, brush palette, and placement geometry remain specialized.

Monster attack Form and Special codes now use the shared compact reference picker instead of a Combat-only popover and menu stylesheet. Each of the five attack rows opens a searchable code/name list, known values show their decoded label, and unusual imported codes remain explicit until the author selects a supported value; damage fields and attack-row geometry remain unchanged.

Rules record navigation now uses the shared compact `ReferenceField` for Race, Caste, and per-class Spell selection. Long native record dropdowns have become searchable floating pickers with the standard selected, filtered, no-match, and unresolved states; previous/next navigation, scenario-copy commands, and dense fixed-record form geometry remain Rules-owned. The short Spellcaster Class mode list intentionally remains a native select.

Spell casting and resolution sounds now use the same compact `ReferenceField` plus `ReferenceAudioPreviewAction`. Authors can search by sound name, stored spell value, or `snd` resource ID; unresolved imported values remain explicit, playback remains available on read-only built-in spells, and the former raw number-plus-Play control has been retired.

Race portrait sets and Caste default icons now use a Rules-owned compact `ReferenceField` with image preview. Race keeps its stored six-icon set index distinct from the mapped first `cicn` resource ID, Caste keeps its direct `cicn` contract, and both preserve unresolved numeric values instead of silently replacing imported data.

Spell cast animations, resolution animations, and queue icons now use the same compact reference contract with preview thumbnails in both the selected field and result rows. The picker preserves the different value-zero meanings, accepts mapped `cicn` or combat-tile IDs in search, and keeps unusual imported bytes available as explicit raw values instead of normalizing them away.
