class_name ProvidenceItemEditor
extends VBoxContainer

signal item_update_requested(record_index: int, definition: Dictionary)
signal compile_requested
signal selection_changed(definition: Dictionary)
signal navigation_requested(action: Callable)
signal return_to_assets_requested
signal artwork_choice_requested
signal save_requested
signal save_as_requested
signal catalog_requested(query: Dictionary)
signal catalog_presented(rows: Array, revision: int)
signal catalog_loading
signal open_requested(identity: String)
signal record_requested(kind: String)
signal reference_requested(field: String)
signal sound_preview_requested
signal recovery_requested
signal used_by_requested(reference: Dictionary)
signal used_by_page_requested(offset: int)
signal draft_edited

var draft := preload("res://src/item_record_draft.gd").new()
var uses_handler: Callable
var commit_handler: Callable
var open_handler: Callable
var _items: Array = []
var _query := {"scope": "all", "category": "all", "query": "", "offset": 0, "limit": 8}
var _total := 0
var _locked := false
var _pending := false
var _valid := true
var _uses_offset := 0
var _uses_count := 0
@onready var form = %ItemForm
# Use explicit paths across the instanced form boundary in exported scenes.
@onready var _uses_previous = $Body/Center/ItemForm/BodyScroll/Sections/UsedBy/Body/UsesPages/UsesPrevious
@onready var _uses_next = $Body/Center/ItemForm/BodyScroll/Sections/UsedBy/Body/UsesPages/UsesNext
@onready var _uses_pages = $Body/Center/ItemForm/BodyScroll/Sections/UsedBy/Body/UsesPages
@onready var _uses_page = $Body/Center/ItemForm/BodyScroll/Sections/UsedBy/Body/UsesPages/UsesPage
@onready var _used_by_count = $Body/Center/ItemForm/BodyScroll/Sections/UsedBy/Body/UsedByCount
@onready var _uses = $Body/Center/ItemForm/BodyScroll/Sections/UsedBy/Body/Uses


func _ready() -> void:
	$EconomyNavigation.configure("economy.items")
	draft.changed.connect(_draft_changed)
	form.field_edited.connect(_field_edited)
	form.reference_requested.connect(reference_requested.emit)
	form.sound_preview_requested.connect(sound_preview_requested.emit)
	%ItemSearch.text_changed.connect(func(text: String):
		if _locked: return
		_query.query = text; _query.offset = 0; $SearchDelay.start())
	$SearchDelay.timeout.connect(func(): catalog_requested.emit(catalog_query()))
	%ItemCollection.item_selected.connect(_select_row)
	for pair in [[%AllSources, "all"], [%ScenarioSource, "scenario"], [%StockSource, "standard"]]: pair[0].pressed.connect(_filter.bind("scope", pair[1]))
	for pair in [["AllItems", "all"], ["Weapons", "weapon"], ["Armor", "armor"], ["Accessories", "accessory"], ["Magic", "magic"], ["Supplies", "supply"]]:
		find_child(pair[0], true, false).pressed.connect(_filter.bind("category", pair[1]))
	%Previous.pressed.connect(func(): _change_page(maxi(0, int(_query.offset) - 8)))
	%Next.pressed.connect(func(): _change_page(int(_query.offset) + 8))
	for pair in [[%NewItem, "new"], [%CopyItem, "copy"], [%ClearItem, "clear"]]: pair[0].pressed.connect(_record_action.bind(pair[1]))
	%CommitItemEdit.pressed.connect(commit_selected)
	%DiscardItem.pressed.connect(discard_draft)
	%CheckOriginalResult.pressed.connect(recovery_requested.emit)
	%CompileScenarioItems.pressed.connect(compile_requested.emit)
	%ChooseArtwork.pressed.connect(func(): reference_requested.emit("iconId"))
	%BrowseArtworkLibrary.pressed.connect(artwork_choice_requested.emit)
	%BackToAssets.pressed.connect(return_to_assets_requested.emit)
	%SaveItemProject.pressed.connect(save_requested.emit)
	%SaveItemProjectAs.pressed.connect(save_as_requested.emit)
	_uses_previous.pressed.connect(func(): if not _locked: used_by_page_requested.emit(maxi(0, _uses_offset - 64)))
	_uses_next.pressed.connect(func(): if not _locked: used_by_page_requested.emit(_uses_offset + 64))
	_draft_changed()
	_refresh_filters()


