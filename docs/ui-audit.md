# Providence UI Audit

This document defines the evidence and migration protocol for M20. The machine-readable tool inventory lives in `docs/ui-audit-matrix.json`; `npm run check:ui-audit` verifies that it remains aligned with the registered Providence tools.

## Scope

M20 standardizes the interaction system around Providence tools without flattening domain-specific authoring surfaces. Map canvases, battle grids, sprite/media geometry, and unusual fixed-record layouts remain owned by their domains. Shared browser, editor, search, picker, preview, dialog, inspector, and feedback behavior belongs in `src/editor/ui`.

The audit covers both Project and Library workbenches. A tool registered for both workbenches must record both contexts even when the initial visual baseline uses only one.

## Search And Preview Vocabulary

| Pattern | Purpose | Required behavior |
| --- | --- | --- |
| Local filter | Narrow the collection already visible in a tool | Inline query, explicit combinable filters, clear result count, no navigation |
| Reference picker | Choose a linked record or resource | Searchable list, current selection, candidate preview, Clear and Choose commands |
| Quick preview | Inspect the current reference without editing it | Eye action, non-mutating floating surface, stable dimensions, no forced navigation |
| Global search | Navigate across Providence | Grouped scopes, keyboard navigation, explicit destination |
| Technical query | Inspect IDs, raw records, resources, or diagnostics | Advanced context, provenance allowed, no pressure on the primary authoring path |

Preview and navigation are separate actions. The preview renderer should be reusable inside a picker, an inspector, or a floating preview without changing the referenced record.

## Per-Tool Audit

Each tool audit records:

1. Standard desktop and constrained desktop screenshots.
2. Default, populated, selected, empty, warning, validation, and overlay states where applicable.
3. The primary browse, select, edit, preview, apply, and navigate workflow.
4. Search, picker, preview, dialog, toolbar, inspector, and scroll ownership.
5. CSS owners and selectors that represent reusable structure rather than domain geometry.
6. Scores from 1 to 5 for hierarchy, density, task efficiency, consistency, keyboard use, accessibility, overflow, large-data behavior, and state clarity.
7. Findings classified as `ux-defect`, `consolidation`, `primitive-gap`, `domain-exception`, or `polish`.
8. A target layout, shared-component dependencies, migration boundary, and regression evidence.

## Capture States

The deterministic capture harness accepts the existing manual gallery presets and M20 audit targets:

```powershell
npm run docs:capture-gallery -- --capture scripts
npm run docs:capture-ui-audit -- --capture scripts.macros --viewport desktop
npm run docs:capture-ui-audit -- --capture scripts.macros --viewport compact
npm run docs:capture-ui-audit -- --capture encounters.complex --state result-target-open --viewport desktop
npm run docs:capture-ui-audit -- --capture encounters.complex --state result-target-filtered --viewport compact
```

Audit captures are written under `tmp/ui-audit/captures` by default. They are working evidence and are not committed automatically. Curated documentation images remain under `public/manual/gallery`.

The matrix may declare named interaction states as ordered `click`, `fill`, and `wait` steps. `base` remains implicit. This keeps floating picker, modal, filtered, empty, and unresolved evidence deterministic and reviewable without adding capture-only behavior to production components.

The coverage matrix deliberately distinguishes:

- `ready`: the harness can deterministically open the intended tool surface.
- `interaction-hook`: the tool shares a larger surface and still needs a deterministic submode, selection, popover, or modal activation hook.
- `covered`: a current curated gallery image provides an initial populated baseline.
- `planned`: the baseline still needs capture or review.

## Migration Rules

- Consolidate behavior before deleting old CSS.
- Migrate one vertical workflow at a time and preserve its project commands and stored data.
- Keep large collections complete; use scrolling, search, pagination, or virtualization instead of arbitrary truncation.
- Use toggles or checkboxes for combinable filters and tabs only for mutually exclusive views.
- Keep focus, Escape, Enter, arrow-key, scroll, and disabled-state behavior explicit.
- Do not move raw IDs or provenance into the primary authoring path merely to make components uniform.
- Remove selectors only after the migrated surface passes typecheck, focused tests, standard and constrained captures, and interaction smoke coverage.

## Initial Sequence

1. ISY-330 establishes the audit matrix and deterministic capture coverage.
2. ISY-331 defines foundations and stable component contracts.
3. ISY-332 unifies local search, reference selection, and preview rendering.
4. Domain migration issues ISY-333 through ISY-338 apply those contracts.
5. ISY-339 adds accessibility, visual regression, and CSS retirement gates.
