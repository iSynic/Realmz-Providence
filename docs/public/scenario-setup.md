# Set up and keep a scenario project

Use **File → New Project** to choose the project name, location and available
template. **Open Project…** opens an existing portable project. Keep its complete
directory together when copying or backing it up; a renamed screenshot or an
exported runtime package is not a replacement for the editable project.

## Import Classic content

Open a project and choose **Import Scenario…**. Select the scenario source and
required application support, review the import inspection and confirm the
intended import. A source folder remains separate from the editable project.
Supported archives have their own inspection/materialization boundary.

After importing, check the scenario name, start, maps, messages, required media
and Issues. Imported suspicious or unsupported content can remain preserved
without being editable or executable. Read the particular finding before
changing it. A successful fallback rule profile does not establish the scenario
author's intended mechanics; retain unresolved rule choices explicitly.

## Save and make a copy

**Save** persists applied project changes. **Save Snapshot As…** creates an
independent project copy at a new destination. Confirm which copy is open before
continuing. Applying a form and saving a project are separate operations.

Undo and Redo concern applied project history. Unapplied typing belongs to its
workbench's draft. Resolve draft guards deliberately when changing documents,
opening a different project or closing the current one.

## Review an older imported project

In **Issues**, choose **Review imported content…** when an older import needs
correction. The review compares retained scenario content with the current
interpretation. Hover a row to read its current value and proposed correction.
Safe corrections are selected automatically. Authored conflicts stay unchanged
unless you explicitly select their replacement.

**Cancel** leaves the project unchanged. **Apply** records the reviewed correction
in project history; Save persists it. Undo and Redo can restore that correction
after reopening. If retained content is missing or the project changed during
review, follow the diagnostic and review again rather than guessing a replacement.

## Handle an interrupted operation

An explicit rejected write keeps the draft. An unconfirmed write may have
committed before its reply was lost. Follow the owning editor's **Check status**,
**Check original result**, recovery or reopen instruction. Do not repeatedly
apply the same operation. Keep any destination created by a failed Save As until
you have inspected whether the copy completed.

Exported [Classic and Rebuilt targets](validate-and-publish.md) are separate
deliverables. Their readiness and runtime behavior do not change the editable
project's snapshot version.
