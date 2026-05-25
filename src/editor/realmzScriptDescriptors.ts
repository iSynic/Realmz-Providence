import { ACTION_OPTIONS, actionOptionFor, isDispatcherNoopOpcode, normalizeStepOpcode } from "./realmzActions";
import { RealmzStepDescriptor } from "./types";
import { targetPickerConfig } from "./components/RealmzTargetPicker";

export const REALMZ_SCRIPT_STEP_DESCRIPTORS: RealmzStepDescriptor[] = ACTION_OPTIONS.map((option) => {
  const target = targetPickerConfig(option.code);
  return {
    id: `opcode:${option.code}`,
    opcode: option.code,
    label: option.shortLabel,
    category: option.category,
    summary: option.description,
    edcdShape: option.edcdShape,
    targetType: target?.recordType,
    editable: true,
    compatibility: option.code === 0 ? "realmz-writable" : target?.recordType ? "realmz-writable" : "needs-manual-verification"
  };
});

export function realmzScriptStepDescriptorFor(rawCode: number): RealmzStepDescriptor {
  const option = actionOptionFor(rawCode);
  const target = targetPickerConfig(rawCode);
  const normalized = normalizeStepOpcode(rawCode);
  return {
    id: `opcode:${normalized}`,
    opcode: normalized,
    label: option.shortLabel,
    category: option.category,
    summary: option.description,
    edcdShape: option.edcdShape,
    targetType: target?.recordType,
    editable: !isDispatcherNoopOpcode(rawCode),
    compatibility: isDispatcherNoopOpcode(rawCode)
      ? "dispatcher-noop"
      : target?.recordType || option.edcdShape || normalized === 0
        ? "realmz-writable"
        : "needs-manual-verification"
  };
}
