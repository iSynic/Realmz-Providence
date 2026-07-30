import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  behaviorSourceNodeOptions,
  isBehaviorPreviewKind,
  normalizePreviewSessionStatus,
  PreviewProfileEditor,
  previewFixture,
  previewKindForRole,
  previewRoleForKind
} from "./ExportPanel";
import type { RemakeBehaviorDefinition, RemakePreviewProfile } from "../types";

describe("Realmz Remake role preview routing", () => {
  it("maps every contextual behavior role to a dedicated preview entry", () => {
    expect([
      previewKindForRole("encounter"),
      previewKindForRole("spell"),
      previewKindForRole("item"),
      previewKindForRole("monster-ai"),
      previewKindForRole("lifecycle"),
      previewKindForRole("rule-modifier")
    ]).toEqual([
      "encounter",
      "spell",
      "item",
      "monster",
      "lifecycle",
      "rule"
    ]);
  });

  it("round-trips every dedicated role entry and keeps generic behaviors", () => {
    for (const kind of [
      "encounter",
      "spell",
      "item",
      "monster",
      "lifecycle",
      "rule"
    ] as const) {
      expect(previewKindForRole(previewRoleForKind(kind))).toBe(kind);
      expect(isBehaviorPreviewKind(kind)).toBe(true);
    }
    expect(previewKindForRole("action")).toBe("behavior");
    expect(isBehaviorPreviewKind("behavior")).toBe(true);
    expect(isBehaviorPreviewKind("battle")).toBe(false);
  });

  it("offers friendly symbolic breakpoints for source and guided outline blocks", () => {
    const behavior = {
      tier: "safe",
      sourceMap: {
        schemaVersion: 1,
        nodes: {
          n1: { line: 3, column: 5 }
        }
      },
      ast: {
        kind: "function",
        body: [
          {
            kind: "operation",
            capability: "core.presentation.show-text",
            sourceNode: "n1"
          },
          {
            kind: "if",
            then: [{ kind: "assign", name: "paid" }],
            else: [{ kind: "return" }]
          }
        ]
      }
    } as unknown as RemakeBehaviorDefinition;

    expect(behaviorSourceNodeOptions(behavior)).toEqual([
      { value: "n1", label: "Line 3 · Show Text", line: 3 },
      { value: "guided/body/1", label: "If / Else", line: null },
      { value: "guided/body/1/then/0", label: "Set paid", line: null },
      { value: "guided/body/1/else/0", label: "Finish behavior", line: null }
    ]);
  });

  it("includes saved location and active watches in the preview fixture", () => {
    const profile = {
      id: "preview-one",
      name: "Deadline test",
      gold: 500,
      gems: 0,
      jewelry: 0,
      totalSeconds: 172800,
      rngSeed: 7,
      gameplayProfile: "core.classic",
      location: { levelType: "land", levelIndex: 2, x: 10, y: 6 },
      questFlags: [],
      party: [],
      watches: ["wealth.gold"],
      assertions: []
    } satisfies RemakePreviewProfile;

    expect(previewFixture(profile, ["wealth.gold", "location.x"])).toMatchObject({
      location: { levelType: "land", levelIndex: 2, x: 10, y: 6 },
      watches: ["wealth.gold", "location.x"]
    });
  });

  it("renders the test-profile controls in a normal Providence section", () => {
    const html = renderToStaticMarkup(
      createElement(PreviewProfileEditor, {
        profile: null,
        profiles: [],
        selectedId: "",
        onSelect: () => undefined,
        onCreate: () => undefined,
        onDelete: () => undefined,
        onChange: () => undefined
      })
    );

    expect(html).toContain('aria-label="Test profile"');
    expect(html).toContain("<strong>Test Profile</strong>");
    expect(html).toContain(">New Profile</button>");
    expect(html).not.toContain("<details");
  });

  it("normalizes backend-owned preview session status", () => {
    expect(normalizePreviewSessionStatus({
      running: true,
      sessionId: "preview-1",
      processId: 42
    })).toEqual({
      running: true,
      sessionId: "preview-1",
      processId: 42
    });
    expect(normalizePreviewSessionStatus({
      running: false,
      sessionId: "stale-preview",
      processId: 42
    })).toEqual({
      running: false,
      sessionId: "",
      processId: null
    });
    expect(normalizePreviewSessionStatus(null)).toEqual({
      running: false,
      sessionId: "",
      processId: null
    });
  });
});
