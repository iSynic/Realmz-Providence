import { useMemo, type CSSProperties } from "react";
import { TutorialTip } from "../../components/TutorialTip";
import { fastplotTileId } from "../../resourceIds";
import {
  numericReferenceQuery,
  ReferenceField,
  ReferencePreview,
  type ReferencePickerOption
} from "../../ui";
import "./RulesPresentationFields.css";

const MAX_QUEUE_ICON_VALUE = 200;

export function rulesQueueIconOptions(atlasUrl: string | null): ReferencePickerOption<number>[] {
  return Array.from({ length: MAX_QUEUE_ICON_VALUE + 1 }, (_, value) => {
    const tileId = fastplotTileId(value);
    const preview = (
      <QueueIconSwatch
        atlasUrl={atlasUrl}
        value={value}
        blank={value === 0}
        unresolved={value > 0 && !atlasUrl}
      />
    );
    return {
      key: `rules-queue-icon:${value}`,
      value,
      label: value === 0 ? "No Queue Icon" : `Queue Icon ${value}`,
      detail: tileId == null ? "Stored value 0 | no queue icon" : `Stored value ${value} | combat tile ${tileId}`,
      searchText: `${value} ${tileId ?? ""} ${value === 0 ? "none blank no queue icon" : `queue icon combat tile ${tileId}`}`,
      preview: {
        kind: "custom" as const,
        key: `rules-queue-icon-preview:${value}`,
        title: value === 0 ? "No Queue Icon" : `Queue Icon ${value}`,
        content: preview,
        state: value === 0 || atlasUrl ? "resolved" as const : "unavailable" as const
      }
    };
  });
}

export function rulesQueueIconValueForQuery(query: string) {
  const explicitStoredValue = /^\s*(?:stored|value)\s*:?\s*(-?\d+)\s*$/i.exec(query);
  if (explicitStoredValue) return Number(explicitStoredValue[1]);
  const explicitTileId = /^\s*(?:combat\s+)?tile\s*:?\s*(\d+)\s*$/i.exec(query);
  if (explicitTileId) {
    const tileId = Number(explicitTileId[1]);
    return tileId >= 201 && tileId <= 400 ? tileId - 200 : tileId;
  }
  const queryNumber = numericReferenceQuery(query);
  if (queryNumber == null) return null;
  if (queryNumber >= 201 && queryNumber <= 400) return queryNumber - 200;
  return queryNumber;
}

export function rulesQueueIconRawOption(
  query: string,
  options: ReferencePickerOption<number>[]
): ReferencePickerOption<number> | null {
  const value = rulesQueueIconValueForQuery(query);
  if (value == null || options.some((option) => option.value === value)) return null;
  const tileId = fastplotTileId(value);
  return {
    key: `rules-queue-icon:raw:${value}`,
    value,
    label: `Queue Icon ${value}`,
    detail: tileId == null ? "Raw stored queue-icon value" : `Raw stored value | combat tile ${tileId}`,
    searchText: `${value} ${tileId ?? ""} stored value byte raw unresolved queue icon`
  };
}

export function RulesQueueIconField({
  label,
  value,
  atlasUrl,
  onCommit,
  disabled = false,
  help
}: {
  label: string;
  value: number;
  atlasUrl: string | null;
  onCommit: (value: number) => void;
  disabled?: boolean;
  help?: string;
}) {
  const options = useMemo(() => rulesQueueIconOptions(atlasUrl), [atlasUrl]);
  const selectedOption = options.find((option) => option.value === value) ?? null;
  const tileId = fastplotTileId(value);
  const current = selectedOption ? {
    label: selectedOption.label,
    detail: selectedOption.detail,
    state: value === 0 ? "empty" as const : "resolved" as const
  } : {
    label: `Queue Icon ${value}`,
    detail: tileId == null
      ? "This raw stored queue-icon value is unresolved."
      : `Combat tile ${tileId} falls outside the known queue-icon atlas range.`,
    state: "unresolved" as const
  };
  const unresolved = value > MAX_QUEUE_ICON_VALUE || value < 0 || (value > 0 && !atlasUrl);

  return (
    <div className="scenario-field rules-presentation-reference-field">
      {help ? (
        <TutorialTip title={label} body={help} side="below">
          <span className="rules-presentation-reference-label">{label}</span>
        </TutorialTip>
      ) : <span className="rules-presentation-reference-label">{label}</span>}
      <div className="rules-presentation-reference-control">
        <QueueIconSwatch atlasUrl={atlasUrl} value={value} blank={value === 0} unresolved={unresolved} />
        <ReferenceField
          ariaLabel={`Search ${label.toLowerCase()}`}
          placeholder="Search value, stored byte, or combat tile ID..."
          options={options}
          value={value}
          selectedValue={selectedOption?.value ?? null}
          current={current}
          currentSupplement={(
            <ReferencePreview
              preview={{
                kind: "custom",
                key: `rules-queue-icon-current:${value}`,
                title: current.label,
                detail: current.detail,
                content: <QueueIconSwatch atlasUrl={atlasUrl} value={value} blank={value === 0} unresolved={unresolved} />,
                state: current.state === "unresolved" ? "unavailable" : "resolved"
              }}
            />
          )}
          disabled={disabled}
          rawOptionForQuery={(query) => rulesQueueIconRawOption(query, options)}
          resultNoun="queue icon"
          resultNounPlural="queue icons"
          emptyTitle="No matching queue icons"
          emptyBody="Try a queue-icon value, a mapped combat tile ID from 201 through 400, or 'stored 255' for an unusual raw byte."
          compact
          compactPanelTitle={`${label} Picker`}
          compactStorageKey={`rules.spell.${label.toLowerCase().replace(/[^a-z0-9]+/g, ".")}.position`}
          onChange={(nextValue) => {
            if (!disabled) onCommit(nextValue);
          }}
        />
      </div>
    </div>
  );
}

export function fastplotTileRect(tile: number) {
  const normalized = tile > 999 ? tile - 1000 : tile;
  const tileGroup = Math.floor((normalized - 1) / 20);
  const column = normalized - tileGroup * 20 - 1;
  return { column, row: tileGroup };
}

export function queueIconStyle(atlasUrl: string | null, value: number): CSSProperties | undefined {
  const tileId = fastplotTileId(value);
  if (!atlasUrl || tileId == null || value > MAX_QUEUE_ICON_VALUE) return undefined;
  const rect = fastplotTileRect(tileId);
  return {
    backgroundImage: `url(${atlasUrl})`,
    backgroundSize: "2000% 2000%",
    backgroundPosition: `${(rect.column / 19) * 100}% ${(rect.row / 19) * 100}%`
  };
}

function QueueIconSwatch({
  atlasUrl,
  value,
  blank = false,
  unresolved = false
}: {
  atlasUrl: string | null;
  value: number;
  blank?: boolean;
  unresolved?: boolean;
}) {
  return (
    <span
      className={[
        "rules-presentation-preview",
        "is-queue-icon",
        blank ? "is-blank" : "",
        unresolved ? "is-unresolved" : ""
      ].filter(Boolean).join(" ")}
      style={queueIconStyle(atlasUrl, value)}
      aria-hidden="true"
    />
  );
}
