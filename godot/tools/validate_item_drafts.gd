extends SceneTree

var _pending := Callable()
var _failed := false
var _view: ProvidenceItemEditor
var _items: Array = []


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	root.gui_embed_subwindows = true
	_view = load("res://src/item_editor.tscn").instantiate(); root.add_child(_view)
	_items = [_item(800, "First item"), _item(801, "Second item")]
	_view.set_items(_items, 1)
	_view.navigation_requested.connect(func(action: Callable): _pending = action)
	_view.open_handler = func(identity: String):
		for item in _items:
			if item.id == identity: _view.bind_document({"item": item, "revision": 1, "editable": true}); return {"ok": true}
		return {"ok": false}
	var names: LineEdit = _view.form.control_for("name")
	_check(not _view.has_unapplied_changes(), "Binding a retained document cannot create a phantom draft")
	names.text = "Unsaved first item"; names.text_changed.emit(names.text)
	await _view.open_item("classic.item.801")
	_check(_pending.is_valid() and names.text == "Unsaved first item", "Different-record navigation keeps the local draft until resolved")
	_pending = Callable(); await _view.open_item("classic.item.800")
	_check(not _pending.is_valid() and names.text == "Unsaved first item", "Opening the current item is a no-op")
	var list = _view.get_node("%ItemCollection")
	list.select(1); list.item_selected.emit(1)
	_check(_pending.is_valid() and list.get_selected_items() == PackedInt32Array([0]), "Dirty selection restores the originating highlight")
	_pending = Callable()
	var search: LineEdit = _view.get_node("%ItemSearch")
	search.text = "no match"; search.text_changed.emit(search.text)
	await create_timer(0.2).timeout
	_view.show_catalog({"items": [], "total": 0})
	_check(_view.has_unapplied_changes() and names.text == "Unsaved first item" and _view.selected_definition().classicId == 800, "Filtering to no results keeps the open local draft")
	_view.get_node("%ScenarioSource").pressed.emit()
	_view.get_node("Body/Inventory/Margin/Master/Categories/Weapons").pressed.emit()
	_view.find_child("AllItems", true, false).pressed.emit()
	_check(_view.catalog_query().scope == "scenario" and _view.catalog_query().category == "all" and _view.catalog_query().query == "no match", "All Items resets category without changing source, search or draft")
	_view.discard_draft()
	_check(names.text == "First item" and not _view.has_unapplied_changes(), "Discard restores the exact acknowledged document")
	await _view.open_item("classic.item.801")
	_check(_view.selected_definition().classicId == 801, "Clean linked opening selects the exact identity")
	var state := _view.read_navigation_state()
	_view.form.show_section("Equipment")
	_check(await _view.restore_navigation_state(state), "Return restores the originating item location")
	_view.free(); await process_frame
	if not _failed: print("PROVIDENCE_ITEM_DRAFTS_OK dirty-cancel current-no-op highlight filtered-draft source-category-query exact-open return discard")
	quit(1 if _failed else 0)


func _item(id: int, label: String) -> Dictionary:
	return {"id": "classic.item.%d" % id, "classicId": id, "name": label, "unidentifiedName": "Unknown item", "description": "", "special": [0, 0, 0, 0, 0], "cost": 0}


func _check(condition: bool, message: String) -> void:
	if not condition: _failed = true; push_error("PROVIDENCE_ITEM_DRAFTS_FAILED: " + message)
