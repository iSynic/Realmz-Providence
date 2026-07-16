import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SemanticRecord } from "../types";
import { filterSemanticRecords, RecordsPanel } from "./RecordsPanel";

const records: SemanticRecord[] = [
  {
    id: "record:data-ed:4",
    source: "source:file:Data ED",
    type: "item",
    label: "Beacon Lens",
    editState: "editable",
    byteRange: { start: 4096, length: 128, endExclusive: 4224 },
    confidence: "source-backed",
    summary: { name: "Beacon Lens", charges: 3 }
  },
  {
    id: "record:data-dd:9",
    source: "source:file:Data DD",
    type: "action-point",
    label: "Tower Door",
    editState: "blocked",
    byteRange: null,
    confidence: "inferred",
    summary: { actionCount: 4, preview: "Teleport to Bell Depths" }
  }
];

describe("RecordsPanel", () => {
  it("searches record identity, source metadata, byte ranges, and summaries", () => {
    expect(filterSemanticRecords(records, "beacon lens")).toEqual([records[0]]);
    expect(filterSemanticRecords(records, "data dd")).toEqual([records[1]]);
    expect(filterSemanticRecords(records, "4096")).toEqual([records[0]]);
    expect(filterSemanticRecords(records, "teleport to bell depths")).toEqual([records[1]]);
    expect(filterSemanticRecords(records, "blocked")).toEqual([records[1]]);
    expect(filterSemanticRecords(records, "missing value")).toEqual([]);
  });

  it("keeps the complete catalog when the query is blank", () => {
    expect(filterSemanticRecords(records, "   ")).toBe(records);
  });

  it("uses shared search and empty-state presentation before a project is loaded", () => {
    const markup = renderToStaticMarkup(
      <RecordsPanel project={null} selectedEntity={null} onSelectEntity={() => undefined} />
    );

    expect(markup).toContain("workbench-search-field");
    expect(markup).toContain("workbench-empty-state");
    expect(markup).toContain("No project loaded");
  });
});
