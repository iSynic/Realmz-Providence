extends RefCounted

var _view: ProvidenceRuleAuthoringEditor
var _operations: ProvidenceEditorOperation
var _read_bridge: Callable
var _generation: Callable
var _open_source: Callable
var _open_target: Callable
var _picker
var _presentation_generation := 0
var _presentation_key := ""
var _portrait_choice: Dictionary = {}

func initialize(view: ProvidenceRuleAuthoringEditor, operations: ProvidenceEditorOperation, bridge: Callable, generation: Callable) -> void:
	_view = view; _operations = operations; _read_bridge = bridge; _generation = generation
	_picker = preload("res://src/rule_reference_picker.tscn").instantiate()
	view.add_child(_picker)
	view.form.reference_requested.connect(open_picker)
	view.form.resource_requested.connect(open_resource)
	view.selection_changed.connect(func(_definition): refresh_presentation())
	view.used_by_requested.connect(func(row: Dictionary):
		if _open_source.is_valid(): _view.navigation_requested.emit(func(): await _open_source.call(row)))
	view.target_requested.connect(func(row: Dictionary):
		if _open_target.is_valid(): _view.navigation_requested.emit(func(): await _open_target.call(str(row.targetKind), str(row.targetId).get_slice(".", 2).to_int(), str(row.targetId), {})))
	view.uses_page_requested.connect(load_uses_page)
	_picker.search_requested.connect(search)
	_picker.preview_requested.connect(preview)
	_picker.accepted.connect(accept)
	_picker.open_requested.connect(func(choice: Dictionary, _context: Dictionary): _open_choice(choice))

func configure_navigation(source: Callable, target: Callable) -> void:
	_open_source = source; _open_target = target

func load_uses_page(offset: int) -> void:
	var context := {"generation": _generation.call(), "draftGeneration": _view.draft.generation, "identity": _view.current_selection(), "revision": _view.draft.revision}
	while _operations.busy:
		await _view.get_tree().process_frame
		if context.generation != _generation.call() or context.draftGeneration != _view.draft.generation: return
	var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Read Rule callers", func(operation):
		return await operation.request("rule.used-by", {"kind": _view.rule_kind, "classicId": context.identity.get_slice(".", 2).to_int(), "expectedRevision": context.revision, "offset": offset}))
	if context.generation != _generation.call() or context.draftGeneration != _view.draft.generation: return
	if response.get("ok", false) and int(response.result.revision) == context.revision: _view.show_uses_page(response.result)
	else: _view.show_submission(response if not response.get("ok", false) else {"ok": false, "revisionConflict": true, "error": "The project changed while reading callers. Review the saved version; your draft is retained."})

func _context(field: String, slot: int) -> Dictionary:
	var value := int(_view.selected_definition().get(field, 0))
	if field == "startingItem":
		var items: Array = _view.draft.edit.get("nativeFields", {}).get("startingItems", [])
		value = str(items[slot]).trim_prefix("classic.item.").to_int() if slot < items.size() and items[slot] != null else 0
	return {"field": field, "slot": slot, "currentValue": value, "projectRevision": _view.draft.revision,
		"destination": "%s %d · %s" % [_view.rule_kind.capitalize(), _view.draft.author_id, "Starting item slot %d" % (slot + 1) if field == "startingItem" else "Portrait"],
		"label": "Starting item" if field == "startingItem" else "Portrait set" if field == "defaultIconSet" else "Portrait",
		"generation": _generation.call(), "draftGeneration": _view.draft.generation, "editSequence": _view.draft.edit_sequence,
		"allowNone": field == "startingItem", "requirePreview": field != "startingItem", "picturePreview": field != "startingItem"}

func _matches(context: Dictionary) -> bool:
	return context.get("generation") == _generation.call() and context.get("draftGeneration") == _view.draft.generation and context.get("editSequence") == _view.draft.edit_sequence and context.get("projectRevision") == _view.draft.revision

func _presentation_matches(context: Dictionary) -> bool:
	return context.get("generation") == _generation.call() and context.get("draftGeneration") == _view.draft.generation and context.get("projectRevision") == _view.draft.revision and int(context.currentValue) == int(_view.selected_definition().get(context.field, 0))

func open_picker(field: String, slot: int) -> void:
	if field == "defaultIcon": return
	if _read_bridge.call() == null or not _view.draft.editable or _view.has_unapplied_changes() and _view.draft.edit.is_empty(): return
	_picker.begin(_context(field, slot), _view.get_viewport().gui_get_focus_owner())

func search(query: Dictionary, generation: int) -> void:
	var context: Dictionary = _picker.context.duplicate(true)
	if not _matches(context): _picker.cancel(); return
	var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Browse Rule references", func(operation):
		return await operation.request("rule-reference.list", {"expectedRevision": context.projectRevision, "query": query}))
	if response.get("busy", false):
		await _view.get_tree().process_frame
		if _matches(context): _picker.retry_search(query, generation)
		return
	if _matches(context): _picker.receive_page(response, generation)
	else: _picker.cancel()

