# Providence UI Foundations

This contract preserves Providence's compact, work-focused visual language while giving shared components one vocabulary. Domain geometry stays local: battle boards, map canvases, fixed Realmz record grids, and media atlases should consume shared tokens without being forced into generic cards.

## Density And Spacing

Normal density uses a 38px section header, 10px body padding, and 8px control gaps. Compact density uses a 32px section header, 8px body padding, and 4-6px gaps. Use the `--ui-space-*` scale or `WorkbenchStack` / `WorkbenchCluster`; do not invent fractional spacing for migrated shared controls.

Text size does not scale with viewport width. Labels are 9px uppercase metadata, secondary metadata is 10px, working copy is 11px, compact titles are 12px, and local headings are 14px. Tool titles and true page headings remain owned by the shell.

## Color And State

Shared surfaces use canvas, surface, raised, inset, and hover tokens. Neutral, info, success, warning, and danger each have foreground, border, and surface roles. State must not rely on color alone: pair it with an icon, label, border style, or explicit status text.

Selected means the current authoring target. Hover means an available action. Unresolved means an imported value Providence preserves but cannot decode. Disabled means unavailable and must not be used as a substitute for read-only presentation.

## Focus And Keyboard

Interactive shared controls use `:focus-visible` with `--ui-focus-color` and `--ui-focus-ring`. Enter activates the focused primary result, Escape clears a populated search before closing its containing picker, and arrow keys are reserved for controls that expose a documented list/grid navigation model. Never install a global shortcut while focus is in an input, textarea, select, or content-editable region.

## Dimensions And Layers

Use the control-height tokens for repeated controls. Fixed-format boards, grids, palettes, and icon previews must declare stable tracks or aspect ratios so labels and state changes do not shift geometry.

Layer order is explicit: base, sticky, tooltip, popover, floating workbench, then modal. New arbitrary z-index values are not part of the contract. A floating workbench is movable, modeless, and may coexist with authoring. A modal blocks the workflow and owns a backdrop, initial focus, Escape, and focus return.

## Scroll Ownership

Every pane has one vertical scroll owner. `ScrollArea` owns large collections; a panel body may own scrolling only when the complete body is the viewport. Nested vertical scrollers require a domain-specific reason. Collections report the full match count, and any rendering cap uses `IncrementalListFooter` with an explicit visible count and Show More command.

Search metadata must not change the alignment of neighboring controls. In a horizontal control row, put counts and status in the pane header or reserve an equal metadata row for every control. Shared search inputs own their icon and clear-button padding; domain input rules must not override that internal spacing.

## Shared Component Contracts

| Concern | Shared contract |
| --- | --- |
| Layout | `WorkbenchStack`, `WorkbenchCluster`, `WorkbenchActionBar` |
| Navigation | `WorkbenchTabs` for mutually exclusive local views |
| Modes | `SegmentedControl` for mutually exclusive actions, sources, or filters within one view |
| Sections | `PanelHeader` for unframed pane titles; `PanelSection`, `CollapsibleSection` for framed sections |
| Collections | `SearchField`, `ScrollArea`, `EntityRow`, `IncrementalListFooter` |
| References | `ReferenceField`, `ReferencePicker`, `ReferencePreview` |
| Overlay | `FloatingWorkbenchPanel` for modeless authoring; `ModalDialog` for blocking workflows |
| Feedback | `EmptyState`, `IssueGroup`, `ValidationGate`, status tones |

Shared components own interaction structure and shared styling. Domain adapters own encoding, labels, preview data, mutation commands, and specialized geometry. Migrate a surface only when its focused behavior, constrained-width layout, and obsolete CSS can be verified together.

`ModalDialog` owns the modal layer, labelled dialog semantics, initial focus, Tab containment, Escape and optional backdrop dismissal, disabled dismissal during work, and focus restoration. Domain dialogs retain their size, body layout, destructive-action ordering, and submit behavior.
