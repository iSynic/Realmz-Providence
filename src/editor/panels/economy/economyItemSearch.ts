import {
  filterItemReferenceOptions,
  type ItemReferenceCategory,
  type ItemReferenceOption
} from "../../itemReferences";

export function filterEconomyItemOptions(
  options: ItemReferenceOption[],
  category: ItemReferenceCategory | "all",
  query: string
) {
  return filterItemReferenceOptions(options, query)
    .filter((option) => category === "all" || option.category === category);
}