func catalog_query() -> Dictionary:
	return _query.duplicate(true)


func _field_edited(field: String, value: Variant) -> void:
	draft.edit_field(field, value)
	draft_edited.emit()
	if field == "iconId": selection_changed.emit(draft.definition.duplicate(true))


func _filter(field: String, value: Variant) -> void:
	if _locked: return
	_query[field] = value
	_query.offset = 0
	_refresh_filters()
	catalog_requested.emit(catalog_query())


func show_catalog(page: Dictionary) -> void:
	_items = page.get("items", []).duplicate(true)
	_total = int(page.get("total", 0))
	_query.offset = int(page.get("offset", 0))
	%ItemCollection.clear()
	for row in _items:
		%ItemCollection.add_record(row)
		if row.identity == draft.definition.get("id"): %ItemCollection.select(%ItemCollection.item_count - 1)
	%CatalogCount.text = "%d shown / %d matches" % [_items.size(), _total]
	%Pages.text = "Page %d of %d" % [int(_query.offset) / 8 + 1, maxi(1, ceili(float(_total) / 8))]
	%Previous.disabled = _locked or int(_query.offset) == 0
	%Next.disabled = _locked or int(_query.offset) + _items.size() >= _total
	%CatalogEmpty.visible = _items.is_empty()
	%CatalogEmpty.text = "No matching items." if not str(_query.query).is_empty() else "No items in this view."
	%StockNotice.text = str(page.get("stockReason", ""))
	catalog_presented.emit(_items.duplicate(true), int(page.get("revision", -1)))


func show_catalog_loading() -> void:
	catalog_loading.emit()
	_items.clear(); %ItemCollection.clear()
	%CatalogCount.text = "Loading items…"
	%Previous.disabled = true; %Next.disabled = true
	%CatalogEmpty.hide()


func show_catalog_failure(response: Dictionary) -> void:
	%CatalogCount.text = "Items could not be loaded"
	show_submission(response)


func bind_document(document: Dictionary) -> void:
	_valid = true
	draft.bind_document(document)
	_present_draft()


func begin_allocation(value: Dictionary, revision: int) -> void:
	_valid = true
	draft.begin_allocation(value, revision)
	_present_draft()


func _present_draft() -> void:
	form.set_definition(draft.definition, draft.editable)
	form.show_reference_labels(draft.document.get("referenceLabels", {}))
	form.show_text_feedback(draft.document.get("textFeedback", []))
	form.show_effects(draft.document.get("effects", []))
	%SubmissionNotice.text = ""
	%SubmissionNotice.hide()
	set_artwork_preview(null)
	_render_uses()
	selection_changed.emit(draft.definition.duplicate(true))


func _select_row(index: int) -> void:
	if _locked or index < 0 or index >= _items.size(): return
	var identity := str(_items[index].identity)
	if identity == draft.definition.get("id"): return
	if has_unapplied_changes():
		%ItemCollection.deselect_all()
		for prior in _items.size():
			if _items[prior].identity == draft.definition.get("id"): %ItemCollection.select(prior)
		navigation_requested.emit(open_item.bind(identity))
		return
	open_requested.emit(identity)


func open_item(identity: String) -> bool:
	if identity == draft.definition.get("id"): return true
	if has_unapplied_changes(): navigation_requested.emit(open_item.bind(identity)); return false
	if not open_handler.is_valid(): return false
	var response: Dictionary = await open_handler.call(identity)
	return bool(response.get("ok", false))


func _record_action(kind: String) -> void:
	if _locked: return
	if has_unapplied_changes(): navigation_requested.emit(func(): record_requested.emit(kind)); return
	record_requested.emit(kind)


