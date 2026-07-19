import { TutorialTip } from "../../components/TutorialTip";
import type {
  LibraryCatalog,
  Project,
  ProjectCommand,
  SelectedEntity
} from "../../types";
import { CollapsibleSection } from "../../ui";
import { EncounterRecordPicker } from "./EncounterRecordPicker";
import { ItemIdField } from "./ItemIdField";

const TIMED_SCHEDULE_HELP =
  "The midnight schedule controls when this record is considered. Day and Increment define timing, Percent gates execution, and Extra AP To Activate is the macro Realmz runs.";
const TIMED_LOCATION_HELP =
  "Location gates restrict the timed encounter to any map, land, or dungeon, then optionally to level, random rectangle, X, and Y.";
const TIMED_EXTRA_HELP =
  "Data TD3 has nine signed-number slots after the confirmed schedule, macro, item, quest, and location fields. Realmz runtime evidence currently names only the first slot as the location kind. Providence preserves the remaining values but keeps them locked until a real authoring meaning is proven.";

export function TimedEncounterShell({
  project,
  catalog,
  id,
  record,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  id: number;
  record: Project["timedEncounters"][number];
  onSelectEntity?: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const update = (changes: Extract<ProjectCommand, { kind: "updateTimedEncounterRecord" }>["changes"]) => {
    onApplyCommand?.({ kind: "updateTimedEncounterRecord", label: "Update time encounter", id, changes });
  };
  const setLocationKind = (locationKind: Project["timedEncounters"][number]["locationKind"]) => {
    update({ locationKind });
  };
  const eligibilitySummary = timedEncounterEligibilitySummary(record);
  const reservedTimedValues = Array.from({ length: 9 }, (_, index) => record.reservedWords?.[index] ?? 0);
  const reservedNonZeroCount = reservedTimedValues.filter((value) => value !== 0).length;
  return (
    <div className="timed-encounter-editor">
      <EncounterRecordPicker project={project} recordType="timedEncounter" id={id} onSelectEntity={onSelectEntity} className="encounter-record-picker-standalone" />
      <section className="timed-encounter-form">
        <header>
          <div>
            <TutorialTip title="Midnight Schedule" body={TIMED_SCHEDULE_HELP} side="below">
              <strong>Midnight Schedule</strong>
            </TutorialTip>
            <small>Checked at midnight; Day and Increment set to -1 keeps the record inactive until an Action Point activates it.</small>
          </div>
          <span>{record.percent}% chance</span>
        </header>
        <p className="timed-eligibility-summary">{eligibilitySummary}</p>
        <div className="timed-encounter-columns">
          <div className="timed-encounter-column">
            <TimedNumberRow label="Day" value={record.day} onCommit={(day) => update({ day })} />
            <TimedNumberRow label="Increment" value={record.increment} onCommit={(increment) => update({ increment })} />
            <TimedNumberRow label="% Chance" value={record.percent} onCommit={(percent) => update({ percent })} />
            <TimedNumberRow label="Extra AP To Activate" value={record.door} onCommit={(door) => update({ door })} />
            <ItemIdField project={project} catalog={catalog} label="Required Item" value={record.requiredItem} onCommit={(requiredItem) => update({ requiredItem })} compact />
            <TimedNumberRow label="Required Quest ID" value={record.requiredQuest} onCommit={(requiredQuest) => update({ requiredQuest })} />
          </div>
          <div className="timed-encounter-column">
            <label className="timed-form-row timed-location-row">
              <TutorialTip title="Timed Location Gate" body={TIMED_LOCATION_HELP} side="below">
                <span>Position Required</span>
              </TutorialTip>
              <select value={record.locationKind} onChange={(event) => setLocationKind(event.currentTarget.value as Project["timedEncounters"][number]["locationKind"])}>
                <option value="any">-1 No position</option>
                <option value="land">1 Land</option>
                <option value="dungeon">2 Dungeon</option>
              </select>
            </label>
            <TimedNumberRow label="Required Level" value={record.requiredLevel} onCommit={(requiredLevel) => update({ requiredLevel })} />
            <TimedNumberRow label="Required Rect" value={record.requiredRandomRect} onCommit={(requiredRandomRect) => update({ requiredRandomRect })} />
            <TimedNumberRow label="Required X" value={record.requiredX} onCommit={(requiredX) => update({ requiredX })} />
            <TimedNumberRow label="Required Y" value={record.requiredY} onCommit={(requiredY) => update({ requiredY })} />
          </div>
        </div>
      </section>
      <CollapsibleSection title="Compatibility Data" eyebrow="advanced" count={reservedNonZeroCount ? `${reservedNonZeroCount} preserved value${reservedNonZeroCount === 1 ? "" : "s"}` : "all zero"} density="compact" className="script-encounter-text-section timed-extra-section" defaultOpen={false}>
        <p className="script-encounter-text-note">
          <TutorialTip title="Reserved Time Encounter Fields" body={TIMED_EXTRA_HELP} side="below">
            <span>Preserved Data TD3 compatibility values. Providence keeps these on save/export, but they do not have confirmed authoring meaning.</span>
          </TutorialTip>
        </p>
        <div className="timed-compatibility-grid" aria-label="Read-only timed encounter compatibility values">
          {reservedTimedValues.map((value, index) => {
            const slot = index + 1;
            return (
              <div key={slot} className={`timed-compatibility-chip${value !== 0 ? " is-preserved" : ""}`}>
                <span>Reserved word {slot}</span>
                <strong>{value}</strong>
              </div>
            );
          })}
        </div>
      </CollapsibleSection>
    </div>
  );
}
function TimedNumberRow({
  label,
  value,
  readOnly = false,
  onCommit
}: {
  label: string;
  value: number;
  readOnly?: boolean;
  onCommit?: (value: number) => void;
}) {
  return (
    <label className="timed-form-row">
      <span>{label}</span>
      <input type="number" value={value} readOnly={readOnly} onChange={(event) => onCommit?.(Number(event.currentTarget.value))} />
    </label>
  );
}
export function locationKindValue(locationKind: Project["timedEncounters"][number]["locationKind"]) {
  if (locationKind === "land") return 1;
  if (locationKind === "dungeon") return 2;
  return -1;
}

export function timedEncounterEligibilitySummary(record: Project["timedEncounters"][number]) {
  const timing = record.day === -1 && record.increment === -1
    ? "Inactive until an Action Point activates it"
    : `checked at midnight starting day ${record.day}, increment ${record.increment}`;
  const location =
    record.locationKind === "land" ? `on land level ${record.requiredLevel}` :
    record.locationKind === "dungeon" ? `in dungeon level ${record.requiredLevel}` :
    "at any location";
  const gates: string[] = [];
  if (record.requiredItem > 0) gates.push(`requires item ${record.requiredItem}`);
  if (record.requiredQuest > 0) gates.push(`requires quest flag ${record.requiredQuest}`);
  if (record.requiredRandomRect > 0) gates.push(`inside random rectangle ${record.requiredRandomRect}`);
  if (record.requiredX > 0 || record.requiredY > 0) gates.push(`near ${record.requiredX},${record.requiredY}`);
  const runs = record.door > 0 ? `runs Extra Action Point ${record.door}` : "has no Extra Action Point target";
  return `${timing}; ${record.percent}% chance; ${location}${gates.length ? `; ${gates.join("; ")}` : ""}; ${runs}.`;
}
