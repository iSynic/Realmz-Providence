import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ModalDialog,
  ModalDialogActions,
  ModalDialogHeader,
  modalDialogShouldDismiss,
  modalDialogTabTarget
} from "./ModalDialog";

describe("ModalDialog", () => {
  it("renders a labelled blocking dialog surface", () => {
    const markup = renderToStaticMarkup(
      <ModalDialog ariaLabel="Confirm operation" surfaceTag="form">
        <button type="button">Cancel</button>
      </ModalDialog>
    );

    expect(markup).toContain('class="workbench-modal-backdrop"');
    expect(markup).toContain('class="workbench-modal-dialog"');
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-label="Confirm operation"');
  });

  it("passes specialized surface geometry through to the dialog", () => {
    const markup = renderToStaticMarkup(
      <ModalDialog ariaLabel="Movable reference" style={{ left: 24, width: 480 }}>
        <iframe title="Reference" />
      </ModalDialog>
    );

    expect(markup).toContain('style="left:24px;width:480px"');
    expect(markup).toContain('<iframe title="Reference"></iframe>');
  });

  it("provides stable header and action regions", () => {
    const markup = renderToStaticMarkup(
      <ModalDialog ariaLabelledBy="confirm-title">
        <ModalDialogHeader
          titleId="confirm-title"
          title="Confirm operation"
          description="Review the pending change."
          actions={<button type="button">Close</button>}
        />
        <ModalDialogActions>
          <button type="button">Cancel</button>
          <button type="button">Apply</button>
        </ModalDialogActions>
      </ModalDialog>
    );

    expect(markup).toContain('class="workbench-modal-header"');
    expect(markup).toContain('class="workbench-modal-header-actions"');
    expect(markup).toContain('class="workbench-modal-actions"');
    expect(markup).toContain('id="confirm-title"');
  });

  it("wraps tab focus at both ends", () => {
    expect(modalDialogTabTarget(2, 3, false)).toBe(0);
    expect(modalDialogTabTarget(0, 3, true)).toBe(2);
    expect(modalDialogTabTarget(1, 3, false)).toBeNull();
    expect(modalDialogTabTarget(-1, 3, false)).toBe(0);
    expect(modalDialogTabTarget(-1, 0, false)).toBeNull();
  });

  it("only dismisses enabled dialogs with an Escape handler", () => {
    expect(modalDialogShouldDismiss("Escape", true, true, false)).toBe(true);
    expect(modalDialogShouldDismiss("Escape", true, true, true)).toBe(false);
    expect(modalDialogShouldDismiss("Escape", false, true, false)).toBe(false);
    expect(modalDialogShouldDismiss("Enter", true, true, false)).toBe(false);
  });
});