func preview(choice: Dictionary, generation: int) -> void:
	var context: Dictionary = _picker.context.duplicate(true)
	if context.is_empty() or not choice.get("available", false): return
	while _operations.busy:
		await _view.get_tree().process_frame
		if not _matches(context) or generation != _picker.generation: return
	if context.field == "startingItem":
		var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Preview starting item", _item_preview.bind(str(choice.targetIdentity)))
		if _matches(context) and generation == _picker.generation and _picker.selected.get("targetIdentity") == choice.get("targetIdentity"):
			_picker.show_item_preview(response)
		return
	var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Preview Rule portrait", func(operation):
		return await operation.request("rule-reference.preview", {"expectedRevision": context.projectRevision, "field": context.field, "value": int(choice.value)}))
	if _matches(context): _picker.receive_spell_preview(response, generation, int(choice.value))

func _item_preview(operation: ProvidenceEditorOperation, identity: String) -> Dictionary:
	var response := await operation.request("item.open", {"identity": identity})
	if not response.get("ok", false): return response
	var definition: Dictionary = response.result.item
	var artwork := await preload("res://src/item_artwork_lookup.gd").resolve(operation.request, int(definition.get("iconId", 0)))
	return {"ok": true, "definition": definition, "texture": artwork.get("texture"), "error": artwork.get("error", "")}

func accept(choice: Dictionary, context: Dictionary) -> void:
	if context.get("field") == "defaultIcon": return
	if not _matches(context) or not choice.get("available", false): return
	if int(choice.value) == int(context.currentValue): return
	var path: Array = ["definition", context.field]
	var value: Variant = int(choice.value)
	if context.field == "startingItem":
		path = ["nativeFields", "startingItems", int(context.slot)]
		value = null if int(choice.value) == 0 else str(choice.targetIdentity)
	_view.draft.edit_path(path, value)
	if context.field == "startingItem": _view.form.set_item_choices([choice])
	_view.form.set_edit(_view.draft.edit, true)
	_view.draft_edited.emit(); _view.selection_changed.emit(_view.selected_definition())

func refresh_presentation() -> void:
	if _view.rule_kind != "race": return
	var definition := _view.selected_definition()
	var field := "defaultIconSet" if _view.rule_kind == "race" else "defaultIcon"
	var key := "%d:%d:%s:%d" % [int(_generation.call()), _view.draft.generation, field, int(definition.get(field, 0))]
	if key == _presentation_key: return
	_presentation_key = key; _presentation_generation += 1
	var request_id := _presentation_generation
	_portrait_choice.clear()
	if _read_bridge.call() == null or definition.is_empty():
		_view.form.show_portrait({"reason": "No record selected."}, []); return
	if _view.draft.document.get("ownership") == "vacant" and not _view.draft.allocation:
		_view.form.show_portrait({"reason": "Empty slot · create a rule before choosing its portrait."}, []); return
	_view.form.show_portrait({"reason": "Loading exact portrait…"}, [])
	_load_portrait.call_deferred(request_id, _context(field, -1))

func _load_portrait(request_id: int, context: Dictionary) -> void:
	while _operations.busy:
		await _view.get_tree().process_frame
		if request_id != _presentation_generation or not _presentation_matches(context): return
	if request_id != _presentation_generation or not _presentation_matches(context): return
	var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Read Rule portrait", func(operation):
		return await operation.request("rule-reference.preview", {"expectedRevision": context.projectRevision, "field": context.field, "value": int(context.currentValue)}))
	if request_id != _presentation_generation or not _presentation_matches(context): return
	var decoded := preload("res://src/spell_presentation.gd").decode(response)
	_portrait_choice = decoded.get("choice", {})
	_view.form.show_portrait(_portrait_choice if not _portrait_choice.is_empty() else {"reason": response.get("error", "The exact portrait is unavailable.")}, decoded.get("textures", []))

func open_resource(field: String, slot: int) -> void:
	if field == "startingItem":
		var items: Array = _view.draft.edit.get("nativeFields", {}).get("startingItems", [])
		if slot < items.size() and items[slot] != null: _open_choice({"targetIdentity": str(items[slot]), "field": field})
	else: _open_choice(_portrait_choice)

func _open_choice(choice: Dictionary) -> void:
	if choice.get("targetIdentity") == null or not _open_target.is_valid(): return
	var identity := str(choice.targetIdentity)
	var kind := "item" if identity.begins_with("classic.item.") else "monster-appearance"
	var native_id := identity.get_slice(".", 2).to_int() if kind == "item" else int(choice.get("value", 0))
	var context := {} if kind == "item" else {"targetStatus": "application-resource" if choice.get("ownership") == "stock" else "scenario-resource"}
	_view.navigation_requested.emit(func(): await _open_target.call(kind, native_id, identity, context))

func close() -> void:
	_presentation_generation += 1; _presentation_key = ""
	if is_instance_valid(_picker): _picker.cancel()

func dispose() -> void:
	close()
	_read_bridge = Callable(); _generation = Callable(); _open_source = Callable(); _open_target = Callable()
	_view = null