func selected_definition() -> Dictionary:
	return draft.definition.duplicate(true)


func can_choose_library_artwork() -> bool:
	return not _locked and draft.editable and draft.allocation == null


func has_unapplied_changes() -> bool:
	return draft.dirty() or _pending


func discard_draft() -> void:
	if _locked or _pending: return
	_valid = true
	draft.discard()
	_present_draft()


func commit_selected() -> Dictionary:
	if not draft.dirty(): return {"ok": true, "unchanged": true}
	if commit_handler.is_valid(): return await commit_handler.call(int(draft.definition.classicId) - 800, draft.definition.duplicate(true))
	item_update_requested.emit(int(draft.definition.classicId) - 800, draft.definition.duplicate(true))
	return {"ok": false, "error": "The item authoring controller is unavailable."}


func accept_reference(field: String, value: Variant) -> void:
	if _locked: return
	var sequence: int = draft.edit_sequence
	draft.edit_field(field, value)
	if draft.edit_sequence == sequence: return
	form.set_definition(draft.definition, draft.editable)
	draft_edited.emit()
	if field == "iconId": selection_changed.emit(draft.definition.duplicate(true))


func accept_categories(masks: Array) -> void:
	if _locked: return
	var sequence: int = draft.edit_sequence
	draft.edit_field("itemCategoryMaskLow", masks[0])
	draft.edit_field("itemCategoryMaskHigh", masks[1])
	if draft.edit_sequence == sequence: return
	form.set_definition(draft.definition, draft.editable)
	draft_edited.emit()


func _draft_changed() -> void:
	var definition: Dictionary = draft.definition
	%ItemIdentity.text = "No item selected" if definition.is_empty() else "%d · %s · %s" % [int(definition.get("classicId", 0)), str(definition.get("name", "")) if not str(definition.get("name", "")).is_empty() else "Unnamed item", "Scenario" if draft.editable else "Stock"]
	%OwnershipNotice.text = "Scenario definition" if draft.editable else "Stock definition · read-only"
	%OwnershipNotice.visible = not definition.is_empty() and not draft.editable
	%CopyItem.disabled = _locked or definition.is_empty()
	%ClearItem.disabled = _locked or not draft.editable or draft.allocation != null
	%ChooseArtwork.disabled = _locked or not draft.editable
	%BrowseArtworkLibrary.disabled = _locked or not draft.editable or draft.allocation != null
	%CommitItemEdit.disabled = _locked or not draft.dirty() or not _valid
	%DiscardItem.disabled = _locked or not draft.dirty()
	%DraftStatus.text = "Unapplied changes" if draft.dirty() else ("No item selected" if definition.is_empty() else "" if draft.editable else "Stock is protected")


func _render_uses() -> void:
	show_uses({"items": draft.document.get("usedBy", []), "total": draft.document.get("usedByTotal", 0), "offset": 0})


func show_uses(page: Dictionary) -> void:
	for child in _uses.get_children():
		_uses.remove_child(child)
		child.queue_free()
	var uses: Array = page.get("items", [])
	_uses_count = uses.size()
	_uses_offset = int(page.get("offset", 0))
	var total := int(page.get("total", uses.size()))
	_used_by_count.text = "USED BY · %d" % total
	_uses_pages.visible = total > 64
	_uses_page.text = "%d–%d" % [_uses_offset + 1, _uses_offset + uses.size()]
	_uses_previous.disabled = _locked or _uses_offset == 0
	_uses_next.disabled = _locked or _uses_offset + uses.size() >= total
	for row in uses:
		var button := Button.new()
		button.name = "Use_" + (str(row.get("source", "")) + ":" + str(row.get("field", ""))).sha256_text().substr(0, 12)
		button.text = "%s · %s" % [preload("res://src/monster_review_labels.gd").owner(str(row.get("source", ""))), preload("res://src/monster_review_labels.gd").field(str(row.get("field", "")), str(row.get("source", "")))]
		button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		button.tooltip_text = button.text
		button.disabled = _locked
		button.pressed.connect(func(): used_by_requested.emit(row.duplicate(true)))
		_uses.add_child(button)


