import { describe, expect, it } from "vitest";
import type { DivinityOpcodeHelpEntry } from "../../divinityOpcodeHelp";
import {
  codeHelperSectionsForEntry,
  formatCodeHelperEcodes,
  parseCodeHelperManualText,
  sliceCodeHelperManualText
} from "./EncounterResultCodeHelper";

describe("encounter result code helper manual parsing", () => {
  const combinedText = [
    "Code 54 Alter Time Encounter",
    "ID: Time encounter number",
    "Use: Changes a scheduled encounter.",
    "Code 58 Branch on Difficulty Level",
    "ID: Settings row",
    "Use: Branches based on difficulty.",
    "Options: 1 branch, 2 exit",
    "Note: Preserve the selected row."
  ].join("\n");

  it("isolates the requested opcode when a manual resource covers multiple codes", () => {
    const sliced = sliceCodeHelperManualText(combinedText, [58]);

    expect(sliced).toContain("Code 58 Branch on Difficulty Level");
    expect(sliced).not.toContain("Code 54 Alter Time Encounter");
    expect(parseCodeHelperManualText(combinedText, [58])).toEqual(new Map([
      ["ID", "Settings row"],
      ["Use", "Branches based on difficulty."],
      ["Options", "1 branch, 2 exit"],
      ["Note", "Preserve the selected row."]
    ]));
  });

  it("falls back to decoded fields while omitting empty manual sections", () => {
    const entry = {
      resourceId: 9000,
      title: "Example",
      codes: [900],
      idField: "Target record",
      use: "Runs the target.",
      options: "None listed",
      extraCodes: "None listed"
    } as DivinityOpcodeHelpEntry;

    expect(codeHelperSectionsForEntry(entry)).toEqual([
      { label: "ID Field", value: "Target record" },
      { label: "Use", value: "Runs the target." }
    ]);
  });

  it("formats numbered E-Code entries onto stable readable lines", () => {
    expect(formatCodeHelperEcodes("E-Code 1) Branch here\n1) First option\ncontinued detail\nE-Code 2) Exit"))
      .toBe("E-Code 1)\nBranch here\n1) First option\n   continued detail\n\nE-Code 2)\nExit");
  });
});
