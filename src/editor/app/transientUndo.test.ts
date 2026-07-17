import { describe, expect, it, vi } from "vitest";
import { invokePreferredUndo } from "./transientUndo";

describe("invokePreferredUndo", () => {
  it("uses the active transient undo before project history", () => {
    const undoMaskStroke = vi.fn();
    const undoProjectChange = vi.fn();

    invokePreferredUndo({ label: "Smart Brush mask stroke", undo: undoMaskStroke }, undoProjectChange);

    expect(undoMaskStroke).toHaveBeenCalledOnce();
    expect(undoProjectChange).not.toHaveBeenCalled();
  });

  it("falls back to project history without a transient undo", () => {
    const undoProjectChange = vi.fn();

    invokePreferredUndo(null, undoProjectChange);

    expect(undoProjectChange).toHaveBeenCalledOnce();
  });
});
