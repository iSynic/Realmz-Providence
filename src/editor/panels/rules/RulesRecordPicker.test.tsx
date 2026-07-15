import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RulesLayout } from "./RuleFields";
import { RulesRecordPicker, rulesRecordPickerOptions } from "./RulesRecordPicker";

describe("Rules record picker", () => {
  it("builds searchable options from IDs, labels, summaries, and status text", () => {
    const [option] = rulesRecordPickerOptions([{
      id: 12,
      label: "12: Ranger",
      detail: "move 2 | Scenario custom",
      searchText: "woodland missile"
    }]);

    expect(option.value).toBe(12);
    expect(option.searchText).toContain("12: Ranger");
    expect(option.searchText).toContain("Scenario custom");
    expect(option.searchText).toContain("woodland missile");
  });

  it("renders the shared compact reference trigger", () => {
    const html = renderToStaticMarkup(
      <RulesRecordPicker
        label="Race"
        help="Select a race record."
        options={rulesRecordPickerOptions([{ id: 0, label: "0: Human", detail: "Built-in Realmz" }])}
        value={0}
        placeholder="Search race # or name..."
        storageKey="test.rules.race"
        onChange={vi.fn()}
      />
    );

    expect(html).toContain("workbench-reference-compact-trigger");
    expect(html).toContain('aria-label="Search race records"');
    expect(html).toContain("0: Human");
  });

  it("replaces the RulesLayout native record dropdown", () => {
    const html = renderToStaticMarkup(
      <RulesLayout
        title="Race Editor"
        note="Browse races."
        records={[{ id: 0, name: "Human", hasScenarioVersion: false }]}
        fallbackEntityType="race"
        catalog={null}
        selectedId={0}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onClear={vi.fn()}
        maxRecords={1}
        labelFor={(record) => `${record.id}: ${record.name}`}
        summaryFor={() => "Built-in race"}
        fallbackLabelFor={(id) => `Race ${id}`}
        fallbackSummaryFor={() => "Shared race"}
        recordNoun="Race"
        showGoToField={false}
      >
        <div>Race details</div>
      </RulesLayout>
    );

    expect(html).toContain('aria-label="Search race records"');
    expect(html).not.toContain("<select");
  });
});
