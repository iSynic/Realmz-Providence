import { useMemo, useState } from "react";
import { TutorialTip } from "../../components/TutorialTip";
import type { ItemReferenceCategory, ItemReferenceOption } from "../../itemReferences";
import type { PreviewRuntimeContext } from "../../previewUrls";
import type { LibraryCatalog, Project, ProjectCommand, SelectedEntity } from "../../types";
import { selectEntityFromId } from "../../utils";
import { ScrollArea, SearchField } from "../../ui";
import { EconomyItemReferenceField, economyItemReferenceOptions } from "./EconomyItemReferenceField";
import { SHOP_ITEM_CATEGORY_OPTIONS } from "./ItemCatalogWorkbench";
import { ItemNumberInput } from "./ItemNumberInput";
import { ItemOptionIcon, useDeferredItemReferenceOptions } from "./ItemReferencePresentation";
import { EconomyMiniItemIcons } from "./EconomyMiniItemIcons";
import { filterEconomyItemOptions } from "./economyItemSearch";
import {
  economyTargetIdFromSelection,
  economyTargetRecordSummary,
  economyTargetRecords,
  includeSelectedEconomyRecord,
  itemOptionName,
  nextEconomyTargetRecordId
} from "./economyRecordModel";

const SHOP_RECORD_HELP = "Shop records are source Data SD stock definitions. Realmz may copy them into runtime cache stock during play, so source stock and saved-game stock are separate concepts.";

