extends RefCounted

var _view: ProvidenceItemEditor
var _operations: ProvidenceEditorOperation
var _read_bridge: Callable
var _generation: Callable
var _picker
var _categories
var _open_source: Callable
var _open_target: Callable
var _play_sound: Callable
const FIELD_LABELS := {"iconId": "Artwork", "itemType": "Equipment / use type", "soundId": "Use sound", "cursedItemId": "Cursed form item", "specificRaceId": "Specific race", "specificCasteId": "Specific caste", "special.0": "Primary effect", "special.1": "Stored spell", "special.2": "Condition / effect 3", "special.3": "Effect 4", "special.4": "Use script", "categories": "Item categories"}


func initialize(view: ProvidenceItemEditor, operations: ProvidenceEditorOperation, read_bridge: Callable, generation: Callable) -> void:
	_view = view; _operations = operations; _read_bridge = read_bridge; _generation = generation
	_picker = preload("res://src/monster_reference_picker.tscn").instantiate()
	_categories = preload("res://src/item_category_picker.tscn").instantiate()
	view.add_child(_picker); view.add_child(_categories)
	view.reference_requested.connect(open_picker)
	view.sound_preview_requested.connect(play_current_sound)
	view.used_by_requested.connect(open_source)
	_picker.search_requested.connect(search)
	_picker.preview_requested.connect(preview)
	_picker.accepted.connect(accept)
	_picker.open_requested.connect(open_target)
	_categories.accepted.connect(accept_categories)


func configure_navigation(open_source: Callable, open_target_handler: Callable, play_sound: Callable) -> void:
	_open_source = open_source; _open_target = open_target_handler; _play_sound = play_sound


func open_source(row: Dictionary) -> void:
	if not _open_source.is_valid(): return
	var reference := row.duplicate(true)
	var field := str(reference.get("field", ""))
	if field.begins_with("actions["):
		var slot := field.get_slice("[", 1).get_slice("]", 0)
		if slot.is_valid_int(): reference.slot = int(slot)
	_view.navigation_requested.emit(func(): await _open_source.call(reference))


func _context(field: String) -> Dictionary:
	var definition: Dictionary = _view.selected_definition()
	if definition.is_empty() or not _view.draft.editable: return {}
	var value: Variant = definition.get(field)
	if field.begins_with("special."): value = definition.special[field.get_slice(".", 1).to_int()]
	var numeric := int(str(value).get_slice(".", str(value).get_slice_count(".") - 1)) if value is String else int(value) if value != null else 0
	var label := str(FIELD_LABELS.get(field, field))
	return {"field": field, "currentValue": numeric, "projectRevision": _view.draft.revision,
		"destination": "Item %d · %s" % [int(definition.classicId), label], "label": label,
		"generation": _generation.call(), "draftGeneration": _view.draft.generation,
		"editSequence": _view.draft.edit_sequence, "definition": definition,
		"allowNone": field not in ["itemType", "special.4"], "requireAppearancePair": false}


func _matches(context: Dictionary) -> bool:
	return not context.is_empty() and context.get("generation") == _generation.call() and context.get("draftGeneration") == _view.draft.generation and context.get("editSequence") == _view.draft.edit_sequence and context.get("projectRevision") == _view.draft.revision


func open_picker(field: String) -> void:
	var context := _context(field)
	if context.is_empty() or _read_bridge.call() == null: return
	var focus := _view.get_viewport().gui_get_focus_owner()
	if field == "categories":
		_categories.begin([_view.draft.definition.get("itemCategoryMaskLow", 0), _view.draft.definition.get("itemCategoryMaskHigh", 0)], context, focus)
	else: _picker.begin(context, focus)


func search(query: Dictionary, generation: int) -> void:
	var context: Dictionary = _picker.context.duplicate(true)
	if not _matches(context): _picker.cancel(); return
	var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Browse Item references", _read_catalog.bind(query, context))
	if response.get("busy", false):
		await _view.get_tree().process_frame
		if _matches(context): _picker.retry_search(query, generation)
		return
	if _matches(context): _picker.receive_page(response, generation)
	else: _picker.cancel()


func _read_catalog(operation: ProvidenceEditorOperation, query: Dictionary, context: Dictionary) -> Dictionary:
	return await operation.request("item-reference.list", {"expectedRevision": context.projectRevision, "definition": context.definition, "query": query})


func preview(choice: Dictionary, generation: int) -> void:
	if _picker.context.get("field") != "iconId" or int(choice.get("value", 0)) == 0 or not choice.get("available", false): return
	var context: Dictionary = _picker.context.duplicate(true)
	while _operations.busy:
		await _view.get_tree().process_frame
		if not _matches(context) or generation != _picker.generation: return
	var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Preview Item artwork", func(operation):
		return await operation.request("icon.preview" if choice.ownership == "scenario" else "application-media.preview", {"identity": choice.targetIdentity}))
	if _matches(context): _picker.receive_picture(response, generation, int(choice.value))


func accept(choice: Dictionary, context: Dictionary) -> void:
	if not _matches(context) or not choice.get("available", false): return
	var field := str(context.field)
	var value: Variant = int(choice.value)
	if field in ["cursedItemId", "specificRaceId", "specificCasteId"]: value = null if int(choice.value) == 0 else str(choice.targetIdentity)
	_view.accept_reference(field, value)


func accept_categories(masks: Array, context: Dictionary) -> void:
	if _matches(context): _view.accept_categories(masks)


func open_target(choice: Dictionary, context: Dictionary) -> void:
	if not _matches(context) or not _open_target.is_valid() or choice.get("targetIdentity") == null: return
	var kind := str({"iconId": "monster-appearance", "soundId": "sound", "cursedItemId": "item", "specificRaceId": "race", "specificCasteId": "caste", "special.1": "spell", "special.4": "extra-action-point"}.get(str(context.field), ""))
	if kind.is_empty(): return
	_picker.cancel(true, false)
	await _open_target.call(kind, int(choice.value), str(choice.targetIdentity), {"targetStatus": "application-resource" if kind in ["sound", "monster-appearance"] and choice.ownership == "stock" else "resolved"})


func play_current_sound() -> void:
	if not _play_sound.is_valid() or _read_bridge.call() == null or _view.draft.definition.is_empty(): return
	var origin := {"generation": _generation.call(), "state": _view.read_state()}
	var context := _context("soundId")
	# Stock may be previewed without granting permission to edit it.
	if context.is_empty():
		context = {"projectRevision": _view.draft.revision, "definition": _view.selected_definition()}
	var value := int(_view.draft.definition.get("soundId", 0))
	if value == 0: return
	var query := {"field": "soundId", "currentValue": value, "search": str(value), "ownership": "all", "showUnavailable": true, "offset": 0, "seekCurrent": false, "limit": 128}
	var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Resolve Item sound", _read_catalog.bind(query, context))
	if origin.generation != _generation.call() or origin.state != _view.read_state(): return
	if not response.get("ok", false): _view.show_submission(response); return
	var matches: Array = response.result.page.items.filter(func(row): return int(row.value) == value and row.available)
	if matches.size() != 1: _view.show_submission({"ok": false, "error": "This exact sound is unavailable or ambiguous."}); return
	await _play_sound.call(value, str(matches[0].targetIdentity), "application-resource" if matches[0].ownership == "stock" else "resolved")


func close() -> void:
	if is_instance_valid(_picker): _picker.cancel()
	if is_instance_valid(_categories): _categories.cancel()


func dispose() -> void:
	close()
	_read_bridge = Callable(); _generation = Callable()
	_open_source = Callable(); _open_target = Callable(); _play_sound = Callable()
	_view = null
