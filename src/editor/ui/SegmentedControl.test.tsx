import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SegmentedControl, segmentedControlKeyboardTarget, type SegmentedControlOption } from "./SegmentedControl";

const options: SegmentedControlOption<"first" | "second" | "third">[] = [
  { value: "first", label: "First" },
  { value: "second", label: "Second", disabled: true },
  { value: "third", label: "Third", meta: 3 }
];

describe("SegmentedControl", () => {
  it("renders a labelled pressed-button group with roving focus", () => {
    const markup = renderToStaticMarkup(
      <SegmentedControl
        ariaLabel="Modes"
        value="first"
        options={options}
        onChange={() => undefined}
      />
    );

    expect(markup).toContain('role="group"');
    expect(markup).toContain('aria-label="Modes"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('disabled=""');
  });

  it("moves across enabled options and supports Home and End", () => {
    expect(segmentedControlKeyboardTarget(options, "first", "ArrowRight")).toBe("third");
    expect(segmentedControlKeyboardTarget(options, "first", "ArrowLeft")).toBe("third");
    expect(segmentedControlKeyboardTarget(options, "third", "Home")).toBe("first");
    expect(segmentedControlKeyboardTarget(options, "first", "End")).toBe("third");
    expect(segmentedControlKeyboardTarget(options, "first", "Enter")).toBeNull();
  });
});
