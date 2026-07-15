import { useEffect, useMemo, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { TutorialTip } from "../../components/TutorialTip";
import { ITEM_REFERENCE_CATEGORIES, itemReferenceOptions, itemTextDisplay, type ItemReferenceCategory, type ItemReferenceOption, type ItemTextDisplay } from "../../itemReferences";
import type { PreviewRuntimeContext } from "../../previewUrls";
import type { LibraryCatalog, LibraryEntity, Project, ProjectCommand, ScenarioItemRecord, SelectedEntity, SemanticEntity } from "../../types";
import { selectEntityFromId } from "../../utils";
import { IncrementalListFooter, ScrollArea, SearchField } from "../../ui";
import { renderListKey } from "../../renderKeys";
import { filterEconomyItemOptions } from "./economyItemSearch";
import { EconomyItemReferenceField, economyItemReferenceOptions } from "./EconomyItemReferenceField";
import {
  ItemCategoryReferenceField,
  ItemTypeReferenceField,
  itemTypeText
} from "./ItemClassificationFields";
import { ItemIconField } from "./ItemIconField";
import { ItemNumberInput } from "./ItemNumberInput";
import { ItemOptionIcon, useDeferredItemReferenceOptions } from "./ItemReferencePresentation";
import { ItemSoundField } from "./ItemSoundField";
import { ItemSpecialBehaviorEditor } from "./ItemSpecialBehaviorFields";
import {
  ItemRestrictionSummary,
  ItemUseRestrictionEditor,
  type ItemRestrictionKey
} from "./ItemUseRestrictionFields";

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
            <IncrementalListFooter
              visibleCount={visibleOptions.length}
              totalCount={filteredOptions.length}
              step={240}
              noun="item reference"
              onShowMore={() => setVisibleLimit((limit) => limit + 240)}
            />
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
  const itemReferencePickerOptions = useMemo(
    () => economyItemReferenceOptions(itemOptions, project, catalog, previewContext),
    [catalog, itemOptions, previewContext, project]
  );
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
              <ItemTypeReferenceField
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
            referenceOptions={itemReferencePickerOptions}
            project={project}
            catalog={catalog}
            previewContext={previewContext}
            onChange={(value) => onChange("cursedItemId", value)}
          />
          <ItemCategoryReferenceField
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
          <ItemSpecialBehaviorEditor record={record} onChange={(field, value) => onChange(field, value)} />
        </ItemFieldGroup>
      </div>
    </section>
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
  referenceOptions,
  project,
  catalog,
  previewContext,
  onChange
}: {
  value: number;
  options: ItemReferenceOption[];
  referenceOptions: ReturnType<typeof economyItemReferenceOptions>;
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  onChange: (value: number) => void;
}) {
  const selectedOption = options.find((option) => option.value === value);
  return (
    <div className="item-number-input item-field-wide" title="If nonzero, Realmz secretly loads this item as the cursed form while keeping the original item identity hidden until revealed.">
      <span>Cursed Form Item</span>
      <EconomyItemReferenceField
        value={value}
        option={selectedOption}
        options={referenceOptions}
        ariaLabel="Search cursed form item"
        panelTitle="Cursed Form Item"
        storageKey="economy.item.cursed-form.picker.position"
        emptyLabel="No cursed form"
        emptyDetail="Realmz does not substitute another item when this item is cursed."
        clearLabel="Clear cursed form item"
        project={project}
        catalog={catalog}
        previewContext={previewContext}
        onChange={onChange}
      />
    </div>
  );
}

function ItemFieldNote({ children }: { children: ReactNode }) {
  return <p className="item-field-note">{children}</p>;
}

export const SHOP_ITEM_CATEGORY_OPTIONS: Array<{ id: ItemReferenceCategory | "all"; label: string; range?: string }> = [
  { id: "all", label: "All Items" },
  ...ITEM_REFERENCE_CATEGORIES
];

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