func set_locked(locked: bool) -> void:
	%ItemCollection.set_locked(locked)
	_locked = locked
	form.set_locked(locked)
	for control in [%ItemSearch, %AllSources, %ScenarioSource, %StockSource]:
		if control is LineEdit: control.editable = not locked
		else: control.disabled = locked
	%Previous.disabled = locked or int(_query.offset) == 0
	%Next.disabled = locked or int(_query.offset) + _items.size() >= _total
	for name in ["AllItems", "Weapons", "Armor", "Accessories", "Magic", "Supplies"]: find_child(name, true, false).disabled = locked
	%BrowseArtworkLibrary.disabled = locked or not draft.editable or draft.allocation != null
	_uses_previous.disabled = locked or _uses_offset == 0
	_uses_next.disabled = locked or _uses_offset + _uses_count >= int(draft.document.get("usedByTotal", 0))
	for child in _uses.get_children():
		if child is Button: child.disabled = locked
	%NewItem.disabled = locked
	_draft_changed()


func show_submission(response: Dictionary) -> void:
	%SubmissionNotice.text = "" if response.get("ok", false) else str(response.get("error", "Your draft is kept."))
	%SubmissionNotice.visible = not %SubmissionNotice.text.is_empty()
	_pending = bool(response.get("outcomeUnknown", false))
	%CheckOriginalResult.visible = _pending
	%CheckOriginalResult.text = "Check original result" if response.get("pendingMutation", false) else "Reconnect keeping draft"
	set_locked(_pending)


func show_validation(result: Dictionary) -> void:
	_valid = bool(result.get("valid", true))
	%SubmissionNotice.text = "\n".join(result.get("issues", []))
	%SubmissionNotice.visible = not %SubmissionNotice.text.is_empty()
	form.show_text_feedback(result.get("textFeedback", []))
	form.show_effects(result.get("effects", []))
	_draft_changed()


func read_state() -> Dictionary:
	return {"query": catalog_query(), "draft": draft.submitted() if not draft.definition.is_empty() else {}, "generation": draft.generation, "editSequence": draft.edit_sequence}


func catalog_items() -> Array:
	return _items.duplicate(true)


func set_items(items: Array, revision: int) -> void:
	if items.is_empty(): bind_document({})
	var rows: Array = []
	for item in items:
		rows.append({"identity": item.get("id", ""), "classicId": item.get("classicId", 0), "name": item.get("name", ""), "scope": "scenario"})
	show_catalog({"items": rows, "total": rows.size()})
	if not items.is_empty(): bind_document({"item": items[0], "editable": true, "revision": revision, "scope": "scenario"})


func accept_saved_definition(definition: Dictionary) -> void:
	var document: Dictionary = draft.document.duplicate(true); document.item = definition; bind_document(document)


func set_return_to_assets_visible(available: bool) -> void:
	%BackToAssets.visible = available


func set_artwork_preview(picture: Texture2D, reason := "") -> void:
	%ItemPicture.texture = picture
	%ArtworkNotice.text = reason if not reason.is_empty() else ("No artwork selected" if int(draft.definition.get("iconId", 0)) == 0 else "Artwork preview unavailable" if picture == null else "Exact selected artwork")
	%ArtworkNotice.visible = picture == null
	%ItemPicture.tooltip_text = %ArtworkNotice.text
	%PicturePlaceholder.visible = picture == null
	%PicturePlaceholder.text = "—" if int(draft.definition.get("iconId", 0)) == 0 else "!"


func set_catalog_artwork(index: int, identity: String, picture: Texture2D, reason: String) -> void:
	%ItemCollection.set_artwork(index, identity, picture, reason)


func apply_theme(mode := "dark", density := "balanced") -> void:
	var controls = preload("res://src/item_theme.gd").new()
	controls.mode = mode; controls.density = density
	theme = controls


func focus_artwork_id() -> void:
	form.show_section("Identity"); form.control_for("iconId").get_line_edit().grab_focus()


