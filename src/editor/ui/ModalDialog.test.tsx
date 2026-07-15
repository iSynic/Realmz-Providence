import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModalDialog, modalDialogShouldDismiss, modalDialogTabTarget } from "./ModalDialog";

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
