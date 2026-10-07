extends RefCounted


static func select_summary(list: ItemList, summaries: Array, identity: String) -> void:
	list.deselect_all()
	for index in list.item_count:
		var source_index := int(list.get_item_metadata(index))
		if source_index >= 0 and source_index < summaries.size() and summaries[source_index].get("identity") == identity:
			list.select(index)
			list.ensure_current_is_visible()
			return


static func focus_action(tree: Tree, target: SpinBox, slot: int, focus: bool = true) -> bool:
	if tree.get_root() == null: return false
	var item := tree.get_root().get_first_child()
	while item != null:
		var metadata: Variant = item.get_metadata(0)
		if metadata is Dictionary and int(metadata.get("slot", -1)) == slot:
			item.select(0)
			tree.item_selected.emit()
			tree.scroll_to_item(item)
			if focus: target.get_line_edit().grab_focus()
			return true
		item = item.get_next()
	return false


static func catalog_identity(items: Array, query: String, preferred: String, id_field: String) -> String:
	var filter := query.strip_edges().to_lower()
	var visible: Array = items.filter(func(row):
		return filter.is_empty() or ("%s %s" % [str(row.get(id_field, "")), str(row.get("label", ""))]).to_lower().contains(filter))
	for row in visible:
		if row.get("identity", "") == preferred: return preferred
	if preferred.is_empty():
		for row in visible:
			if int(row.get("problems", 0)) > 0: return str(row.get("identity", ""))
	return "" if visible.is_empty() else str(visible[0].get("identity", ""))