export function ShopWorkbench({
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
  const records = economyTargetRecords(project, "shop");
  const selectedId = economyTargetIdFromSelection(selectedEntity?.id ?? "", "shop") ?? records[0]?.id ?? 1;
  const visibleRecords = useMemo(() => includeSelectedEconomyRecord(records, selectedId, 140), [records, selectedId]);
  const record = (project.shops ?? []).find((candidate) => candidate.id === selectedId) ?? null;
  const deferredOptions = useDeferredItemReferenceOptions(project, catalog);
  const options = deferredOptions ?? [];
  const optionsByValue = useMemo(() => new Map(options.map((option) => [option.value, option])), [options]);
  const nextId = nextEconomyTargetRecordId(project, "shop");
  return (
    <article className="shop-workbench">
      <header className="shop-workbench-header">
        <div>
          <span>Shop Records</span>
          <h2>
            <TutorialTip title="Shop Editor" body={SHOP_RECORD_HELP} side="right">
              <span>Shop Editor</span>
            </TutorialTip>
          </h2>
          <p>Build source shop stock from item IDs, quantities, and inflation.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-xs"
          onClick={() => {
            onApplyCommand?.({ kind: "createTargetRecord", label: "Create Shop", recordType: "shop", id: nextId });
            onSelectEntity(selectEntityFromId(`shop:${nextId}`));
          }}
        >
          New Shop {nextId}
        </button>
      </header>
      <div className="shop-workbench-layout">
        <aside className="shop-record-browser">
          <header>
            <TutorialTip title="Shop Records" body={SHOP_RECORD_HELP} side="right">
              <strong>{records.length.toLocaleString()} records</strong>
            </TutorialTip>
            <small>{records.reduce((total, entry) => total + shopFilledSlots(project, entry.id), 0).toLocaleString()} stocked slots</small>
          </header>
          <ScrollArea className="shop-record-list" aria-label="Shop records">
            {visibleRecords.map((entry) => {
              const candidate = (project.shops ?? []).find((shop) => shop.id === entry.id) ?? null;
              const itemIds = shopFilledSlotIndexes(candidate).slice(0, 5).map((slot) => candidate?.itemIds[slot] ?? 0);
              return (
                <button
                  key={`shop:${entry.id}`}
                  type="button"
                  className={entry.id === selectedId ? "selected" : ""}
                  onClick={() => onSelectEntity(selectEntityFromId(`shop:${entry.id}`))}
                >
                  <span>
                    <strong>Shop {entry.id}</strong>
                    <small>{economyTargetRecordSummary(project, "shop", entry.id)}</small>
                  </span>
                  <EconomyMiniItemIcons itemIds={itemIds} optionsByValue={optionsByValue} />
                </button>
              );
            })}
            {records.length > visibleRecords.length && (
              <p className="domain-list-limit">{records.length - visibleRecords.length} more shop records; use search to jump to a specific ID.</p>
            )}
            {records.length === 0 && <p>No shop records yet.</p>}
          </ScrollArea>
        </aside>
        <section className="shop-detail-panel">
          {record ? (
            <>
              <header>
                <div>
                  <span>Shop {record.id}</span>
                  <h3>{shopFilledSlotIndexes(record).length} stocked slot{shopFilledSlotIndexes(record).length === 1 ? "" : "s"}</h3>
                  <p>{shopStockQuantityTotal(record).toLocaleString()} total stocked item{shopStockQuantityTotal(record) === 1 ? "" : "s"} before runtime shop changes</p>
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-xs"
                  onClick={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear shop", recordType: "shop", id: record.id })}
                >
                  Clear To Defaults
                </button>
              </header>
              <ShopSettingsEditor record={record} onApplyCommand={onApplyCommand} />
              <ShopStockEditor
                project={project}
                catalog={catalog}
                previewContext={previewContext}
                record={record}
                options={options}
                optionsLoading={!deferredOptions}
                onApplyCommand={onApplyCommand}
              />
            </>
          ) : (
            <div className="shop-empty-detail">
              <strong>Shop {selectedId} does not exist yet.</strong>
              <button
                type="button"
                className="btn btn-primary btn-xs"
                onClick={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create shop", recordType: "shop", id: selectedId })}
              >
                Create Shop {selectedId}
              </button>
            </div>
          )}
        </section>
      </div>
    </article>
  );
}

function ShopSettingsEditor({ record, onApplyCommand }: { record: Project["shops"][number]; onApplyCommand?: (command: ProjectCommand) => void }) {
  return (
    <section className="shop-settings-panel" aria-label="Shop settings">
      <div className="shop-setting-card">
        <ItemNumberInput
          label="Inflation"
          value={record.inflation}
          title="Price adjustment applied by this shop source record."
          onCommit={(inflation) => onApplyCommand?.({ kind: "updateShopRecord", label: "Update shop inflation", id: record.id, changes: { inflation } })}
        />
        <small>Price adjustment applied by this shop source record.</small>
      </div>
    </section>
  );
}

function ShopStockEditor({
  project,
  catalog,
  previewContext,
  record,
  options,
  optionsLoading,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  record: Project["shops"][number];
  options: ItemReferenceOption[];
  optionsLoading: boolean;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const [category, setCategory] = useState<ItemReferenceCategory | "all">("weapon");
  const [query, setQuery] = useState("");
  const openSlot = firstOpenShopSlot(record);
  const filledSlots = shopFilledSlotIndexes(record);
  const visibleSlots = filledSlots.length ? filledSlots.slice(0, 120) : openSlot >= 0 ? [openSlot] : [];
  const optionsByValue = useMemo(() => new Map(options.map((option) => [option.value, option])), [options]);
  const matchingOptions = useMemo(() => filterEconomyItemOptions(options, category, query), [category, options, query]);
  const visibleOptions = useMemo(() => matchingOptions.slice(0, 42), [matchingOptions]);
  const referenceOptions = useMemo(
    () => economyItemReferenceOptions(options, project, catalog, previewContext),
    [catalog, options, previewContext, project]
  );
  const updateStock = (itemIds: number[], quantities: number[]) => {
    onApplyCommand?.({ kind: "updateShopRecord", label: "Update shop stock", id: record.id, changes: { itemIds, quantities } });
  };
  const addItem = (itemId: number) => {
    if (openSlot < 0) return;
    updateStock(updateShopArraySlot(record.itemIds, openSlot, itemId), updateShopArraySlot(record.quantities, openSlot, 1));
  };
  const clearAll = () => {
    updateStock(new Array(1000).fill(0), new Array(1000).fill(0));
  };
  return (
    <section className="shop-stock-panel">
      <div className="shop-catalog-panel">
        <header>
          <div>
            <TutorialTip title="Item Pool" body="Choose from the same item families used by Treasure and Items. Clicking an item fills the next open shop slot with quantity 1." side="right">
              <strong>Item Pool</strong>
            </TutorialTip>
            <small>{openSlot >= 0 ? `Next open slot ${openSlot}` : "All shop slots are filled"}</small>
          </div>
        </header>
        <div className="shop-pool-controls">
          <label>
            <span>Category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.currentTarget.value as ItemReferenceCategory | "all")}
              aria-label="Shop item category"
            >
              {SHOP_ITEM_CATEGORY_OPTIONS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.range ? `${entry.label} (${entry.range})` : entry.label}
                </option>
              ))}
            </select>
          </label>
          <SearchField className="item-search" value={query} onChange={setQuery} placeholder="Search item pool..."
            ariaLabel="Search shop items" resultCount={matchingOptions.length} resultNoun="item"
            status={matchingOptions.length > visibleOptions.length ? `${visibleOptions.length} shown` : undefined} />
        </div>
        <ScrollArea className="shop-catalog-list" aria-label="Items available for shop stock">
          {visibleOptions.map((option) => (
            <button key={option.key} type="button" disabled={openSlot < 0} onClick={() => addItem(option.value)}>
              <ItemOptionIcon option={option} project={project} catalog={catalog} previewContext={previewContext} />
              <span>
                <strong>{itemOptionName(option)}</strong>
                <small>{option.detail}</small>
              </span>
              <b>{option.value}</b>
            </button>
          ))}
          {optionsLoading && <p>Loading item references...</p>}
          {matchingOptions.length === 0 && <p>No items match this category/search.</p>}
        </ScrollArea>
      </div>
      <div className="shop-inventory-panel">
        <header>
          <div>
            <TutorialTip title="Shop Stock" body="Realmz copies this source stock into the runtime shop inventory when a new game starts. Saved games can diverge after play begins." side="right">
              <strong>Shop Stock</strong>
            </TutorialTip>
            <small>{filledSlots.length} of 1000 slots filled</small>
          </div>
          <button type="button" className="btn btn-danger btn-xs" disabled={filledSlots.length === 0} onClick={clearAll}>
            Clear Stock
          </button>
        </header>
        <ScrollArea className="shop-inventory-list" aria-label="Shop stocked items">
          {visibleSlots.map((slot) => {
            const itemId = record.itemIds[slot] ?? 0;
            const quantity = record.quantities[slot] ?? 0;
            const option = optionsByValue.get(itemId);
            return (
              <ShopStockSlotEditor
                key={slot}
                slot={slot}
                itemId={itemId}
                quantity={quantity}
                option={option}
                referenceOptions={referenceOptions}
                project={project}
                catalog={catalog}
                previewContext={previewContext}
                onCommitItem={(value) => updateStock(updateShopArraySlot(record.itemIds, slot, value), record.quantities)}
                onCommitQuantity={(value) => updateStock(record.itemIds, updateShopArraySlot(record.quantities, slot, clampByte(value)))}
                onClear={() => updateStock(updateShopArraySlot(record.itemIds, slot, 0), updateShopArraySlot(record.quantities, slot, 0))}
              />
            );
          })}
          {filledSlots.length > visibleSlots.length && <p className="domain-list-limit">{filledSlots.length - visibleSlots.length} more stocked slots not shown.</p>}
          {visibleSlots.length === 0 && <p>No stock slots available.</p>}
        </ScrollArea>
      </div>
    </section>
  );
}

