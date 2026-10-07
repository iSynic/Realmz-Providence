extends RefCounted

const LABELS := {"soundStart": "Casting sound", "soundEnd": "Resolution sound", "lookStart": "Cast animation", "lookEnd": "Resolution animation", "queueIcon": "Queue icon", "spellClass": "Summon monster"}
var _view: ProvidenceSpellEditor
var _operations: ProvidenceEditorOperation
var _read_bridge: Callable
var _generation: Callable
var _open_source: Callable
var _open_target: Callable
var _picker
var _presentation_generation := 0
var _choices: Dictionary = {}
var _sounds: Dictionary = {}
var _playing_field := ""


func initialize(view: ProvidenceSpellEditor, operations: ProvidenceEditorOperation, bridge: Callable, generation: Callable) -> void:
	_view = view; _operations = operations; _read_bridge = bridge; _generation = generation
	_picker = preload("res://src/spell_reference_picker.tscn").instantiate()
	view.add_child(_picker)
	view.form.reference_requested.connect(open_picker)
	view.form.sound_requested.connect(play_sound)
	view.form.resource_requested.connect(open_resource)
	view.used_by_requested.connect(func(row: Dictionary):
		if _open_source.is_valid(): _view.navigation_requested.emit(func(): await _open_source.call(row)))
	_picker.search_requested.connect(search)
	_picker.preview_requested.connect(preview)
	_picker.accepted.connect(accept)
	_picker.open_requested.connect(func(choice: Dictionary, _context: Dictionary): _open_choice(choice))
	view.get_node("SoundPlayer").finished.connect(func(): _playing_field = ""; view.form.show_playback("", false))


func configure_navigation(source: Callable, target: Callable) -> void:
	_open_source = source; _open_target = target


func _context(field: String) -> Dictionary:
	return {"field": field, "currentValue": int(_view.draft.definition.get(field, 0)), "projectRevision": _view.draft.revision,
		"destination": "Spell %d · %s · %s" % [int(_view.draft.definition.get("classicId", 0)), str(_view.draft.definition.get("name", "")), LABELS[field]],
		"label": LABELS[field], "generation": _generation.call(), "draftGeneration": _view.draft.generation,
		"editSequence": _view.draft.edit_sequence, "definition": _view.selected_definition(),
		"allowNone": field not in ["lookEnd", "spellClass"], "requirePreview": true, "picturePreview": field in ["lookStart", "lookEnd", "queueIcon"], "soundPreview": field.begins_with("sound")}


func _matches(context: Dictionary) -> bool:
	return context.get("generation") == _generation.call() and context.get("draftGeneration") == _view.draft.generation and context.get("editSequence") == _view.draft.edit_sequence and context.get("projectRevision") == _view.draft.revision


func open_picker(field: String) -> void:
	if _read_bridge.call() == null or not _view.draft.editable: return
	if field == "spellClass" and int(_view.draft.definition.get("special", 0)) != 58: return
	_picker.begin(_context(field), _view.get_viewport().gui_get_focus_owner())


func search(query: Dictionary, generation: int) -> void:
	var context: Dictionary = _picker.context.duplicate(true)
	if not _matches(context): _picker.cancel(); return
	var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Browse Spell references", func(operation):
		return await operation.request("spell-reference.list", {"expectedRevision": context.projectRevision, "definition": context.definition, "query": query}))
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
	var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Preview Spell reference", func(operation):
		return await operation.request("spell-reference.preview", {"expectedRevision": context.projectRevision, "field": context.field, "value": int(choice.value)}))
	if _matches(context): _picker.receive_spell_preview(response, generation, int(choice.value))


func accept(choice: Dictionary, context: Dictionary) -> void:
	if _matches(context) and choice.get("available", false): _view.accept_reference(str(context.field), int(choice.value))