func focus_artwork_choice() -> void:
	%ChooseArtwork.grab_focus()


func set_compile_available(available: bool, reason := "") -> void:
	%CompileScenarioItems.disabled = not available
	%CompileScenarioItems.tooltip_text = reason


func show_save_state(message: String, needs_save: bool, failed := false) -> void:
	%SaveNotice.text = message
	%SaveNotice.visible = not message.is_empty()
	%SaveActions.visible = needs_save
	%SaveItemProject.text = "Retry Save" if failed else "Save"


func read_navigation_state() -> Dictionary:
	var focus := get_viewport().gui_get_focus_owner()
	return {"identity": str(draft.definition.get("id", "")), "query": catalog_query(), "section": form.current_section(),
		"scroll": form.get_node("BodyScroll").scroll_vertical, "catalogScroll": %ItemCollection.get_v_scroll_bar().value,
		"usedByOffset": _uses_offset, "form": form.read_navigation_state(focus), "focus": str(get_path_to(focus)) if is_instance_valid(focus) and is_ancestor_of(focus) else ""}

func discovery_selection() -> Dictionary:
	return {"kind":"item", "identity":str(draft.definition.get("id", "")), "nativeId":str(draft.definition.get("classicId", "")), "scope":"scenario" if draft.editable else "stock"}


func restore_navigation_state(state: Dictionary) -> bool:
	_query = state.get("query", _query).duplicate(true)
	%ItemSearch.text = str(_query.query)
	_refresh_filters()
	catalog_requested.emit(catalog_query())
	var opened: bool = await open_item(str(state.get("identity", "")))
	if not opened: return false
	if int(state.get("usedByOffset", 0)) > 0 and uses_handler.is_valid(): await uses_handler.call(int(state.usedByOffset))
	form.restore_navigation_state(state.get("form", {"section": state.get("section", "Identity"), "scroll": state.get("scroll", 0)}))
	%ItemCollection.get_v_scroll_bar().set_deferred("value", float(state.get("catalogScroll", 0)))
	if not state.get("form", {}).has("focus"):
		var control := get_node_or_null(str(state.get("focus", ""))) as Control
		if is_instance_valid(control) and control.is_visible_in_tree(): control.grab_focus()
	return true


func focus_source(identity: String, _slot: int, field: String) -> bool:
	if not await open_item(identity): return false
	if field.begins_with("special["): field = "special." + field.get_slice("[", 1).get_slice("]", 0)
	var section := "Identity"
	if field in ["specificRaceId", "specificCasteId"]: section = "Restrictions"
	elif field.begins_with("special"): section = "Special"
	form.show_section(section)
	var control: Control = form.control_for(field)
	if control == null:
		var name: String = {"iconId":"ChooseIconId", "cursedItemId": "ChooseCursedItem", "specificRaceId": "ChooseSpecificRace", "specificCasteId": "ChooseSpecificCaste"}.get(field, "")
		if name.is_empty(): return false
		control = form.find_child(name, true, false)
	if control is SpinBox: control = control.get_line_edit()
	if is_instance_valid(control): control.grab_focus()
	return is_instance_valid(control)


func _refresh_filters() -> void:
	for pair in [[%AllSources, "all"], [%ScenarioSource, "scenario"], [%StockSource, "standard"]]: pair[0].set_pressed_no_signal(_query.scope == pair[1])
	for pair in [["AllItems", "all"], ["Weapons", "weapon"], ["Armor", "armor"], ["Accessories", "accessory"], ["Magic", "magic"], ["Supplies", "supply"]]: find_child(pair[0], true, false).set_pressed_no_signal(_query.category == pair[1])


func _change_page(offset: int) -> void:
	if _locked: return
	_query.offset = offset
	catalog_requested.emit(catalog_query())

func supports_source_field(field: String) -> bool:
	if field.begins_with("special["): field="special."+field.get_slice("[",1).get_slice("]",0)
	if form.control_for(field)!=null: return true
	return field in ["iconId","cursedItemId","specificRaceId","specificCasteId"]
