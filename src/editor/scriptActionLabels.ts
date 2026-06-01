import { parameterLabelsForOpcode } from "./opcodeCrosswalk";
import { normalizeStepOpcode } from "./realmzActions";

const PARAMETER_LABEL_OVERRIDES: Record<number, Record<number, string>> = {
  2: {
    0: "Battle Number",
    1: "Battle High",
    2: "Sound / Revive Action",
    3: "Before Message",
    4: "Reward / Revive Mode"
  },
  19: {
    0: "First Message",
    1: "Last Message"
  },
  20: {
    0: "Land Level",
    1: "X Coordinate",
    2: "Y Coordinate",
    3: "Sound",
    4: "Message"
  },
  23: {
    0: "Land Level",
    1: "Rectangle",
    2: "Chance Scale",
    3: "Battle Low",
    4: "Battle High"
  },
  45: {
    0: "Land Level",
    1: "X Coordinate",
    2: "Y Coordinate",
    3: "Sound",
    4: "Message"
  },
  48: {
    0: "Battle Low",
    1: "Battle High",
    2: "Sound",
    3: "Message",
    4: "Treasure On Victory"
  },
  56: {
    0: "Battle Low",
    1: "Battle High",
    2: "Flee Branch",
    3: "Sound",
    4: "Message"
  },
  92: {
    0: "Level",
    1: "Rectangle",
    2: "Map Kind",
    3: "Encounter Percent Delta",
    4: "Shape Mode"
  },
  106: {
    0: "Light/Dark State",
    1: "Stop If Already Set"
  },
  107: {
    0: "Battle Low",
    1: "Battle High",
    2: "Sound",
    3: "Message",
    4: "Flee Branch"
  },
  122: {
    0: "Message",
    1: "Sound"
  }
};

export function scriptParameterLabelForOpcode(opcode: number, index: number, fallback: string) {
  const normalized = normalizeStepOpcode(opcode);
  return PARAMETER_LABEL_OVERRIDES[normalized]?.[index]
    ?? parameterLabelsForOpcode(opcode).find((label) => label.index === index)?.label
    ?? humanizeParameterName(fallback);
}

function humanizeParameterName(name: string) {
  return String(name || "setting")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\bmessage\b/i, "Message")
    .replace(/\bmacro\b/i, "Extra Action Point")
    .replace(/\bid\b/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}
