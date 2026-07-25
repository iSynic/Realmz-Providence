import { describe, expect, it } from "vitest";
import {
  EDCD_OPTION_DOMAINS,
  documentedEdcdOptionsForField
} from "./edcdOptionDomains";

describe("documented ECODE option domains", () => {
  it("provides the same finite choices to Action Points and encounter result settings", () => {
    expect(documentedEdcdOptionsForField(22, "mode")).toEqual([
      { value: 1, label: "Drop item" },
      { value: 2, label: "Alter charges" },
      { value: 3, label: "Replace item" }
    ]);
    expect(documentedEdcdOptionsForField(126, "repeatMode")).toHaveLength(3);
    expect(documentedEdcdOptionsForField(-23, "isDungeon")).toBeNull();
  });

  it("has unique opcode and field contracts with unique stored values", () => {
    const keys = EDCD_OPTION_DOMAINS.map((domain) => `${domain.opcode}:${domain.field.toLowerCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const domain of EDCD_OPTION_DOMAINS) {
      expect(domain.options.length).toBeGreaterThan(1);
      expect(new Set(domain.options.map((option) => option.value)).size).toBe(domain.options.length);
      expect(domain.options.every((option) => option.label.trim().length > 0)).toBe(true);
    }
  });
});
