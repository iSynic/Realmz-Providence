import { useMemo, useState } from "react";
import { TutorialTip } from "../../components/TutorialTip";
import { ITEM_REFERENCE_CATEGORIES, type ItemReferenceCategory, type ItemReferenceOption } from "../../itemReferences";
import { useIconPreviewUrl, type PreviewRuntimeContext } from "../../previewUrls";
import type { LibraryCatalog, Project, ProjectCommand, SelectedEntity } from "../../types";
import { selectEntityFromId } from "../../utils";
import { PanelHeader, ScrollArea, SearchField } from "../../ui";
import { EconomyItemPoolList } from "./EconomyItemPoolList";
import { EconomyItemReferenceField, economyItemReferenceOptions } from "./EconomyItemReferenceField";
import { EconomyMiniItemIcons } from "./EconomyMiniItemIcons";
import { filterEconomyItemOptions } from "./economyItemSearch";
import { ItemNumberInput } from "./ItemNumberInput";
import { ItemOptionIcon, useDeferredItemReferenceOptions } from "./ItemReferencePresentation";
import {
  economyTargetIdFromSelection,
  economyTargetRecordSummary,
  economyTargetRecords,
  includeSelectedEconomyRecord,
  nextEconomyTargetRecordId
} from "./economyRecordModel";

const TREASURE_EDITOR_HELP = "Build source-backed Data TD treasure rewards. Fixed rewards and item slots are exported as scenario data and can be targeted from scripts and encounters.";
const TREASURE_ITEMS_HELP = "Treasure records have twenty ordered item slots. Zero means empty; use the item browser to fill the next open slot or edit a raw ID directly to preserve imported data.";