function ShopStockSlotEditor({
  slot,
  itemId,
  quantity,
  option,
  referenceOptions,
  project,
  catalog,
  previewContext,
  onCommitItem,
  onCommitQuantity,
  onClear
}: {
  slot: number;
  itemId: number;
  quantity: number;
  option?: ItemReferenceOption;
  referenceOptions: ReturnType<typeof economyItemReferenceOptions>;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  onCommitItem: (value: number) => void;
  onCommitQuantity: (value: number) => void;
  onClear: () => void;
}) {
  return (
    <div className={itemId || quantity ? "shop-stock-card filled" : "shop-stock-card"}>
      <span className="shop-stock-index">Slot {slot}</span>
      {option ? <ItemOptionIcon option={option} project={project} catalog={catalog} previewContext={previewContext} /> : <span className="item-option-icon"><i>IT</i></span>}
      <div className="shop-stock-item-field">
        <span>Item</span>
        <EconomyItemReferenceField
          value={itemId}
          option={option}
          options={referenceOptions}
          ariaLabel={`Search shop slot ${slot} item`}
          panelTitle={`Shop Slot ${slot} Item`}
          storageKey="economy.shop.item.picker.position"
          project={project}
          catalog={catalog}
          previewContext={previewContext}
          onChange={onCommitItem}
        />
      </div>
      <label>
        <span>Qty</span>
        <input type="number" min={0} max={255} value={quantity} onChange={(event) => onCommitQuantity(Number(event.currentTarget.value))} />
      </label>
      <button type="button" className="btn btn-secondary btn-xs" disabled={!itemId && !quantity} onClick={onClear}>
        Clear
      </button>
      <small>{option ? [option.detail, option.sourceState].filter(Boolean).join(" | ") : itemId ? "Raw item ID" : "Open stock slot"}</small>
    </div>
  );
}

function shopFilledSlotIndexes(record: Project["shops"][number] | null | undefined) {
  if (!record) return [];
  const count = Math.max(record.itemIds.length, record.quantities.length);
  const indexes: number[] = [];
  for (let slot = 0; slot < count; slot += 1) {
    if ((record.itemIds[slot] ?? 0) !== 0 || (record.quantities[slot] ?? 0) !== 0) indexes.push(slot);
  }
  return indexes;
}

function firstOpenShopSlot(record: Project["shops"][number]) {
  for (let slot = 0; slot < 1000; slot += 1) {
    if ((record.itemIds[slot] ?? 0) === 0 && (record.quantities[slot] ?? 0) === 0) return slot;
  }
  return -1;
}

function updateShopArraySlot(values: number[], slot: number, value: number) {
  const next = values.slice(0, 1000);
  while (next.length < 1000) next.push(0);
  next[slot] = Number.isFinite(value) ? Math.trunc(value) : 0;
  return next;
}

function clampByte(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.trunc(value)));
}

function shopFilledSlots(project: Project, id: number) {
  return shopFilledSlotIndexes((project.shops ?? []).find((record) => record.id === id)).length;
}

function shopStockQuantityTotal(record: Project["shops"][number]) {
  return record.quantities.reduce((total, quantity, slot) => (record.itemIds[slot] ?? 0) ? total + Math.max(0, quantity) : total, 0);
}
