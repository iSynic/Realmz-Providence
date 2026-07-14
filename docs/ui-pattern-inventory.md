# Providence UI Pattern Inventory

This is the initial ISY-330 inventory. It records implementation families that should be audited before M20 chooses a shared replacement. Counts are baseline evidence, not quality judgments.

## Current Foundation

`src/editor/ui` exports fourteen shared primitives:

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
- `ReferencePicker`

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
| `ui/workbench.css` | 912 | Existing shared layer |

M20 should move reusable declarations into the shared layer only as consuming components migrate. File size alone is not a reason to move domain geometry.

## Search Families

### Global navigation

- `workbench/GlobalSearchDialog.tsx`
- Grouped scopes, ranking, arrow navigation, Enter, Escape, and Ctrl+K.
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
| Media/icon picker | Item icons, monster icons, Assets | Shared dialog/search/filter shell; domain media grid remains specialized |
| Quick preview | Eye actions for strings, sounds, targets, resources | `ReferencePreview` using the same renderer registry as the picker |
| Persistent inspector | Assets, maps, combat, suite details | Shared inspector sections and command placement |

The first shared renderer types should be string, sound, picture/icon, item, monster, battle, treasure, map location, Action Point, and raw resource.

## Overlay Families

Providence currently has shared floating panels plus bespoke backdrops/dialogs for project lifecycle, draft changes, global search, asset import, battle repair, item icons, and monster icons. ISY-331 should define one focus, Escape, backdrop, sizing, scroll, and action-row contract before those dialogs are restyled.

## Baseline Findings

- The desktop and compact Extra Action Points captures preserve the same core workflow, but compact width truncates several status labels and reduces list/editor breathing room.
- The Complex Encounter desktop capture keeps all response groups in one scan row. At compact width, Typed Reply wraps below the other response groups and Result Scripts falls below the first viewport; the editor remains usable, but its scan order changes substantially.
- Direct tool captures prove populated base layouts. Floating pickers still need explicit open, filtered, selected, empty, and unresolved interaction hooks before their complete behavior can be compared visually.
- Search fields do not consistently expose a clear command, result count, loading state, or the same keyboard behavior.
- Several reference fields expose search, select, raw ID, preview, and navigation simultaneously even when only one authoring choice is primary.
- Eye actions are moving toward a consistent preview meaning, but their floating surfaces remain independently composed.
- Some overview lists still use fixed visible slices. Each occurrence must be classified as deliberate pagination/virtualization or replaced with a complete searchable/scrollable collection.
- Tool tabs, segmented modes, and combinable filters are not always visually distinct.

## First Implementation Slice

ISY-332 starts with the shared `SearchField`, now used by Complex Encounter response pickers and the action-code helper. It standardizes the clear action, result count, status line, accessible name, and input geometry while leaving domain result rows intact.

The next implemented layer is the typed `ReferencePicker`. `TargetPicker` now delegates its searchable selected/result presentation to that primitive while retaining Realmz signed-ID, sound, media, creation, and macro-flow behavior. Shared matching is term-based, unresolved values stay visible, and result lists are complete rather than sliced to an arbitrary count.

The next slice should define the pluggable `ReferencePreview` renderer registry and finish the Complex Encounter result-target pilot captures. Those targets exercise strings, battles, treasure, scripts, sounds, previews, and selection without changing the underlying record writer.