export function TreasureWorkbench({
  project,
  catalog,
  selectedEntity,
  previewContext,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  previewContext: PreviewRuntimeContext;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const records = economyTargetRecords(project, "treasure");
  const selectedId = economyTargetIdFromSelection(selectedEntity?.id ?? "", "treasure") ?? records[0]?.id ?? 1;
  const visibleRecords = useMemo(() => includeSelectedEconomyRecord(records, selectedId, 140), [records, selectedId]);
  const record = (project.treasures ?? []).find((candidate) => candidate.id === selectedId) ?? null;
  const deferredOptions = useDeferredItemReferenceOptions(project, catalog);
  const options = deferredOptions ?? [];
  const optionsByValue = useMemo(() => new Map(options.map((option) => [option.value, option])), [options]);
  const nextId = nextEconomyTargetRecordId(project, "treasure");
  const rewards = record ? treasureRewardTotal(record) : 0;
  return (
    <article className="treasure-workbench">
      <header className="treasure-workbench-header">
        <div>
          <span>Treasure Records</span>
          <h2>
            <TutorialTip title="Treasure Editor" body={TREASURE_EDITOR_HELP} side="right">
              <span>Treasure Editor</span>
            </TutorialTip>
          </h2>
          <p>Build Realmz reward records from money, victory points, and up to 20 item slots.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-xs"
          onClick={() => {
            onApplyCommand?.({ kind: "createTargetRecord", label: "Create Treasure", recordType: "treasure", id: nextId });
            onSelectEntity(selectEntityFromId(`treasure:${nextId}`));
          }}
        >
          New Treasure {nextId}
        </button>
      </header>
      <div className="treasure-workbench-layout">
        <aside className="treasure-record-browser">
          <PanelHeader
            title={<TutorialTip title="Treasure Records" body={TREASURE_EDITOR_HELP} side="right">{records.length.toLocaleString()} records</TutorialTip>}
            description={`${records.reduce((total, entry) => total + treasureFilledItems(project, entry.id), 0).toLocaleString()} item slots filled`}
          />
          <ScrollArea className="treasure-record-list" aria-label="Treasure records">
            {visibleRecords.map((entry) => {
              const candidate = (project.treasures ?? []).find((treasure) => treasure.id === entry.id) ?? null;
              const itemIds = candidate?.itemIds.filter(Boolean).slice(0, 5) ?? [];
              return (
                <button
                  key={`treasure:${entry.id}`}
                  type="button"
                  className={entry.id === selectedId ? "selected" : ""}
                  onClick={() => onSelectEntity(selectEntityFromId(`treasure:${entry.id}`))}
                >
                  <span>
                    <strong>Treasure {entry.id}</strong>
                    <small>{economyTargetRecordSummary(project, "treasure", entry.id)}</small>
                  </span>
                  <EconomyMiniItemIcons itemIds={itemIds} optionsByValue={optionsByValue} />
                </button>
              );
            })}
            {records.length > visibleRecords.length && (
              <p className="domain-list-limit">{records.length - visibleRecords.length} more treasure records; use search to jump to a specific ID.</p>
            )}
            {records.length === 0 && <p>No treasure records yet.</p>}
          </ScrollArea>
        </aside>
        <section className="treasure-detail-panel">
          {record ? (
            <>
              <header>
                <div>
                  <span>Treasure {record.id}</span>
                  <h3>{record.itemIds.filter(Boolean).length} item{record.itemIds.filter(Boolean).length === 1 ? "" : "s"} plus rewards</h3>
                  <p>{rewards > 0 ? `${rewards.toLocaleString()} combined reward value before item loot` : "No fixed reward values yet"}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-xs"
                  onClick={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear treasure", recordType: "treasure", id: record.id })}
                >
                  Clear To Defaults
                </button>
              </header>
              <TreasureRewardEditor project={project} catalog={catalog} previewContext={previewContext} record={record} onApplyCommand={onApplyCommand} />
              <TreasureLootEditor
                project={project}
                catalog={catalog}
                previewContext={previewContext}
                recordId={record.id}
                itemIds={record.itemIds}
                options={options}
                optionsLoading={!deferredOptions}
                optionsByValue={optionsByValue}
                onApplyCommand={onApplyCommand}
              />
            </>
          ) : (
            <div className="treasure-empty-detail">
              <strong>Treasure {selectedId} does not exist yet.</strong>
              <button
                type="button"
                className="btn btn-primary btn-xs"
                onClick={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create treasure", recordType: "treasure", id: selectedId })}
              >
                Create Treasure {selectedId}
              </button>
            </div>
          )}
        </section>
      </div>
    </article>
  );
}

const TREASURE_REWARD_ICONS = {
  exp: { label: "Victory points", src: "/economy/victory-points.png" },
  gold: { label: "Gold", iconId: 2002 },
  gems: { label: "Gems", iconId: 2014 },
  jewelry: { label: "Jewelry", iconId: 2012 }
} satisfies Record<string, TreasureRewardIconDescriptor>;

type TreasureRewardIconDescriptor = {
  label: string;
  src?: string;
  iconId?: number;
};

function TreasureRewardEditor({
  project,
  catalog,
  previewContext,
  record,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  record: Project["treasures"][number];
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const update = (changes: Partial<Pick<Project["treasures"][number], "exp" | "gold" | "gems" | "jewelry">>) => {
    onApplyCommand?.({ kind: "updateTreasureRecord", label: "Update treasure rewards", id: record.id, changes });
  };
  return (
    <section className="treasure-reward-panel" aria-label="Treasure rewards">
      <TreasureRewardInput icon={TREASURE_REWARD_ICONS.exp} project={project} catalog={catalog} previewContext={previewContext} label="Victory Points" value={record.exp} hint="Character advancement reward" onCommit={(exp) => update({ exp })} />
      <TreasureRewardInput icon={TREASURE_REWARD_ICONS.gold} project={project} catalog={catalog} previewContext={previewContext} label="Gold" value={record.gold} hint="Coins awarded to the party" onCommit={(gold) => update({ gold })} />
      <TreasureRewardInput icon={TREASURE_REWARD_ICONS.gems} project={project} catalog={catalog} previewContext={previewContext} label="Gems" value={record.gems} hint="Gem reward count" onCommit={(gems) => update({ gems })} />
      <TreasureRewardInput icon={TREASURE_REWARD_ICONS.jewelry} project={project} catalog={catalog} previewContext={previewContext} label="Jewelry" value={record.jewelry} hint="Jewelry reward count" onCommit={(jewelry) => update({ jewelry })} />
    </section>
  );
}

function TreasureRewardInput({
  icon,
  project,
  catalog,
  previewContext,
  label,
  value,
  hint,
  onCommit
}: {
  icon: TreasureRewardIconDescriptor;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  label: string;
  value: number;
  hint: string;
  onCommit: (value: number) => void;
}) {
  return (
    <div className="treasure-reward-input">
      <TreasureRewardIcon icon={icon} project={project} catalog={catalog} previewContext={previewContext} />
      <div className="treasure-reward-field">
        <ItemNumberInput label={label} value={value} title={hint} onCommit={onCommit} />
      </div>
      <small>{hint}</small>
    </div>
  );
}

function TreasureRewardIcon({
  icon,
  project,
  catalog,
  previewContext
}: {
  icon: TreasureRewardIconDescriptor;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
}) {
  const iconUrl = useIconPreviewUrl(icon.iconId ?? null, project, catalog, previewContext);
  const src = icon.src ?? iconUrl;
  return (
    <span className={icon.src ? "treasure-reward-icon vp" : "treasure-reward-icon"} title={icon.iconId ? `${icon.label} (cicn ${icon.iconId})` : icon.label}>
      {src ? <img src={src} alt="" draggable={false} /> : <i>{icon.label.slice(0, 2).toUpperCase()}</i>}
    </span>
  );
}

function TreasureLootEditor({
  project,
  catalog,
  previewContext,
  recordId,
  itemIds,
  options,
  optionsLoading,
  optionsByValue,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  recordId: number;
  itemIds: number[];
  options: ItemReferenceOption[];
  optionsLoading: boolean;
  optionsByValue: Map<number, ItemReferenceOption>;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const [category, setCategory] = useState<ItemReferenceCategory | "all">("weapon");
  const [query, setQuery] = useState("");
  const openSlot = firstOpenTreasureSlotForUi(itemIds);
  const matchingOptions = useMemo(() => filterEconomyItemOptions(options, category, query), [category, options, query]);
  const referenceOptions = useMemo(
    () => economyItemReferenceOptions(options, project, catalog, previewContext),
    [catalog, options, previewContext, project]
  );
  const commitSlot = (slot: number, itemId: number) => {
    onApplyCommand?.({
      kind: "updateTreasureRecord",
      label: "Update treasure item",
      id: recordId,
      changes: { itemIds: updateTreasureSlot(itemIds, slot, itemId) }
    });
  };
  const addItem = (itemId: number) => {
    if (openSlot < 0) return;
    commitSlot(openSlot, itemId);
  };
  return (
    <section className="treasure-loot-panel">
      <div className="treasure-catalog-panel">
        <PanelHeader
          title={<TutorialTip title="Add Treasure Item" body="Choose from the same Divinity item families used by the Item Editor. Clicking an item fills the next open treasure slot." side="right">Add Item</TutorialTip>}
          description={openSlot >= 0 ? `Next open slot ${openSlot}` : "All 20 slots are filled"}
          meta={`${matchingOptions.length.toLocaleString()} ${matchingOptions.length === 1 ? "item" : "items"}`}
        />
        <div className="item-category-tabs" role="tablist" aria-label="Treasure item categories">
          {ITEM_REFERENCE_CATEGORIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={category === entry.id ? "active" : ""}
              onClick={() => setCategory(entry.id)}
              title={entry.range ? `${entry.label}: ${entry.range}` : entry.label}
            >
              <span>{entry.label}</span>
              {entry.range && <small>{entry.range}</small>}
            </button>
          ))}
        </div>
        <SearchField className="item-search" value={query} onChange={setQuery} placeholder="Search items to add..."
          ariaLabel="Search treasure items" />
        <EconomyItemPoolList className="treasure-catalog-list" ariaLabel="Items available for treasure"
          options={matchingOptions} optionsLoading={optionsLoading} disabled={openSlot < 0}
          project={project} catalog={catalog} previewContext={previewContext} onSelect={addItem} />
      </div>
      <div className="treasure-slot-panel">
        <PanelHeader
          title={<TutorialTip title="Treasure Items" body={TREASURE_ITEMS_HELP} side="right">Treasure Items</TutorialTip>}
          description={`${itemIds.filter(Boolean).length} of 20 slots filled`}
        />
        <div className="treasure-slot-grid">
          {Array.from({ length: 20 }, (_, slot) => {
            const value = itemIds[slot] ?? 0;
            const option = optionsByValue.get(value);
            return (
              <TreasureSlotEditor
                key={slot}
                slot={slot}
                value={value}
                option={option}
                referenceOptions={referenceOptions}
                project={project}
                catalog={catalog}
                previewContext={previewContext}
                onCommit={(itemId) => commitSlot(slot, itemId)}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TreasureSlotEditor({
  slot,
  value,
  option,
  referenceOptions,
  project,
  catalog,
  previewContext,
  onCommit
}: {
  slot: number;
  value: number;
  option?: ItemReferenceOption;
  referenceOptions: ReturnType<typeof economyItemReferenceOptions>;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  onCommit: (value: number) => void;
}) {
  return (
    <div className={value ? "treasure-slot-card filled" : "treasure-slot-card"}>
      <span className="treasure-slot-index">Slot {slot}</span>
      {option ? <ItemOptionIcon option={option} project={project} catalog={catalog} previewContext={previewContext} /> : <span className="item-option-icon"><i>IT</i></span>}
      <EconomyItemReferenceField
        value={value}
        option={option}
        options={referenceOptions}
        ariaLabel={`Search treasure slot ${slot} item`}
        panelTitle={`Treasure Slot ${slot} Item`}
        storageKey="economy.treasure.item.picker.position"
        project={project}
        catalog={catalog}
        previewContext={previewContext}
        onChange={onCommit}
      />
      <small>{option ? [option.detail, option.sourceState].filter(Boolean).join(" | ") : value ? "Raw item ID" : "Open slot"}</small>
    </div>
  );
}

function firstOpenTreasureSlotForUi(itemIds: number[]) {
  for (let index = 0; index < 20; index += 1) {
    if ((itemIds[index] ?? 0) === 0) return index;
  }
  return -1;
}

function updateTreasureSlot(itemIds: number[], slot: number, value: number) {
  const next = itemIds.slice(0, 20);
  while (next.length < 20) next.push(0);
  next[slot] = Number.isFinite(value) ? Math.trunc(value) : 0;
  return next;
}

function treasureFilledItems(project: Project, id: number) {
  return (project.treasures ?? []).find((record) => record.id === id)?.itemIds.filter(Boolean).length ?? 0;
}

function treasureRewardTotal(record: Project["treasures"][number]) {
  return Math.max(0, record.exp) + Math.max(0, record.gold) + Math.max(0, record.gems) + Math.max(0, record.jewelry);
}
