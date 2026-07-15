import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ScriptTargetOption } from "../../components/RealmzTargetPicker";
import type { Project } from "../../types";
import { ReferenceIdField, nextAuthorableTargetId, rawReferenceTargetOption } from "./ReferenceIdField";

describe("next authorable target ID", () => {
  it("fills the first positive gap in the selected record family", () => {
    const project = { messages: [{ id: 1 }, { id: 3 }, { id: 4 }] } as unknown as Project;

    expect(nextAuthorableTargetId(project, "message")).toBe(2);
  });

  it("keeps record-family allocation independent", () => {
    const project = {
      simpleEncounters: [{ id: 1 }, { id: 2 }],
      complexEncounters: [{ id: 2 }]
    } as unknown as Project;

    expect(nextAuthorableTargetId(project, "simpleEncounter")).toBe(3);
    expect(nextAuthorableTargetId(project, "complexEncounter")).toBe(1);
  });
});

describe("raw reference target options", () => {
  const messageOption: ScriptTargetOption = {
    key: "message:12",
    value: 12,
    label: "String 12",
    detail: "A warning message"
  };

  it("keeps signed target behavior available for known records", () => {
    const option = rawReferenceTargetOption("-12", 1, "Message", [messageOption]);

    expect(option).toMatchObject({ value: -12, label: "String 12 | no wait" });
  });

  it("does not duplicate an ordinary known target", () => {
    expect(rawReferenceTargetOption("12", 1, "Message", [messageOption])).toBeNull();
  });

  it("offers unresolved numeric values explicitly", () => {
    expect(rawReferenceTargetOption("99", 1, "Message", [messageOption])).toMatchObject({
      value: 99,
      label: "Use raw message value 99",
      detail: "No decoded target record found."
    });
  });
});

describe("ReferenceIdField", () => {
  it("renders full-size target references through the shared picker", () => {
    const project = {
      messages: [{ id: 12, text: "A warning message", authored: true }],
      triggers: []
    } as unknown as Project;
    const html = renderToStaticMarkup(createElement(ReferenceIdField, {
      project,
      label: "Before String",
      emptyLabel: "No before string",
      opcode: 1,
      value: 12,
      onCommit: () => undefined
    }));

    expect(html).toContain("workbench-reference-field");
    expect(html).toContain('aria-label="Search Before String"');
    expect(html).toContain("String 12");
    expect(html).not.toContain("script-reference-results");
  });
});
