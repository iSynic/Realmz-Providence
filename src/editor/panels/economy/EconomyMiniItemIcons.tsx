import { itemCategoryBadge, type ItemReferenceOption } from "../../itemReferences";
import { itemOptionName } from "./economyRecordModel";

export function EconomyMiniItemIcons({
  itemIds,
  optionsByValue
}: {
  itemIds: number[];
  optionsByValue: Map<number, ItemReferenceOption>;
}) {
  return (
    <span className="treasure-mini-icons" aria-hidden="true">
      {itemIds.length ? itemIds.map((itemId, index) => {
        const option = optionsByValue.get(itemId);
        return <EconomyMiniItemBadge key={`${itemId}:${index}`} itemId={itemId} option={option} />;
      }) : <em>empty</em>}
    </span>
  );
}

function EconomyMiniItemBadge({ itemId, option }: { itemId: number; option?: ItemReferenceOption }) {
  return (
    <i title={option ? `${itemOptionName(option)} (${itemId})` : `Item ${itemId}`}>
      {option ? itemCategoryBadge(option.category) : itemId}
    </i>
  );
}