func refresh_presentation() -> void:
	_presentation_generation += 1
	var request_id := _presentation_generation
	var state := _presentation_state()
	var generation: int = _generation.call()
	_choices.clear(); _sounds.clear()
	play_sound("", false)
	for field in ["soundStart", "soundEnd", "lookStart", "lookEnd", "queueIcon"]:
		_view.form.show_reference(field, {"value": _view.draft.definition.get(field, 0), "label": "Loading…" if not _view.draft.definition.is_empty() else "Choose", "available": false})
	if _read_bridge.call() == null or _view.draft.definition.is_empty(): return
	_load_presentation.call_deferred(request_id, state, generation)


func _load_presentation(request_id: int, state: Dictionary, generation: int) -> void:
	for field in ["soundStart", "soundEnd", "lookStart", "lookEnd", "queueIcon"]:
		while _operations.busy:
			await _view.get_tree().process_frame
			if not _presentation_matches(request_id, state, generation): return
		if not _presentation_matches(request_id, state, generation): return
		var response: Dictionary = await _operations.run_workflow(_read_bridge.call(), "Preview Spell presentation", func(operation):
			return await operation.request("spell-reference.preview", {"expectedRevision": _view.draft.revision, "field": field, "value": int(_view.draft.definition.get(field, 0))}))
		if not _presentation_matches(request_id, state, generation): return
		var decoded := preload("res://src/spell_presentation.gd").decode(response)
		var choice: Dictionary = decoded.get("choice", {"value": int(_view.draft.definition.get(field, 0)), "label": "Unavailable", "reason": decoded.get("error", ""), "available": false})
		_choices[field] = choice
		if decoded.get("audio") != null: _sounds[field] = decoded.audio
		_view.form.show_reference(field, choice, decoded.get("textures", []))


func _presentation_matches(request_id: int, state: Dictionary, generation: int) -> bool:
	return request_id == _presentation_generation and generation == _generation.call() and state == _presentation_state() and _read_bridge.call() != null


func _presentation_state() -> Dictionary:
	var state := {"generation": _view.draft.generation, "revision": _view.draft.revision}
	for field in ["soundStart", "soundEnd", "lookStart", "lookEnd", "queueIcon"]: state[field] = _view.draft.definition.get(field, 0)
	return state


func play_sound(field: String, play: bool) -> void:
	var player: AudioStreamPlayer = _view.get_node("SoundPlayer")
	player.stop(); _playing_field = ""
	if play and _sounds.has(field): player.stream = _sounds[field]; player.play(); _playing_field = field
	_view.form.show_playback(_playing_field, player.playing)


func open_resource(field: String, frame: int) -> void:
	var choice: Dictionary = _choices.get(field, {})
	var resources: Array = choice.get("resources", [])
	if frame < resources.size(): _open_choice({"resources": [resources[frame]], "targetIdentity": resources[frame].identity, "value": resources[frame].resourceId})


func _open_choice(choice: Dictionary) -> void:
	if not _open_target.is_valid(): return
	var resources: Array = choice.get("resources", [])
	if resources.is_empty():
		if choice.get("targetIdentity") != null: _view.navigation_requested.emit(func(): await _open_target.call("monster", int(choice.value), str(choice.targetIdentity), {}))
		return
	var resource: Dictionary = resources[0]
	var kind := "sound" if resource.resourceType == "snd " else "map-tile" if resource.resourceType == "PICT" else "monster-appearance"
	var identity := "" if resource.get("identity") == null else str(resource.identity)
	var context := {"targetStatus": "application-resource" if resource.ownership == "stock" else "compatibility-resource" if kind == "map-tile" else "scenario-resource"}
	_view.navigation_requested.emit(func(): await _open_target.call(kind, int(resource.resourceId), identity, context))


func close() -> void:
	_presentation_generation += 1
	if is_instance_valid(_picker): _picker.cancel()
	if is_instance_valid(_view):
		play_sound("", false)
		_view.form.stop_animation()


func dispose() -> void:
	close()
	_read_bridge = Callable(); _generation = Callable(); _open_source = Callable(); _open_target = Callable()
	_view = null
