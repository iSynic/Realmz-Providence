import { useEffect, useMemo, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { loadBrowserBundledLibraryAssetPreview } from "../../browser/library";
import { TutorialTip } from "../../components/TutorialTip";
import { ITEM_REFERENCE_CATEGORIES, itemReferenceOptions, itemTextDisplay, type ItemReferenceCategory, type ItemReferenceOption, type ItemTextDisplay } from "../../itemReferences";
import { playPreviewUrl, useIconPreviewUrl, useResolvedPreviewUrl, type PreviewRuntimeContext } from "../../previewUrls";
import { CONDITION_LABELS, ITEM_CATEGORY_LABELS, RACE_DESCRIPTOR_LABELS, REALMZ_CASTES, REALMZ_RACES } from "../../rulesCatalog";
import type { LibraryCatalog, LibraryEntity, Project, ProjectCommand, ScenarioItemRecord, SelectedEntity, SemanticEntity } from "../../types";
import { selectEntityFromId } from "../../utils";
import { ScrollArea, SearchField } from "../../ui";
import { renderListKey } from "../../renderKeys";
import { filterEconomyItemOptions } from "./economyItemSearch";

const ITEM_EDITOR_HELP = "Browse item IDs by Divinity family, inspect built-in/library data, and copy built-in items into scenario custom slots when you need editable item definitions.";
const CUSTOM_ITEM_HELP = "Custom scenario items use item IDs 900-999. Built-in items stay reference-only unless copied into one of these scenario-backed slots.";

export function ItemCatalogWorkbench({
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
  const deferredOptions = useDeferredItemReferenceOptions(project, catalog);
  const options = deferredOptions ?? [];
  const [category, setCategory] = useState<ItemReferenceCategory | "all">("weapon");
  const [query, setQuery] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(240);
  const selectedFromEntity = itemIdFromEntityId(selectedEntity?.id ?? "");
  const filteredOptions = useMemo(() => filterEconomyItemOptions(options, category, query), [category, options, query]);
  useEffect(() => {
    setVisibleLimit(240);
  }, [category, query]);
  const visibleOptions = useMemo(() => filteredOptions.slice(0, visibleLimit), [filteredOptions, visibleLimit]);
  const hiddenOptionCount = Math.max(0, filteredOptions.length - visibleOptions.length);
  const [localSelectedId, setLocalSelectedId] = useState<number | null>(null);
  const selectedId =
    selectedFromEntity ??
    (localSelectedId != null && options.some((option) => option.value === localSelectedId) ? localSelectedId : null) ??
    filteredOptions[0]?.value ??
    options[0]?.value ??
    0;
  const selectedOption = options.find((option) => option.value === selectedId) ?? filteredOptions[0] ?? options[0] ?? null;
  const selectedEntityDetail = selectedOption ? findItemCatalogEntity(project, catalog, selectedOption.value) : null;

  const selectItem = (option: ItemReferenceOption) => {
    setLocalSelectedId(option.value);
    onSelectEntity(selectEntityFromId(`item:${option.value}`));
  };

  return (
    <article className="item-workbench">
      <header className="item-workbench-header">
        <div>
          <h2>
            <TutorialTip title="Item Editor" body={ITEM_EDITOR_HELP} side="right">
              <span>Item Editor</span>
            </TutorialTip>
          </h2>
          <p>Browse Realmz items by Divinity category, including scenario special items loaded from this scenario's item table.</p>
        </div>
            <strong>{deferredOptions ? `${options.length.toLocaleString()} item reference${options.length === 1 ? "" : "s"}` : "Loading item references"}</strong>
      </header>
      <div className="item-workbench-layout">
        <aside className="item-browser-panel">
          <div className="item-category-tabs" role="tablist" aria-label="Item categories">
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
          <SearchField className="item-search" value={query} onChange={setQuery}
            placeholder="Search item ID, name, category, or use..." ariaLabel="Search items"
            resultCount={filteredOptions.length} resultNoun="item" status={hiddenOptionCount ? `${visibleOptions.length} shown` : undefined} />
          <ScrollArea className="item-browser-list" aria-label="Item catalog">
            {visibleOptions.map((option) => (
              <button
                key={`${option.value}:${option.key}`}
                type="button"
                className={option.value === selectedOption?.value ? "selected" : ""}
                onClick={() => selectItem(option)}
              >
                <ItemOptionIcon option={option} project={project} catalog={catalog} previewContext={previewContext} />
                <span>
                  <strong>{option.label.replace(/\s+\(-?\d+\)$/, "")}</strong>
                  <small>{option.detail}</small>
                </span>
                <b>{option.value}</b>
              </button>
            ))}
            {hiddenOptionCount > 0 && (
              <div className="item-browser-load-more">
                <small>
                  {hiddenOptionCount} more item reference{hiddenOptionCount === 1 ? "" : "s"}.
                </small>
                <button type="button" onClick={() => setVisibleLimit((limit) => limit + 240)}>
                  Load {Math.min(240, hiddenOptionCount)} More
                </button>
              </div>
            )}
            {filteredOptions.length === 0 && <p>No items match this category/search.</p>}
          </ScrollArea>
        </aside>
        <ItemDetailPanel
          option={selectedOption}
          entity={selectedEntityDetail}
          project={project}
          catalog={catalog}
          previewContext={previewContext}
          onSelectEntity={onSelectEntity}
          onApplyCommand={onApplyCommand}
        />
      </div>
    </article>
  );
}

export function ItemOptionIcon({
  option,
  project,
  catalog,
  previewContext
}: {
  option: ItemReferenceOption;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
}) {
  const iconUrl = useIconPreviewUrl(option.iconId, project, catalog, previewContext);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => setFailedUrl(null), [iconUrl]);
  const usableUrl = iconUrl && iconUrl !== failedUrl ? iconUrl : null;
  return (
    <span className="item-option-icon" title={option.iconId ? `cicn ${option.iconId}` : `${itemCategoryBadge(option.category)} item`}>
      {usableUrl ? <img src={usableUrl} alt="" onError={() => setFailedUrl(usableUrl)} /> : <i>{itemCategoryBadge(option.category)}</i>}
    </span>
  );
}

export function useDeferredItemReferenceOptions(project: Project, catalog?: LibraryCatalog | null) {
  const [options, setOptions] = useState<ItemReferenceOption[] | null>(null);
  useEffect(() => {
    let disposed = false;
    const timer = window.setTimeout(() => {
      const next = itemReferenceOptions(project, catalog);
      if (!disposed) setOptions(next);
    }, 120);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [catalog, project]);
  return options;
}

export function itemCategoryBadge(category: ItemReferenceCategory) {
  if (category === "weapon") return "W";
  if (category === "armor") return "AR";
  if (category === "accessory") return "AC";
  if (category === "magic") return "M";
  if (category === "supply") return "SP";
  return "IT";
}

function ItemDetailPanel({
  option,
  entity,
  project,
  catalog,
  previewContext,
  onSelectEntity,
  onApplyCommand
}: {
  option: ItemReferenceOption | null;
  entity: SemanticEntity | LibraryEntity | null;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  if (!option) {
    return (
      <section className="item-detail-panel">
        <p>No item records are available. Import or refresh the Realmz library data to populate the catalog.</p>
      </section>
    );
  }
  const scenarioItem = scenarioItemRecordFor(project, option.value);
  const customRecordId = customItemRecordId(option.value);
  const summary = scenarioItem ? scenarioItemSummary(scenarioItem) : entity?.summary ?? {};
  const usages = itemUsageLinks(project, option.value);
  const unique = numberField(summary, "cost") != null && numberField(summary, "cost")! < 0;
  const customEditable = customRecordId != null;
  const customSlotOccupied = Boolean(scenarioItem && scenarioItemSlotInUse(scenarioItem));
  const nextCustomId = nextCustomItemId(project);
  const itemText = itemTextDisplay(project, option.value, catalog);
  const editableItemText = {
    ...itemText,
    unidentifiedName: itemText.unidentifiedName || itemText.identifiedName || `Item ${option.value}`,
    identifiedName: itemText.identifiedName || itemText.unidentifiedName || `Custom Item ${option.value}`,
    description: itemText.description
  };
  return (
    <section className="item-detail-panel">
      <header>
        <div className="item-detail-title">
          <ItemOptionIcon option={option} project={project} catalog={catalog} previewContext={previewContext} />
          <div>
            <span>{option.value}</span>
            <h3>{option.label.replace(/\s+\(-?\d+\)$/, "")}</h3>
            <p>{itemFamilyLabel(option.value)}{unique ? " | unique item cost" : ""}</p>
          </div>
        </div>
        <b>{itemEditRangeLabel(option.value)}</b>
      </header>
      <div className="item-action-strip">
        {customEditable ? (
          <>
            <span>{customSlotOccupied ? "Custom items are stored in this scenario and exported with it." : "This custom item slot is empty and available for a scenario-specific item."}</span>
            <button
              type="button"
              className="btn btn-primary btn-xs"
            onClick={() => onApplyCommand?.({ kind: "updateScenarioItemRecord", label: `Edit custom item ${option.value}`, id: customRecordId, changes: { itemId: option.value } })}
            >
              Create Custom Item
            </button>
            <button
              type="button"
              className="btn btn-xs"
              onClick={() => onApplyCommand?.({ kind: "clearScenarioItemRecord", label: `Clear custom item ${option.value}`, id: customRecordId })}
            >
              Clear Custom Item
            </button>
          </>
        ) : nextCustomId != null ? (
          <>
            <span>Built-in Realmz item. Copy it into a custom slot to edit a scenario-specific version.</span>
            <button
              type="button"
              className="btn btn-primary btn-xs"
              onClick={() => {
                const id = nextCustomId - 800;
                const copiedText = itemTextDisplay(project, option.value, catalog);
                onApplyCommand?.({
                  kind: "updateScenarioItemRecord",
                  label: `Copy item ${option.value} to custom item ${nextCustomId}`,
                  id,
                  changes: { ...scenarioItemChangesFromSummary(summary), itemId: nextCustomId }
                });
                onApplyCommand?.({
                  kind: "updateItemTextRecord",
                  label: `Copy item ${option.value} names to custom item ${nextCustomId}`,
                  itemId: nextCustomId,
                  changes: {
                    unidentifiedName: copiedText.unidentifiedName || copiedText.identifiedName || `Item ${nextCustomId}`,
                    identifiedName: copiedText.identifiedName || copiedText.unidentifiedName || `Custom Item ${nextCustomId}`,
                    description: copiedText.description
                  }
                });
                onSelectEntity(selectEntityFromId(`item:${nextCustomId}`));
              }}
            >
              Copy To Custom Item {nextCustomId}
            </button>
          </>
        ) : (
          <span>All custom item slots are currently in use.</span>
        )}
      </div>
      {!customEditable && (
        <>
          <ItemTextSummary itemText={editableItemText} />
          <div className="item-detail-grid">
            <ItemFact label="Icon" value={numberText(summary, "iconId")} />
            <ItemFact label="Type" value={itemTypeText(numberField(summary, "type"))} />
            <ItemFact label="Cost" value={costText(numberField(summary, "cost"))} />
            <ItemFact label="Charges" value={numberText(summary, "charge")} />
            <ItemFact label="Sound" value={numberText(summary, "sound")} />
            <ItemFact label="Cursed As" value={numberText(summary, "cursedItemId")} />
          </div>
          <div className="item-detail-columns">
            <ItemFieldGroup title="Equipping" help="Stats and equipment-facing fields used by Realmz item wear/use behavior. Built-in values are reference data unless this is a custom scenario item.">
              <ItemFact label="Strength" value={numberText(summary, "st")} />
              <ItemFact label="Luck" value={numberText(summary, "lu")} />
              <ItemFact label="Movement" value={numberText(summary, "movement")} />
              <ItemFact label="Armor Rating" value={numberText(summary, "ac")} />
              <ItemFact label="Magic Resist" value={numberText(summary, "magicResistance")} />
              <ItemFact label="Spell Points" value={numberText(summary, "spellPoints")} />
              <ItemFact label="Hands" value={numberText(summary, "hands")} />
              <ItemFact label="Weight" value={numberText(summary, "weight")} />
            </ItemFieldGroup>
            <ItemFieldGroup title="Damage" help="Damage and resistance modifiers used by weapon and item behavior. Values come from shared Data ID or scenario Data NI depending on the item family.">
              <ItemFact label="Base Damage" value={numberText(summary, "damage")} />
              <ItemFact label="Heat" value={numberText(summary, "heat")} />
              <ItemFact label="Cold" value={numberText(summary, "cold")} />
              <ItemFact label="Electric" value={numberText(summary, "electric")} />
              <ItemFact label="Vs. Small" value={numberText(summary, "vSmall")} />
              <ItemFact label="Vs. Large" value={numberText(summary, "vLarge")} />
              <ItemFact label="Vs. Undead" value={numberText(summary, "vsUndead")} />
              <ItemFact label="Vs. Evil" value={numberText(summary, "vsEvil")} />
            </ItemFieldGroup>
            <ItemFieldGroup title="Special Behavior" help="Special item fields drive unusual runtime behavior. Door-like items can call Extra Action Points, so changes here can affect Scripts.">
              <ItemFact label="Special 1" value={numberText(summary, "special1")} />
              <ItemFact label="Special 2" value={numberText(summary, "special2")} />
              <ItemFact label="Special 3" value={numberText(summary, "special3")} />
              <ItemFact label="Special 4" value={numberText(summary, "special4")} />
              <ItemFact label="Special 5" value={numberText(summary, "special5")} />
              <ItemFact label="Weight / Charge" value={numberText(summary, "weightPerCharge")} />
              <ItemFact label="Drop On Empty" value={numberText(summary, "dropOnEmpty")} />
              <ItemFact label="Magical" value={numberText(summary, "magical")} />
            </ItemFieldGroup>
            <ItemFieldGroup title="Use Restrictions" help="Race, caste, category, and class-gating values used to decide who can use this item.">
              <ItemRestrictionSummary
                itemCat0={numberField(summary, "itemCat0") ?? 0}
                itemCat1={numberField(summary, "itemCat1") ?? 0}
                raceRestrictions={numberField(summary, "raceRestrictions") ?? 0}
                casteRestrictions={numberField(summary, "casteRestrictions") ?? 0}
                specificRace={numberField(summary, "specificRace") ?? 0}
                specificCaste={numberField(summary, "specificCaste") ?? 0}
                raceClassOnly={numberField(summary, "raceClassOnly") ?? 0}
                casteClassOnly={numberField(summary, "casteClassOnly") ?? 0}
              />
            </ItemFieldGroup>
          </div>
        </>
      )}
      {customEditable && (
        <ScenarioItemEditor
          record={scenarioItem ?? emptyScenarioItemForUi(customRecordId)}
          itemId={option.value}
          project={project}
          catalog={catalog}
          previewContext={previewContext}
          itemText={editableItemText}
          onChange={(field, value) => {
            onApplyCommand?.({
              kind: "updateScenarioItemRecord",
              label: `Update custom item ${option.value}`,
              id: customRecordId,
              changes: { itemId: option.value, [field]: value } as Partial<ScenarioItemRecord>
            });
          }}
          onTextChange={(changes) => onApplyCommand?.({
            kind: "updateItemTextRecord",
            label: `Update custom item ${option.value} text`,
            itemId: option.value,
            changes: {
              unidentifiedName: editableItemText.unidentifiedName,
              identifiedName: editableItemText.identifiedName,
              description: editableItemText.description,
              ...changes
            }
          })}
        />
      )}
      <section className="item-used-by">
        <header>Used By</header>
        {usages.length ? usages.map((usage) => (
          <button key={`${usage.target}:${usage.label}`} type="button" onClick={() => onSelectEntity(selectEntityFromId(usage.target))}>
            <strong>{usage.label}</strong>
            <small>{usage.detail}</small>
          </button>
        )) : <p>No project treasure, shop, or script references currently use this item.</p>}
      </section>
    </section>
  );
}

function ItemTextSummary({ itemText }: { itemText: ItemTextDisplay }) {
  return (
    <ItemFieldGroup title="Names And Description" className="item-field-group-full item-text-summary">
      <ItemFact label="Unidentified Name" value={itemText.unidentifiedName || "None"} />
      <ItemFact label="Identified Name" value={itemText.identifiedName || "None"} />
      <div className="item-fact item-fact-description">
        <span>Description</span>
        <code>{itemText.description || "None"}</code>
      </div>
    </ItemFieldGroup>
  );
}

function ItemFieldGroup({ title, help, className = "", children }: { title: string; help?: string; className?: string; children: ReactNode }) {
  return (
    <section className={`item-field-group ${className}`.trim()}>
      <header>
        {help ? (
          <TutorialTip title={title} body={help} side="right">
            <span>{title}</span>
          </TutorialTip>
        ) : (
          title
        )}
      </header>
      <div>{children}</div>
    </section>
  );
}

function ItemFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="item-fact">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}

type ScenarioItemNumberKey =
  | "iconId"
  | "type"
  | "st"
  | "blunt"
  | "hands"
  | "lu"
  | "movement"
  | "ac"
  | "magicResistance"
  | "damage"
  | "spellPoints"
  | "sound"
  | "weight"
  | "cost"
  | "charge"
  | "cursedItemId"
  | "magical"
  | "itemCat0"
  | "itemCat1"
  | "vSmall"
  | "vLarge"
  | "heat"
  | "cold"
  | "electric"
  | "vsUndead"
  | "vsDemonDevil"
  | "vsEvil"
  | "special1"
  | "special2"
  | "special3"
  | "special4"
  | "special5"
  | "weightPerCharge"
  | "dropOnEmpty";

const SCENARIO_ITEM_EDIT_GROUPS: Array<{
  title: string;
  fields: Array<{ key: ScenarioItemNumberKey; label: string; help?: string }>;
}> = [
  {
    title: "Identity And Use",
    fields: [
      { key: "iconId", label: "Icon", help: "Icon drawn for this item in Realmz lists and menus." },
      { key: "type", label: "Type", help: "Realmz item type/category field." },
      { key: "cost", label: "Cost", help: "Negative cost marks a unique item in Realmz." },
      { key: "charge", label: "Charges", help: "Number of uses or charges, when the item supports them." },
      { key: "sound", label: "Sound", help: "Sound played by item effects, when used." }
    ]
  },
  {
    title: "Equipping",
    fields: [
      { key: "st", label: "Strength" },
      { key: "hands", label: "Hands" },
      { key: "lu", label: "Luck" },
      { key: "movement", label: "Move" },
      { key: "ac", label: "Armor" },
      { key: "magicResistance", label: "Magic Res." },
      { key: "spellPoints", label: "S.P." },
      { key: "weight", label: "Weight" }
    ]
  },
  {
    title: "Damage And Resistances",
    fields: [
      { key: "damage", label: "Damage" },
      { key: "blunt", label: "Blunt" },
      { key: "vSmall", label: "Vs. Small" },
      { key: "vLarge", label: "Vs. Large" },
      { key: "heat", label: "Heat" },
      { key: "cold", label: "Cold" },
      { key: "electric", label: "Electric" },
      { key: "vsUndead", label: "Vs. Undead" },
      { key: "vsDemonDevil", label: "Vs. Demon/Devil" },
      { key: "vsEvil", label: "Vs. Evil" }
    ]
  },
];

const SCENARIO_ITEM_SPECIAL_FIELDS: Array<{ key: ScenarioItemNumberKey; label: string; help?: string }> = [
  { key: "special5", label: "Bonus / Amount", help: "Amount used by ability, monster-type, and party-condition effects." },
  { key: "weightPerCharge", label: "Weight / Charge", help: "Weight used per charge for charge-like items." },
  { key: "dropOnEmpty", label: "Drop On Empty", help: "Whether Realmz drops this item when its charges are depleted." }
];

function ScenarioItemEditor({
  record,
  itemId,
  project,
  catalog,
  previewContext,
  itemText,
  onChange,
  onTextChange
}: {
  record: ScenarioItemRecord;
  itemId: number;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  itemText: ItemTextDisplay;
  onChange: (field: ScenarioItemNumberKey | ItemRestrictionKey, value: number) => void;
  onTextChange: (changes: Partial<Pick<ItemTextDisplay, "unidentifiedName" | "identifiedName" | "description">>) => void;
}) {
  const magicalRawValue = Number(record.magical ?? 0);
  const itemOptions = useMemo(() => itemReferenceOptions(project, catalog), [catalog, project]);
  return (
    <section className="scenario-item-editor" aria-label={`Custom item ${itemId} editor`}>
      <header>
        <div>
          <span>Custom Item {itemId}</span>
          <h4>
            <TutorialTip title="Scenario Item Fields" body={CUSTOM_ITEM_HELP} side="right">
              <span>Scenario Item Fields</span>
            </TutorialTip>
          </h4>
        </div>
        <small>Scenario items</small>
      </header>
      <div className="scenario-item-editor-grid">
        <ItemFieldGroup title="Names And Description" className="item-field-group-full item-name-editor">
          <ItemTextInput
            label="Unidentified Name"
            value={itemText.unidentifiedName || itemText.identifiedName || `Item ${itemId}`}
            onCommit={(value) => onTextChange({ unidentifiedName: value })}
          />
          <ItemTextInput
            label="Identified Name"
            value={itemText.identifiedName || itemText.unidentifiedName || `Custom Item ${itemId}`}
            onCommit={(value) => onTextChange({ identifiedName: value })}
          />
          <ItemTextInput
            label="Description"
            value={itemText.description}
            multiline
            onCommit={(value) => onTextChange({ description: value })}
          />
        </ItemFieldGroup>
        {SCENARIO_ITEM_EDIT_GROUPS.map((group) => (
          <ItemFieldGroup
            key={group.title}
            title={group.title}
            className={group.title === "Identity And Use" ? "item-field-group-compact" : undefined}
          >
            {group.fields.map((field) => field.key === "iconId" ? (
              <ItemIconField
                key={field.key}
                value={Number(record.iconId ?? 0)}
                project={project}
                catalog={catalog}
                previewContext={previewContext}
                itemOptions={itemOptions}
                onChange={(value) => onChange("iconId", value)}
              />
            ) : field.key === "type" ? (
              <ItemTypeSelectField
                key={field.key}
                value={Number(record.type ?? 0)}
                onChange={(value) => onChange("type", value)}
              />
            ) : field.key === "sound" ? (
              <ItemSoundField
                key={field.key}
                value={Number(record.sound ?? 0)}
                project={project}
                catalog={catalog}
                previewContext={previewContext}
                onChange={(value) => onChange("sound", value)}
              />
            ) : (
              <ItemNumberInput
                key={field.key}
                label={field.label}
                value={Number(record[field.key] ?? 0)}
                title={field.help}
                onCommit={(value) => onChange(field.key, value)}
              />
            ))}
          </ItemFieldGroup>
        ))}
        <ItemFieldGroup title="Identification And Curse">
          <ItemMagicField
            value={magicalRawValue}
            onChange={(value) => onChange("magical", value)}
          />
          <CursedFormItemField
            value={Number(record.cursedItemId ?? 0)}
            options={itemOptions}
            onChange={(value) => onChange("cursedItemId", value)}
          />
          <ItemCategorySelectEditor
            itemCat0={record.itemCat0}
            itemCat1={record.itemCat1}
            onChange={(itemCat0, itemCat1) => {
              if (itemCat0 !== record.itemCat0) onChange("itemCat0", itemCat0);
              if (itemCat1 !== record.itemCat1) onChange("itemCat1", itemCat1);
            }}
          />
          {magicalRawValue !== 0 && magicalRawValue !== 1 && (
            <ItemFieldNote>
              Magic raw value {magicalRawValue}; Realmz treats any nonzero value as magical. Toggling normalizes it to 1 or 0.
            </ItemFieldNote>
          )}
        </ItemFieldGroup>
        <ItemFieldGroup title="Race And Caste Restrictions" className="item-field-group-full">
          <ItemUseRestrictionEditor
            record={record}
            onChange={(field, value) => onChange(field, value)}
          />
        </ItemFieldGroup>
        <ItemFieldGroup title="Special Behavior" className="item-field-group-full">
          <ItemSpecialBehaviorSummary record={record} />
          <div className="item-special-field-grid">
            <ItemSpecialEffectCodeField
              value={Number(record.special1 ?? 0)}
              onChange={(value) => onChange("special1", value)}
            />
            <ItemNumberInput
              label="Spell / Amount"
              value={Number(record.special2 ?? 0)}
              title="Spell number for spell-storing items, or amount used by condition and attack effects."
              onCommit={(value) => onChange("special2", value)}
            />
            <ItemSpecialAttributeField
              label="Special 3"
              value={Number(record.special3 ?? 0)}
              onChange={(value) => onChange("special3", value)}
            />
            <ItemSpecialAttributeField
              label="Special 4"
              value={Number(record.special4 ?? 0)}
              onChange={(value) => onChange("special4", value)}
            />
            {SCENARIO_ITEM_SPECIAL_FIELDS.map((field) => (
              <ItemNumberInput
                key={field.key}
                label={field.label}
                value={Number(record[field.key] ?? 0)}
                title={field.help}
                onCommit={(value) => onChange(field.key, value)}
              />
            ))}
          </div>
        </ItemFieldGroup>
      </div>
    </section>
  );
}

type ItemRestrictionKey =
  | "raceRestrictions"
  | "casteRestrictions"
  | "specificRace"
  | "specificCaste"
  | "raceClassOnly"
  | "casteClassOnly";

const CASTE_CLASS_LABELS = [
  "Warrior Castes",
  "Thief Castes",
  "Archer Castes",
  "Sorcerer Castes",
  "Priest Castes",
  "Enchanter Castes",
  "Warrior Wizard Castes"
];

function ItemRestrictionSummary({
  itemCat0,
  itemCat1,
  raceRestrictions,
  casteRestrictions,
  specificRace,
  specificCaste,
  raceClassOnly,
  casteClassOnly
}: {
  itemCat0: number;
  itemCat1: number;
  raceRestrictions: number;
  casteRestrictions: number;
  specificRace: number;
  specificCaste: number;
  raceClassOnly: number;
  casteClassOnly: number;
}) {
  return (
    <div className="item-restriction-summary">
      <ItemFact label="Item Categories" value={summarizeItemCategoryLabels(itemCat0, itemCat1, 5)} />
      <ItemFact label="Cannot Use - Race Types" value={summarizeMaskLabels(raceRestrictions, RACE_DESCRIPTOR_LABELS)} />
      <ItemFact label="Can Use Only - Race Types" value={summarizeMaskLabels(raceClassOnly, RACE_DESCRIPTOR_LABELS)} />
      <ItemFact label="Cannot Use - Caste Types" value={summarizeMaskLabels(casteRestrictions, CASTE_CLASS_LABELS)} />
      <ItemFact label="Can Use Only - Caste Types" value={summarizeMaskLabels(casteClassOnly, CASTE_CLASS_LABELS)} />
      <ItemFact label="Specific Race" value={specificRace ? `${specificRace}: ${REALMZ_RACES[specificRace - 1] ?? "Unknown race"}` : "Any"} />
      <ItemFact label="Specific Caste" value={specificCaste ? `${specificCaste}: ${REALMZ_CASTES[specificCaste - 1] ?? "Unknown caste"}` : "Any"} />
    </div>
  );
}

function ItemCategorySelectEditor({
  itemCat0,
  itemCat1,
  onChange
}: {
  itemCat0: number;
  itemCat1: number;
  onChange: (itemCat0: number, itemCat1: number) => void;
}) {
  const selectedIndex = selectedItemCategoryIndex(itemCat0, itemCat1);
  return (
    <label className="item-category-select-editor">
      <span>Category</span>
      <select
        value={selectedIndex == null ? "" : String(selectedIndex)}
        onChange={(event) => {
          const nextIndex = event.currentTarget.value === "" ? null : Number(event.currentTarget.value);
          onChange(...itemCategoryPairForSingleSelection(nextIndex));
        }}
      >
        <option value="">No category</option>
        {ITEM_CATEGORY_LABELS.map((label, index) => (
          <option key={label} value={index}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ItemMagicField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const magical = value !== 0;
  return (
    <label className="item-check-field" title="Realmz checks this as a nonzero magical-item marker.">
      <input
        type="checkbox"
        checked={magical}
        onChange={(event) => onChange(event.currentTarget.checked ? 1 : 0)}
      />
      <span>Detectable As Magical</span>
    </label>
  );
}

function CursedFormItemField({
  value,
  options,
  onChange
}: {
  value: number;
  options: ItemReferenceOption[];
  onChange: (value: number) => void;
}) {
  const selectedOption = options.find((option) => option.value === value);
  return (
    <label className="item-number-input item-field-wide" title="If nonzero, Realmz secretly loads this item as the cursed form while keeping the original item identity hidden until revealed.">
      <span>Cursed Form Item</span>
      <select value={String(value)} onChange={(event) => onChange(Number(event.currentTarget.value))}>
        <option value="0">No cursed form</option>
        {value !== 0 && !selectedOption && <option value={String(value)}>Current item {value}</option>}
        {options.map((option) => (
          <option key={option.key} value={String(option.value)}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function ItemFieldNote({ children }: { children: ReactNode }) {
  return <p className="item-field-note">{children}</p>;
}

function ItemSpecialBehaviorSummary({ record }: { record: ScenarioItemRecord }) {
  const descriptions = describeItemSpecialBehavior(record);
  return (
    <div className="item-special-summary">
      <strong>Known Behavior</strong>
      {descriptions.length ? (
        <ul>
          {descriptions.map((description) => <li key={description}>{description}</li>)}
        </ul>
      ) : (
        <p>No known special behavior fields are set.</p>
      )}
    </div>
  );
}

function ItemSpecialEffectCodeField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const group = specialEffectGroupForValue(value);
  const groupOptions = specialEffectOptionsForGroup(group);
  const hasKnownValue = groupOptions.some((option) => option.value === value);
  return (
    <div className="item-cascade-field item-special-effect-field" title="Primary Realmz special behavior code. Unknown raw values are preserved until changed.">
      <label>
        <span>Special 1</span>
        <select
          value={group}
          onChange={(event) => {
            const nextGroup = event.currentTarget.value as ItemSpecialEffectGroup;
            onChange(defaultSpecialEffectValue(nextGroup, value));
          }}
        >
          <option value="none">No special effect</option>
          <option value="power">Power level</option>
          <option value="addCondition">Add condition</option>
          <option value="removeCondition">Remove condition</option>
          <option value="hitBonus">Hit bonus</option>
          <option value="raw">Raw code</option>
        </select>
      </label>
      {group === "raw" ? (
        <ItemNumberInput label="Raw Code" value={value} onCommit={onChange} />
      ) : group !== "none" && (
        <label>
          <span>{specialEffectDetailLabel(group)}</span>
          <select value={String(value)} onChange={(event) => onChange(Number(event.currentTarget.value))}>
            {!hasKnownValue && <option value={value}>Current code {value}</option>}
            {groupOptions.map((option) => (
              <option key={`${option.value}:${option.label}`} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

type ItemSpecialEffectGroup = "none" | "power" | "addCondition" | "removeCondition" | "hitBonus" | "raw";

function specialEffectGroupForValue(value: number): ItemSpecialEffectGroup {
  if (value === 0) return "none";
  if ((value >= -7 && value <= -1) || value === 8) return "power";
  if (value >= 20 && value <= 59) return "addCondition";
  if (value >= 60 && value <= 99) return "removeCondition";
  if (value >= 120 && value <= 122) return "hitBonus";
  return "raw";
}

function defaultSpecialEffectValue(group: ItemSpecialEffectGroup, currentValue: number) {
  if (group === "none") return 0;
  if (group === "power") return currentValue >= -7 && currentValue <= -1 ? currentValue : -1;
  if (group === "addCondition") return currentValue >= 20 && currentValue <= 59 ? currentValue : 20;
  if (group === "removeCondition") return currentValue >= 60 && currentValue <= 99 ? currentValue : 60;
  if (group === "hitBonus") return currentValue >= 120 && currentValue <= 122 ? currentValue : 120;
  return currentValue;
}

function specialEffectOptionsForGroup(group: ItemSpecialEffectGroup) {
  if (group === "power") {
    return [
      ...Array.from({ length: 7 }, (_, index) => ({ value: -(index + 1), label: `Power level ${index + 1}` })),
      { value: 8, label: "Random power level" }
    ];
  }
  if (group === "addCondition") {
    return CONDITION_LABELS.slice(0, 40).map((label, index) => ({ value: index + 20, label }));
  }
  if (group === "removeCondition") {
    return CONDITION_LABELS.slice(0, 40).map((label, index) => ({ value: index + 60, label }));
  }
  if (group === "hitBonus") {
    return [
      { value: 120, label: "Auto hit" },
      { value: 121, label: "Penetration bonus" },
      { value: 122, label: "Double to-hit bonus" }
    ];
  }
  return [];
}

function specialEffectDetailLabel(group: ItemSpecialEffectGroup) {
  if (group === "power") return "Power";
  if (group === "addCondition") return "Condition";
  if (group === "removeCondition") return "Condition";
  if (group === "hitBonus") return "Bonus";
  return "Value";
}

type ItemSpecialAttributeGroup = "none" | "ability" | "monsterType" | "partyCondition" | "raw";

function ItemSpecialAttributeField({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const group = specialAttributeGroupForValue(value);
  const options = specialAttributeOptionsForGroup(group);
  const hasKnownValue = options.some((option) => option.value === value);
  return (
    <div className="item-cascade-field" title={`${label} companion field for ability, monster-type, and party-condition behavior.`}>
      <label>
        <span>{label}</span>
        <select
          value={group}
          onChange={(event) => {
            const nextGroup = event.currentTarget.value as ItemSpecialAttributeGroup;
            onChange(defaultSpecialAttributeValue(nextGroup, value));
          }}
        >
          <option value="none">No behavior</option>
          <option value="ability">Special ability</option>
          <option value="monsterType">Monster-type bonus</option>
          <option value="partyCondition">Party condition</option>
          <option value="raw">Raw value</option>
        </select>
      </label>
      {group === "raw" ? (
        <ItemNumberInput label="Raw Value" value={value} onCommit={onChange} />
      ) : group !== "none" && (
        <label>
          <span>{specialAttributeDetailLabel(group)}</span>
          <select value={String(value)} onChange={(event) => onChange(Number(event.currentTarget.value))}>
            {!hasKnownValue && <option value={value}>Current value {value}</option>}
            {options.map((option) => (
              <option key={`${option.value}:${option.label}`} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function specialAttributeGroupForValue(value: number): ItemSpecialAttributeGroup {
  if (value === 0) return "none";
  if (value > 0 && value < 16) return "ability";
  if (value < 0) return "monsterType";
  if (value >= 30 && value <= 40) return "partyCondition";
  return "raw";
}

function defaultSpecialAttributeValue(group: ItemSpecialAttributeGroup, currentValue: number) {
  if (group === "none") return 0;
  if (group === "ability") return currentValue > 0 && currentValue < 16 ? currentValue : 1;
  if (group === "monsterType") return currentValue < 0 ? currentValue : -1;
  if (group === "partyCondition") return currentValue >= 30 && currentValue <= 40 ? currentValue : 30;
  return currentValue;
}

function specialAttributeOptionsForGroup(group: ItemSpecialAttributeGroup) {
  if (group === "ability") {
    return Array.from({ length: 15 }, (_, index) => ({ value: index + 1, label: `Ability ${index + 1}` }));
  }
  if (group === "monsterType") {
    return Array.from({ length: 20 }, (_, index) => ({ value: -(index + 1), label: `Monster type ${index + 1}` }));
  }
  if (group === "partyCondition") {
    return Array.from({ length: 11 }, (_, index) => ({ value: index + 30, label: `Party condition ${index + 30}` }));
  }
  return [];
}

function specialAttributeDetailLabel(group: ItemSpecialAttributeGroup) {
  if (group === "ability") return "Ability";
  if (group === "monsterType") return "Monster Type";
  if (group === "partyCondition") return "Condition";
  return "Value";
}

function describeItemSpecialBehavior(record: ScenarioItemRecord) {
  const sp1 = Number(record.special1 ?? 0);
  const sp2 = Number(record.special2 ?? 0);
  const sp3 = Number(record.special3 ?? 0);
  const sp4 = Number(record.special4 ?? 0);
  const sp5 = Number(record.special5 ?? 0);
  const descriptions: string[] = [];
  if (sp1 === -10) {
    descriptions.push(`Inflicts condition ${conditionNameFromOneBasedCode(sp3 - 19)}.`);
  } else if (sp1 >= -7 && sp1 <= -1) {
    descriptions.push(`Power level ${Math.abs(sp1)}.`);
  } else if (sp1 === 8) {
    descriptions.push("Random power level.");
  } else if (sp1 > 19 && sp1 < 60) {
    descriptions.push(`Adds condition ${conditionNameFromZeroBasedCode(sp1 - 20)} by ${sp2}.`);
  } else if (sp1 > 59 && sp1 < 100) {
    descriptions.push(`Removes condition ${conditionNameFromZeroBasedCode(sp1 - 60)} by ${sp2}.`);
  } else if (sp1 === 120) {
    descriptions.push("Always hits in combat.");
  } else if (sp1 === 121) {
    descriptions.push("Penetration weapon; Realmz treats magical plus as doubled for to-hit display.");
  } else if (sp1 === 122) {
    descriptions.push(`Adds attack rounds (${attackBonusText(sp2)}).`);
  } else if (sp1 > 0) {
    descriptions.push(`Unclassified special effect code ${sp1}; raw tuple is preserved.`);
  }
  if (sp2 > 1100) descriptions.push(`Stores spell ${sp2}.`);
  if (sp3 < 0) {
    descriptions.push(`Monster-type hit bonus ${sp5} against type ${Math.abs(sp3)}.`);
  } else if (sp3 > 0 && sp3 < 16) {
    descriptions.push(`Adds character special ability ${sp3} by ${sp5}.`);
  } else if (sp3 >= 30) {
    descriptions.push(`Applies party condition code ${sp3} by ${sp5}.`);
  }
  if (sp4 < 0) {
    descriptions.push(`Secondary monster-type hit bonus ${sp5} against type ${Math.abs(sp4)}.`);
  } else if (sp4 > 0 && sp4 < 16) {
    descriptions.push(`Adds secondary character special ability ${sp4} by ${sp5}.`);
  } else if (sp4 >= 30) {
    descriptions.push(`Applies secondary party condition code ${sp4} by ${sp5}.`);
  }
  if (!descriptions.length && [sp1, sp2, sp3, sp4, sp5].some((value) => value !== 0)) {
    descriptions.push(`Raw special tuple preserved: ${sp1}, ${sp2}, ${sp3}, ${sp4}, ${sp5}.`);
  }
  return descriptions;
}

function conditionNameFromOneBasedCode(code: number) {
  if (code <= 0) return `code ${code}`;
  return `${code}: ${CONDITION_LABELS[code - 1] ?? "Unknown condition"}`;
}

function conditionNameFromZeroBasedCode(code: number) {
  return `${code}: ${CONDITION_LABELS[code] ?? "Unknown condition"}`;
}

function attackBonusText(value: number) {
  if (value === 1) return "+1/2";
  if (value === 2) return "+1";
  if (value === 3) return "+1 1/2";
  if (value === 4) return "+2";
  return `raw value ${value}`;
}

function ItemUseRestrictionEditor({
  record,
  onChange
}: {
  record: ScenarioItemRecord;
  onChange: (field: ItemRestrictionKey, value: number) => void;
}) {
  return (
    <div className="item-use-restriction-editor">
      <div className="item-specific-restrictions">
        <label>
          <span>Specific Race</span>
          <select value={record.specificRace} onChange={(event) => onChange("specificRace", Number(event.currentTarget.value))}>
            <option value={0}>Any race</option>
            {REALMZ_RACES.map((label, index) => (
              <option key={label} value={index + 1}>{index + 1}: {label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Specific Caste</span>
          <select value={record.specificCaste} onChange={(event) => onChange("specificCaste", Number(event.currentTarget.value))}>
            <option value={0}>Any caste</option>
            {REALMZ_CASTES.map((label, index) => (
              <option key={label} value={index + 1}>{index + 1}: {label}</option>
            ))}
          </select>
        </label>
      </div>
      <ItemMaskEditor
        title="Those That Can't Use It"
        groups={[
          { title: "Race Restrictions", field: "raceRestrictions", labels: RACE_DESCRIPTOR_LABELS, value: record.raceRestrictions },
          { title: "Caste Restrictions", field: "casteRestrictions", labels: CASTE_CLASS_LABELS, value: record.casteRestrictions }
        ]}
        onChange={onChange}
      />
      <ItemMaskEditor
        title="Those That Can Use It"
        groups={[
          { title: "Race Restrictions", field: "raceClassOnly", labels: RACE_DESCRIPTOR_LABELS, value: record.raceClassOnly },
          { title: "Caste Restrictions", field: "casteClassOnly", labels: CASTE_CLASS_LABELS, value: record.casteClassOnly }
        ]}
        onChange={onChange}
      />
    </div>
  );
}

function ItemMaskEditor({
  title,
  groups,
  onChange
}: {
  title: string;
  groups: Array<{ title: string; field: ItemRestrictionKey; labels: string[]; value: number }>;
  onChange: (field: ItemRestrictionKey, value: number) => void;
}) {
  return (
    <section className="item-mask-editor">
      <header>{title}</header>
      {groups.map((group) => (
        <div key={group.field}>
          <h5>{group.title}</h5>
          <div className="item-bit-editor">
            {group.labels.map((label, index) => {
              const checked = bitFromMask(group.value, index);
              return (
                <label key={label} className={checked ? "checked" : ""}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => onChange(group.field, setBitInMask(group.value, index, event.currentTarget.checked))}
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

function bitFromMask(value: number, bit: number) {
  return Boolean((value >>> 0) & (1 << bit));
}

function setBitInMask(value: number, bit: number, checked: boolean) {
  const next = checked ? ((value >>> 0) | (1 << bit)) : ((value >>> 0) & ~(1 << bit));
  return toSigned16(next);
}

function bitFromPair(itemCat0: number, itemCat1: number, bit: number) {
  const source = bit < 32 ? itemCat0 : itemCat1;
  return Boolean((source >>> 0) & (1 << (bit % 32)));
}

function setBitInPair(itemCat0: number, itemCat1: number, bit: number, checked: boolean): [number, number] {
  if (bit < 32) return [toSigned32(setUnsignedBit(itemCat0, bit, checked)), itemCat1];
  return [itemCat0, toSigned32(setUnsignedBit(itemCat1, bit - 32, checked))];
}

function itemCategoryStorageBit(index: number) {
  return 31 - (index % 32);
}

function itemCategoryBitFromPair(itemCat0: number, itemCat1: number, index: number) {
  const source = index < 32 ? itemCat0 : itemCat1;
  return Boolean((source >>> 0) & (1 << itemCategoryStorageBit(index)));
}

function setItemCategoryBitInPair(itemCat0: number, itemCat1: number, index: number, checked: boolean): [number, number] {
  const bit = itemCategoryStorageBit(index);
  if (index < 32) return [toSigned32(setUnsignedBit(itemCat0, bit, checked)), itemCat1];
  return [itemCat0, toSigned32(setUnsignedBit(itemCat1, bit, checked))];
}

function selectedItemCategoryIndex(itemCat0: number, itemCat1: number) {
  const selected = ITEM_CATEGORY_LABELS.findIndex((_, index) => itemCategoryBitFromPair(itemCat0, itemCat1, index));
  return selected >= 0 ? selected : null;
}

function itemCategoryPairForSingleSelection(index: number | null): [number, number] {
  if (index == null || !Number.isFinite(index)) return [0, 0];
  return setItemCategoryBitInPair(0, 0, Math.trunc(index), true);
}

function setUnsignedBit(value: number, bit: number, checked: boolean) {
  return checked ? ((value >>> 0) | (1 << bit)) : ((value >>> 0) & ~(1 << bit));
}

function toSigned16(value: number) {
  const unsigned = value & 0xffff;
  return unsigned > 0x7fff ? unsigned - 0x10000 : unsigned;
}

function toSigned32(value: number) {
  return value | 0;
}

function summarizeMaskLabels(mask: number, labels: string[]) {
  return summarizeBitLabels([mask], labels, 4);
}

function summarizeBitLabels(values: number[], labels: string[], limit: number) {
  const selected = labels.filter((_, index) => bitFromPair(values[0] ?? 0, values[1] ?? 0, index));
  if (!selected.length) return "None";
  if (selected.length <= limit) return selected.join(", ");
  return `${selected.slice(0, limit).join(", ")} +${selected.length - limit} more`;
}

function summarizeItemCategoryLabels(itemCat0: number, itemCat1: number, limit: number) {
  const selected = ITEM_CATEGORY_LABELS.filter((_, index) => itemCategoryBitFromPair(itemCat0, itemCat1, index));
  if (!selected.length) return "None";
  if (selected.length <= limit) return selected.join(", ");
  return `${selected.slice(0, limit).join(", ")} +${selected.length - limit} more`;
}

const ITEM_TYPE_LABELS: Record<number, string> = {
  0: "Ring",
  1: "Do not use",
  2: "Melee Weapon",
  3: "Shield",
  4: "Armor and Robe",
  5: "Gauntlet and Gloves",
  6: "Cloak and Cape",
  7: "Helmet and Cap",
  8: "Ion Stone",
  9: "Boots",
  10: "Quiver",
  11: "Waist and Belt",
  12: "Neck",
  13: "Scroll Case",
  14: "Misc Item",
  15: "Missile Weapon",
  16: "Broach",
  17: "Face and Mask",
  18: "Scabbard",
  19: "Belt Loop",
  20: "Scroll",
  21: "Magic Item",
  22: "Supply Item",
  23: "Action Point Item (SP5 = AP ID)",
  24: "Identified Item",
  25: "Scenario Item"
};

function itemTypeLabel(value: number) {
  const abs = Math.abs(value);
  if (ITEM_TYPE_LABELS[abs]) return ITEM_TYPE_LABELS[abs];
  return `Raw type ${value}`;
}

function itemTypeText(value: number | null | undefined) {
  if (value == null) return "unknown";
  return `${value}: ${itemTypeLabel(value)}`;
}

const ITEM_TYPE_OPTIONS = Array.from({ length: 26 }, (_, value) => ({ value, label: itemTypeLabel(value) }));

export const SHOP_ITEM_CATEGORY_OPTIONS: Array<{ id: ItemReferenceCategory | "all"; label: string; range?: string }> = [
  { id: "all", label: "All Items" },
  ...ITEM_REFERENCE_CATEGORIES
];

function ItemIconField({
  value,
  project,
  catalog,
  previewContext,
  itemOptions,
  onChange
}: {
  value: number;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  itemOptions: ItemReferenceOption[];
  onChange: (value: number) => void;
}) {
  const previewUrl = useIconPreviewUrl(value, project, catalog, previewContext);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => setFailedUrl(null), [previewUrl]);
  const usableUrl = previewUrl && previewUrl !== failedUrl ? previewUrl : null;
  return (
    <div className="item-icon-field">
      <label className="item-number-input" title="CICN resource ID drawn for this item in Realmz lists and menus.">
        <span>Icon</span>
        <span className="item-icon-field-control">
          <button
            type="button"
            className="item-icon-preview item-icon-preview-button"
            title={value ? `Choose cicn icon; current ${value}` : "Choose cicn icon"}
            onClick={() => setPickerOpen(true)}
          >
            {usableUrl ? <img src={usableUrl} alt="" onError={() => setFailedUrl(usableUrl)} /> : <i>{value || "-"}</i>}
          </button>
          <input
            type="number"
            value={value}
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              if (Number.isFinite(next)) onChange(Math.trunc(next));
            }}
          />
        </span>
      </label>
      {pickerOpen && (
        <ItemIconPickerModal
          value={value}
          project={project}
          catalog={catalog}
          previewContext={previewContext}
          itemOptions={itemOptions}
          onChoose={(nextValue) => {
            onChange(nextValue);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

type ItemIconPickerChoice = {
  id: number;
  label: string;
  detail: string;
};

function ItemIconPickerModal({
  value,
  project,
  catalog,
  previewContext,
  itemOptions,
  onChoose,
  onClose
}: {
  value: number;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  itemOptions: ItemReferenceOption[];
  onChoose: (value: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const choices = useMemo(() => itemIconPickerChoices(project, catalog, itemOptions), [catalog, itemOptions, project]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredChoices = choices.filter((choice) => !normalizedQuery || String(choice.id).includes(normalizedQuery) || choice.label.toLowerCase().includes(normalizedQuery) || choice.detail.toLowerCase().includes(normalizedQuery));
  const visibleChoices = filteredChoices.slice(0, 160);
  return (
    <div className="item-icon-picker-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="item-icon-picker-modal" role="dialog" aria-modal="true" aria-label="Choose item icon" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <strong>Choose Icon</strong>
            <small>{choices.length} cicn option(s)</small>
          </div>
          <button type="button" className="btn btn-secondary btn-xs" onClick={onClose}>Close</button>
        </header>
        <SearchField className="item-icon-picker-search" value={query} onChange={setQuery}
          placeholder="Search cicn ID, item, or source..." ariaLabel="Search item icons"
          resultCount={filteredChoices.length} resultNoun="icon" status={filteredChoices.length > visibleChoices.length ? `${visibleChoices.length} shown` : undefined} autoFocus />
        <div className="item-icon-picker-grid">
          {visibleChoices.map((choice) => (
            <ItemIconPickerButton
              key={`${choice.id}:${choice.label}`}
              choice={choice}
              selected={choice.id === value}
              project={project}
              catalog={catalog}
              previewContext={previewContext}
              onChoose={onChoose}
            />
          ))}
        </div>
        {filteredChoices.length > visibleChoices.length && <small>{filteredChoices.length - visibleChoices.length} more matching icon(s); search to narrow.</small>}
      </section>
    </div>
  );
}

function ItemIconPickerButton({
  choice,
  selected,
  project,
  catalog,
  previewContext,
  onChoose
}: {
  choice: ItemIconPickerChoice;
  selected: boolean;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  onChoose: (value: number) => void;
}) {
  const previewUrl = useIconPreviewUrl(choice.id, project, catalog, previewContext);
  return (
    <button
      type="button"
      className={`item-icon-picker-option${selected ? " selected" : ""}`}
      onClick={() => onChoose(choice.id)}
    >
      <span className="item-icon-preview">
        {previewUrl ? <img src={previewUrl} alt="" /> : <i>{choice.id}</i>}
      </span>
      <strong>{choice.id}</strong>
      <small>{choice.label}</small>
    </button>
  );
}

function itemIconPickerChoices(project: Project, catalog: LibraryCatalog | null | undefined, itemOptions: ItemReferenceOption[]) {
  const choices = new Map<number, ItemIconPickerChoice>();
  const addChoice = (id: number | null | undefined, label: string, detail: string) => {
    if (id == null || id === 0 || !Number.isFinite(id)) return;
    const normalizedId = Math.trunc(id);
    const existing = choices.get(normalizedId);
    if (existing) {
      if (!existing.label.includes(label)) existing.detail = [existing.detail, detail].filter(Boolean).join(" | ");
      return;
    }
    choices.set(normalizedId, { id: normalizedId, label, detail });
  };
  for (const option of itemOptions) addChoice(option.iconId, option.label.replace(/\s+\(-?\d+\)$/, ""), `item ${option.value}`);
  for (const asset of project.assets ?? []) {
    if (asset.kind === "icon" || asset.resourceType.trim() === "cicn") addChoice(asset.resourceId, asset.label, "project icon");
  }
  for (const asset of project.assetCatalog.icons ?? []) {
    addChoice(asset.resourceId, asset.name || `cicn ${asset.resourceId}`, asset.source || "project catalog");
  }
  for (const asset of catalog?.assets ?? []) {
    const resourceType = (asset.resourceType ?? "").trim();
    if (asset.resourceId != null && (asset.type === "icon" || asset.type.includes("icon") || resourceType === "cicn")) {
      addChoice(asset.resourceId, asset.label, asset.source || "library icon");
    }
  }
  return [...choices.values()].sort((a, b) => Math.abs(a.id) - Math.abs(b.id) || a.id - b.id);
}

function ItemTypeSelectField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const hasOption = ITEM_TYPE_OPTIONS.some((option) => option.value === value);
  return (
    <label className="item-number-input item-type-select" title="Realmz equipment/use type. This is separate from the item category restriction list.">
      <span>Type</span>
      <select value={String(value)} onChange={(event) => onChange(Number(event.currentTarget.value))}>
        {!hasOption && <option value={String(value)}>{itemTypeText(value)}</option>}
        {ITEM_TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={String(option.value)}>{option.value}: {option.label}</option>
        ))}
      </select>
    </label>
  );
}

function ItemSoundField({
  value,
  project,
  catalog,
  previewContext,
  onChange
}: {
  value: number;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  onChange: (value: number) => void;
}) {
  const previewUrl = useItemSoundPreviewUrl(value, project, catalog, previewContext);
  return (
    <div className="item-sound-field">
      <ItemNumberInput label="Sound" value={value} onCommit={onChange} />
      <button
        type="button"
        className="btn btn-secondary btn-xs"
        disabled={!previewUrl}
        title={previewUrl ? `Play snd ${Math.abs(value)}` : "No playable sound preview is available."}
        onClick={() => previewUrl && playPreviewUrl(previewUrl)}
      >
        Play
      </button>
    </div>
  );
}

function useItemSoundPreviewUrl(
  soundId: number,
  project: Project,
  catalog: LibraryCatalog | null | undefined,
  previewContext: PreviewRuntimeContext
) {
  const resourceId = soundId ? Math.abs(soundId) : null;
  const managedAsset = resourceId == null ? null : (project.assets ?? []).find((asset) =>
    asset.kind === "sound" &&
    Math.abs(asset.resourceId) === resourceId
  ) ?? null;
  const projectAsset = resourceId == null ? null : (project.assetCatalog.sounds ?? []).find((asset) =>
    Math.abs(asset.resourceId) === resourceId
  ) ?? null;
  const libraryAsset = resourceId == null ? null : catalog?.assets.find((asset) =>
    (asset.type === "sound" || (asset.resourceType ?? "").trim() === "snd") &&
    asset.resourceId != null &&
    Math.abs(asset.resourceId) === resourceId
  ) ?? null;
  return useResolvedPreviewUrl(
    managedAsset?.previewPath ?? projectAsset?.previewPath ?? libraryAsset?.previewPath ?? null,
    managedAsset,
    libraryAsset,
    { ...previewContext, project, resourceType: "snd ", resourceId }
  );
}

export function ItemNumberInput({
  label,
  value,
  title,
  onCommit
}: {
  label: string;
  value: number;
  title?: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  const commit = () => {
    const next = Number(draft);
    if (!Number.isFinite(next)) {
      setDraft(String(value));
      return;
    }
    const normalized = Math.trunc(next);
    setDraft(String(normalized));
    if (normalized !== value) onCommit(normalized);
  };
  return (
    <label className="item-number-input" title={title}>
      <span>{label}</span>
      <input
        type="number"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setDraft(String(value));
        }}
      />
    </label>
  );
}

function ItemTextInput({
  label,
  value,
  multiline = false,
  onCommit
}: {
  label: string;
  value: string;
  multiline?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  const commonProps = {
    value: draft,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.currentTarget.value),
    onBlur: commit,
    onKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === "Escape") setDraft(value);
      if (!multiline && event.key === "Enter") event.currentTarget.blur();
    }
  };
  return (
    <label className={`item-text-input${multiline ? " item-text-input-multiline" : ""}`}>
      <span>{label}</span>
      {multiline ? <textarea {...commonProps} /> : <input type="text" {...commonProps} />}
    </label>
  );
}

function scenarioItemRecordFor(project: Project, itemId: number) {
  return (project.scenarioItems ?? []).find((record) => scenarioItemId(record) === itemId) ?? null;
}

function scenarioItemId(record: ScenarioItemRecord) {
  return record.itemId || 800 + record.id;
}

function customItemRecordId(itemId: number) {
  return itemId >= 900 && itemId < 1000 ? itemId - 800 : null;
}

function nextCustomItemId(project: Project) {
  const used = new Set(
    (project.scenarioItems ?? [])
      .filter((record) => customItemRecordId(scenarioItemId(record)) !== null && scenarioItemSlotInUse(record))
      .map((record) => scenarioItemId(record))
  );
  for (let itemId = 900; itemId < 1000; itemId += 1) {
    if (!used.has(itemId)) return itemId;
  }
  return null;
}

function scenarioItemSlotInUse(record: ScenarioItemRecord) {
  const canonicalItemId = 800 + record.id;
  const numericFields: Array<keyof ScenarioItemRecord> = [
    "iconId",
    "type",
    "st",
    "blunt",
    "hands",
    "lu",
    "movement",
    "ac",
    "magicResistance",
    "damage",
    "spellPoints",
    "sound",
    "weight",
    "cost",
    "charge",
    "cursedItemId",
    "magical",
    "itemCat0",
    "itemCat1",
    "raceRestrictions",
    "casteRestrictions",
    "specificRace",
    "specificCaste",
    "raceClassOnly",
    "casteClassOnly",
    "vSmall",
    "vLarge",
    "heat",
    "cold",
    "electric",
    "vsUndead",
    "vsDemonDevil",
    "vsEvil",
    "special1",
    "special2",
    "special3",
    "special4",
    "special5",
    "weightPerCharge",
    "dropOnEmpty"
  ];
  const hasItemFields = numericFields.some((field) => Number(record[field] ?? 0) !== 0);
  return record.itemId !== canonicalItemId || hasItemFields;
}

function scenarioItemSummary(record: ScenarioItemRecord): Record<string, unknown> {
  return {
    itemId: scenarioItemId(record),
    iconId: record.iconId,
    type: record.type,
    st: record.st,
    blunt: record.blunt,
    hands: record.hands,
    lu: record.lu,
    movement: record.movement,
    ac: record.ac,
    magicResistance: record.magicResistance,
    damage: record.damage,
    spellPoints: record.spellPoints,
    sound: record.sound,
    weight: record.weight,
    cost: record.cost,
    charge: record.charge,
    cursedItemId: record.cursedItemId,
    magical: record.magical,
    itemCat0: record.itemCat0,
    itemCat1: record.itemCat1,
    raceRestrictions: record.raceRestrictions,
    casteRestrictions: record.casteRestrictions,
    specificRace: record.specificRace,
    specificCaste: record.specificCaste,
    raceClassOnly: record.raceClassOnly,
    casteClassOnly: record.casteClassOnly,
    vSmall: record.vSmall,
    vLarge: record.vLarge,
    heat: record.heat,
    cold: record.cold,
    electric: record.electric,
    vsUndead: record.vsUndead,
    vsDemonDevil: record.vsDemonDevil,
    vsEvil: record.vsEvil,
    special1: record.special1,
    special2: record.special2,
    special3: record.special3,
    special4: record.special4,
    special5: record.special5,
    weightPerCharge: record.weightPerCharge,
    dropOnEmpty: record.dropOnEmpty
  };
}

function scenarioItemChangesFromSummary(summary: Record<string, unknown>): Partial<ScenarioItemRecord> {
  const changes: Partial<ScenarioItemRecord> = {};
  for (const group of SCENARIO_ITEM_EDIT_GROUPS) {
    for (const field of group.fields) {
      const value = numberField(summary, field.key);
      if (value != null) changes[field.key] = value as never;
    }
  }
  const restrictionKeys: ItemRestrictionKey[] = [
    "raceRestrictions",
    "casteRestrictions",
    "specificRace",
    "specificCaste",
    "raceClassOnly",
    "casteClassOnly"
  ];
  for (const key of restrictionKeys) {
    const value = numberField(summary, key);
    if (value != null) changes[key] = value as never;
  }
  for (const key of ["itemCat0", "itemCat1"] as const) {
    const value = numberField(summary, key);
    if (value != null) changes[key] = value;
  }
  return changes;
}

function emptyScenarioItemForUi(id: number): ScenarioItemRecord {
  return {
    id,
    itemId: 800 + id,
    iconId: 0,
    type: 0,
    st: 0,
    blunt: 0,
    hands: 0,
    lu: 0,
    movement: 0,
    ac: 0,
    magicResistance: 0,
    damage: 0,
    spellPoints: 0,
    sound: 0,
    weight: 0,
    cost: 0,
    charge: 0,
    cursedItemId: 0,
    magical: 0,
    itemCat0: 0,
    itemCat1: 0,
    raceRestrictions: 0,
    casteRestrictions: 0,
    specificRace: 0,
    specificCaste: 0,
    raceClassOnly: 0,
    casteClassOnly: 0,
    spare2: new Array(7).fill(0),
    vSmall: 0,
    vLarge: 0,
    heat: 0,
    cold: 0,
    electric: 0,
    vsUndead: 0,
    vsDemonDevil: 0,
    vsEvil: 0,
    special1: 0,
    special2: 0,
    special3: 0,
    special4: 0,
    special5: 0,
    weightPerCharge: 0,
    dropOnEmpty: 0,
    rawBytes: new Array(100).fill(0),
    authored: true
  };
}

function itemIdFromEntityId(entityId: string) {
  const match = entityId.match(/^item:(-?\d+)$/);
  return match ? Number(match[1]) : null;
}

function findItemCatalogEntity(project: Project, catalog: LibraryCatalog | null | undefined, itemId: number) {
  const entities = [
    ...(catalog?.entities ?? [])
  ];
  return entities.find((entity) => {
    if (entity.type !== "item" && entity.type !== "item-reference") return false;
    const summaryId = numberField(entity.summary, "itemId") ?? numberField(entity.summary, "id") ?? trailingNumber(entity.id);
    return summaryId === itemId;
  }) ?? null;
}

function itemUsageLinks(project: Project, itemId: number) {
  const links: Array<{ target: string; label: string; detail: string }> = [];
  for (const treasure of project.treasures ?? []) {
    const slots = treasure.itemIds.map((id, slot) => id === itemId ? slot : -1).filter((slot) => slot >= 0);
    if (slots.length) links.push({ target: `treasure:${treasure.id}`, label: `Treasure ${treasure.id}`, detail: `slot${slots.length === 1 ? "" : "s"} ${slots.join(", ")}` });
  }
  for (const shop of project.shops ?? []) {
    const quantity = shop.itemIds.reduce((total, id, slot) => id === itemId ? total + Math.max(0, shop.quantities[slot] ?? 0) : total, 0);
    if (quantity) links.push({ target: `shop:${shop.id}`, label: `Shop ${shop.id}`, detail: `${quantity} in stock` });
  }
  return links.slice(0, 18);
}

function numberField(summary: Record<string, unknown>, key: string) {
  const value = summary[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value);
  return null;
}

function numberText(summary: Record<string, unknown>, key: string) {
  const value = numberField(summary, key);
  return value == null ? "none" : String(value);
}

function costText(cost: number | null) {
  if (cost == null) return "none";
  if (cost < 0) return `${Math.abs(cost)} gp, unique`;
  return `${cost} gp`;
}

function itemFamilyLabel(itemId: number) {
  const abs = Math.abs(itemId);
  if (abs > 0 && abs < 200) return "Weapons";
  if (abs >= 200 && abs < 400) return "Armor";
  if (abs >= 400 && abs < 600) return "Accessories";
  if (abs >= 600 && abs < 800) return "Magic";
  if (abs >= 800 && abs < 1000) return "Supplies / Special";
  return "Unknown item family";
}

function itemEditRangeLabel(itemId: number) {
  const abs = Math.abs(itemId);
  if (abs >= 900 && abs < 1000) return "Custom item range";
  if (abs >= 800 && abs < 900) return "Supply item";
  return "Built-in item";
}

function trailingNumber(value: string) {
  const match = value.match(/(-?\d+)(?!.*\d)/);
  return match ? Number(match[1]) : null;
}
