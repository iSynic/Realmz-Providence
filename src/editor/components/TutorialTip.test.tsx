import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TutorialTip } from "./TutorialTip";

describe("TutorialTip", () => {
  it("keeps static explanation targets keyboard reachable", () => {
    const markup = renderToStaticMarkup(
      <TutorialTip title="Status" body="Explains the current status.">
        <span>Ready</span>
      </TutorialTip>
    );

    expect(markup).toContain('class="tutorial-tip tutorial-tip-right" tabindex="0"');
  });

  it("does not add a second tab stop around an interactive child", () => {
    const markup = renderToStaticMarkup(
      <TutorialTip title="Open" body="Opens the project." focusable={false}>
        <button type="button">Open</button>
      </TutorialTip>
    );

    expect(markup).toContain('<button type="button">Open</button>');
    expect(markup).not.toContain('tabindex="0"');
  });
});
