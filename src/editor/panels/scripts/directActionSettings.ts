import {
  targetOptionForOpcodeValue,
  targetPickerConfig
} from "../../components/RealmzTargetPicker";
import directActionSource from "../../directActionOptionDomains.json";
import { divinityHelpForOpcode } from "../../divinityOpcodeHelp";
import { normalizeStepOpcode } from "../../realmzActions";
import type { LibraryCatalog, Project } from "../../types";
import { scriptActionDefinitionFor } from "./scriptActionCatalog";

export type DirectActionChoice = {
  value: number;
  label: string;
  description: string;
};

export type DirectActionSignedMode = {
  positiveLabel: string;
  negativeLabel: string;
  help: string;
};

type DirectActionSettingsBase = {
  opcode: number;
  label: string;
  help: string;
  signedMode?: DirectActionSignedMode;
};

export type DirectActionSettings =
  | (DirectActionSettingsBase & { kind: "none" })
  | (DirectActionSettingsBase & { kind: "target" })
  | (DirectActionSettingsBase & { kind: "choice"; options: DirectActionChoice[] })
  | (DirectActionSettingsBase & {
      kind: "number";
      min?: number;
      max?: number;
      suffix?: string;
    });

type DomainSource = {
  domains: Array<{
    opcode: number;
    label: string;
    help: string;
    options: DirectActionChoice[];
  }>;
  numericGuidance: Array<{
    opcode: number;
    label: string;
    help: string;
    min?: number;
    max?: number;
    suffix?: string;
  }>;
  signedModes: Array<{
    opcode: number;
    positiveLabel: string;
    negativeLabel: string;
    help: string;
  }>;
};

const source = directActionSource as DomainSource;
const choicesByOpcode = new Map(source.domains.map((domain) => [domain.opcode, domain]));
const numericByOpcode = new Map(source.numericGuidance.map((domain) => [domain.opcode, domain]));
const signedModesByOpcode = new Map(source.signedModes.map((mode) => [mode.opcode, mode]));

export function directActionSettingsFor(rawCode: number): DirectActionSettings {
  const opcode = normalizeStepOpcode(rawCode);
  const definition = scriptActionDefinitionFor(rawCode);
  const signedMode = signedModesByOpcode.get(opcode);
  if (definition.formKind === "step-only") {
    return {
      kind: "none",
      opcode,
      label: "No settings",
      help: `${definition.label} does not read the ID field.`
    };
  }
  const picker = targetPickerConfig(opcode);
  if (picker) {
    return {
      kind: "target",
      opcode,
      label: picker.label,
      help: picker.hint,
      signedMode
    };
  }
  const choice = choicesByOpcode.get(opcode);
  if (choice) {
    return {
      kind: "choice",
      opcode,
      label: choice.label,
      help: choice.help,
      options: choice.options,
      signedMode
    };
  }
  const numeric = numericByOpcode.get(opcode);
  if (numeric) {
    return {
      kind: "number",
      opcode,
      label: numeric.label,
      help: numeric.help,
      min: numeric.min,
      max: numeric.max,
      suffix: numeric.suffix,
      signedMode
    };
  }
  const manualHelp = divinityHelpForOpcode(opcode);
  const documentedLabel = documentedIdField(manualHelp?.idField);
  return {
    kind: "number",
    opcode,
    label: documentedLabel ?? definition.target?.label ?? "Action value",
    help: documentedLabel
      ? `${asSentence(documentedLabel)} ${definition.description}`
      : definition.target?.help ?? definition.description,
    signedMode
  };
}

export function defaultDirectActionValue(rawCode: number) {
  const definition = scriptActionDefinitionFor(rawCode);
  const settings = directActionSettingsFor(rawCode);
  const defaultValue = definition.defaultDraft.id;
  if (settings.kind !== "choice") return defaultValue;
  if (settings.options.some((option) => option.value === defaultValue)) return defaultValue;
  return settings.options[0]?.value ?? defaultValue;
}

export function directActionStoredValue(magnitude: number, negativeMode: boolean) {
  const normalizedMagnitude = Math.abs(Math.trunc(Number.isFinite(magnitude) ? magnitude : 0));
  return negativeMode && normalizedMagnitude !== 0 ? -normalizedMagnitude : normalizedMagnitude;
}

export function directActionSummary(
  project: Project,
  catalog: LibraryCatalog | null | undefined,
  rawCode: number,
  value: number
) {
  const settings = directActionSettingsFor(rawCode);
  if (settings.kind === "none") {
    return value === 0 ? "No settings" : `No settings · preserved ID ${value}`;
  }
  const mode = settings.signedMode
    ? value < 0 ? settings.signedMode.negativeLabel : settings.signedMode.positiveLabel
    : "";
  if (settings.kind === "target") {
    const selected = targetOptionForOpcodeValue(project, rawCode, value, catalog);
    const target = selected?.label
      ?? (Math.abs(value) === 0 ? `No ${settings.label.toLowerCase()} selected` : `${settings.label} ${Math.abs(value)}`);
    return [target, mode].filter(Boolean).join(" · ");
  }
  if (settings.kind === "choice") {
    return settings.options.find((option) => option.value === value)?.label ?? `Imported value ${value}`;
  }
  const magnitude = settings.signedMode ? Math.abs(value) : value;
  const quantity = `${magnitude}${settings.suffix ?? ""}`;
  return [quantity, mode].filter(Boolean).join(" · ");
}

function documentedIdField(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  if (!normalized || /^(none|n\/a|not specified)$/i.test(normalized)) return null;
  return normalized;
}

function asSentence(value: string) {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}
