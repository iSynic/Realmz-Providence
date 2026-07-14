import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReferencePicker, filterReferencePickerOptions, type ReferencePickerOption } from "./ReferencePicker";

describe("ReferencePicker", () => {
  const options: ReferencePickerOption<number>[] = [
    { key: "string:12", value: 12, label: "String 12", detail: "The drowned bell tolls.", searchText: "12 string drowned bell scenario" },
    { key: "string:28", value: 28, label: "String 28", detail: "A salt-crusted key.", searchText: "28 string salt crusted key imported" }
  ];

  it("matches every query term across the shared searchable text", () => {
    expect(filterReferencePickerOptions(options, "bell scenario").map((option) => option.value)).toEqual([12]);
    expect(filterReferencePickerOptions(options, "28 key").map((option) => option.value)).toEqual([28]);
    expect(filterReferencePickerOptions(options, "bell key")).toEqual([]);
  });

  it("renders complete results instead of applying an arbitrary visible cap", () => {
    const completeOptions = Array.from({ length: 180 }, (_, index): ReferencePickerOption<number> => ({
      key: `target:${index}`,
      value: index,
      label: `Target ${index}`,
      searchText: `target ${index}`
    }));
    const markup = renderToStaticMarkup(
      <ReferencePicker
        label="Target"
        ariaLabel="Search targets"
        query=""
        onQueryChange={() => undefined}
        options={completeOptions}
        value={0}
        onSelect={() => undefined}
        current={{ label: "Target 0" }}
      />
    );

    expect(markup).toContain("Target 179");
    expect(markup.match(/data-reference-option=/g)).toHaveLength(180);
  });

  it("exposes unresolved current values without hiding available replacements", () => {
    const markup = renderToStaticMarkup(
      <ReferencePicker
        label="String Target"
        ariaLabel="Search string targets"
        query="bell"
        onQueryChange={() => undefined}
        options={options}
        value={99}
        onSelect={() => undefined}
        current={{ label: "String 99", detail: "This target does not exist yet.", state: "unresolved" }}
      />
    );

    expect(markup).toContain("is-unresolved");
    expect(markup).toContain("This target does not exist yet.");
    expect(markup).toContain("1 match");
  });
});
