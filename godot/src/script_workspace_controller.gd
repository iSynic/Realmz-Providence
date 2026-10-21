extends RefCounted

signal projection_applied(projection: Dictionary)
signal inspector_requested(kind: String, document: Dictionary, references: Array)
signal message_requested(native_id: int)
signal sound_requested(native_id: int)
signal sound_preview_requested(native_id: int, identity: String, status: String)
signal sound_stop_requested
signal map_behavior_requested(identity: String, x: int, y: int)
signal map_reveal_requested(identity: String, x: int, y: int)
signal route_requested(identity: String)
signal semantic_target_requested(kind: String, native_id: int, identity: String, context: Dictionary)
signal code_help_requested(code: int, origin: Control)
signal manual_requested(page: int, origin: Control)
signal compile_requested
signal failed(message: String)

var _bridge: RefCounted
var _operations: ProvidenceEditorOperation
var _read_context: Callable
var _accept_response: Callable
var _accept_draft_response: Callable
var _request_navigation: Callable
var _maps: ProvidenceMapDocumentController
var _documents: RefCounted
var _action_points: Control
# Lazy pages: reading one realizes and binds it (see lazy-workbench-pages.md).
var _encounters: Control:
	get: return _documents.view("encounters.simple")
var _complex_encounters: Control:
	get: return _documents.view("encounters.complex")
var _extra_actions: Control:
	get: return _documents.view("scripts.macros")
var _globals: Control:
	get: return _documents.view("scripts.global-macros")
const RECORD_ROUTES := {"encounter": "encounters.simple", "complexEncounter": "encounters.complex",
	"extraActionPoint": "scripts.macros", "actionPoint": "scripts.action-points"}
var _records: Dictionary = {}
var _global_commands := preload("res://src/global_macro_controller.gd").new()
var _action_catalog: Dictionary = {}
var _pending_form_descriptions: Dictionary = {}
var _form_description_drain_running := false
var _revision: int:
	get: return int(_read_context.call().revision)


func initialize(documents: RefCounted, maps: ProvidenceMapDocumentController, read_context: Callable, accept_response: Callable, accept_draft_response: Callable, operations: ProvidenceEditorOperation, request_navigation: Callable = Callable()) -> void:
	_operations = operations
	_request_navigation = request_navigation
	_maps = maps
	_read_context = read_context
	_accept_response = accept_response
	_accept_draft_response = accept_draft_response
	_documents = documents
	_action_points = documents.view("scripts.action-points")
	_add_record("scripts.action-points", _action_points,
		{"record": "actionPoint", "commitKey": "draft", "list": "action-point.list", "open": "action-point.open", "update": "action-point.apply-draft", "limit": 100})
	_bind_action_points()
	_action_points.commit_handler = commit_action_point
	# The startup page binds now; the other script and encounter pages bind on first use.
	documents.on_realize("encounters.simple", _bind_encounters)
	documents.on_realize("encounters.complex", _bind_complex_encounters)
	documents.on_realize("scripts.macros", _bind_extra_actions)
	documents.on_realize("scripts.global-macros", _bind_globals)
	documents.on_realize("scripts.quests", _bind_context_routes)


func _add_record(route: String, view: Control, methods: Dictionary) -> void:
	var owner := preload("res://src/script_record_controller.gd").new()
	owner.initialize(view, methods, _operations, _read_context, _accept_response, _accept_draft_response, _request_navigation)
	owner.projection_applied.connect(func(projection): projection_applied.emit(projection))
	# A page realized during a session joins it, as if it had been attached at open.
	if _bridge != null: owner.attach_session(_bridge)
	if not _action_catalog.is_empty(): view.set_action_catalog(_action_catalog)
	view.compile_requested.connect(func(): compile_requested.emit())
	_records[methods.record] = owner
	_documents.register_controller(route, preload("res://src/workbench_controller.gd").new(route, view, _refresh_record.bind(methods.record), owner.teardown))


# Record controllers bind with their page, so asking for one realizes its page.
func _record(record: String) -> RefCounted:
	_documents.view(RECORD_ROUTES[record])
	return _records[record]


func _bind_globals(view: Control) -> void:
	_global_commands.initialize(view, _operations, _read_context, _accept_draft_response)
	_global_commands.projection_applied.connect(func(projection): projection_applied.emit(projection))
	if _bridge != null: _global_commands.attach_session(_bridge)
	view.hooks_update_requested.connect(update_global_macros)
	view.extra_action_point_open_requested.connect(open_extra_action_point_by_native_id)
	view.selection_changed.connect(func(row): inspector_requested.emit("global-macro", row, []))
	view.compile_requested.connect(func(): compile_requested.emit())
	_bind_context_routes(view)
	_documents.register_controller("scripts.global-macros", preload("res://src/workbench_controller.gd").new("scripts.global-macros", view, _global_commands.reload, _global_commands.teardown))


func _refresh_record(operation: ProvidenceEditorOperation, record: String) -> Dictionary:
	if operation == null:
		return await _operations.run_workflow(_bridge, "Load script authoring", _refresh_record.bind(record))
	if record == "actionPoint" and _maps.maps.is_empty():
		var maps_response := await _maps.reload_catalog(operation)
		if not maps_response.get("ok", false): return maps_response
	if record in ["actionPoint", "extraActionPoint", "encounter", "complexEncounter"]:
		var catalog_response := await _load_action_catalog(operation)
		if not catalog_response.get("ok", false): return _action_catalog_failure(catalog_response)
	var map_identity := _map_context() if record == "actionPoint" else ""
	var preferred := str(_records[record].selected_identity())
	return await _records[record].reload(preferred, operation, map_identity, not preferred.is_empty())


func _bind_encounters(view: Control) -> void:
	_add_record("encounters.simple", view,
		{"record": "encounter", "commitKey": "draft", "list": "encounter.list-simple", "open": "encounter.open-simple", "update": "encounter.apply-simple-draft", "limit": 128})
	view.encounter_open_requested.connect(open_simple_encounter)
	view.encounter_apply_draft_requested.connect(commit_simple_encounter)
	view.create_requested.connect(_create_simple_encounter)
	view.copy_source_requested.connect(_preview_simple_encounter_copy_source)
	view.prompt_search_requested.connect(_search_encounter_prompts)
	_bind_encounter_links(view)
	view.selection_changed.connect(func(document, references): inspector_requested.emit("encounter", document, references))


func _bind_complex_encounters(view: Control) -> void:
	_add_record("encounters.complex", view,
		{"record": "complexEncounter", "commitKey": "draft", "list": "encounter.list-complex", "open": "encounter.open-complex", "update": "encounter.apply-complex-draft", "limit": 128})
	view.encounter_open_requested.connect(open_complex_encounter)
	view.encounter_apply_draft_requested.connect(commit_complex_encounter)
	view.create_requested.connect(_create_complex_encounter)
	view.copy_source_requested.connect(_preview_complex_encounter_copy_source)
	view.prompt_search_requested.connect(func(query): _search_encounter_prompts_for(view, query))
	view.response_search_requested.connect(_search_complex_response)
	view.rogue_search_requested.connect(_search_rogue_encounters)
	_bind_encounter_links(view)
	view.selection_changed.connect(func(document, references): inspector_requested.emit("complex-encounter", document, references))


func _bind_encounter_links(view: Control) -> void:
	view.action_target_search_requested.connect(func(query): _search_action_targets(view, query))
	view.action_form_describe_requested.connect(func(query, request_id, slot): _describe_action_form(view, query, request_id, slot))
	view.message_open_requested.connect(func(id): message_requested.emit(id))
	view.semantic_target_open_requested.connect(func(kind, id, identity, context): semantic_target_requested.emit(kind, id, identity, context))
	view.sound_preview_requested.connect(func(id, identity, status): sound_preview_requested.emit(id, identity, status))
	view.code_help_requested.connect(func(code, origin): code_help_requested.emit(code, origin))
	view.manual_requested.connect(func(page, origin): manual_requested.emit(page, origin))


func _bind_story_route_tabs(view: Control) -> void:
	var routes := {"ActionPointsRouteTab": "scripts.action-points", "ExtraActionPointsRouteTab": "scripts.macros",
		"GlobalMacrosRouteTab": "scripts.global-macros", "StoryFlagsRouteTab": "scripts.quests"}
	for name in routes:
		var button := view.get_node("StoryRouteTabs/" + name) as Button
		button.disabled = false
		button.pressed.connect(func(): route_requested.emit(routes[name]))
	_bind_context_routes(view)


func _bind_context_routes(view: Control) -> void:
	view.find_child("ContextRoutes", true, false).route_requested.connect(route_requested.emit)


func _bind_extra_actions(view: Control) -> void:
	_add_record("scripts.macros", view,
		{"record": "extraActionPoint", "commitKey": "draft", "list": "extra-action-point.list", "open": "extra-action-point.open", "update": "extra-action-point.apply-draft", "limit": 128})
	_bind_story_route_tabs(view)
	view.row_open_requested.connect(open_extra_action_point)
	view.row_update_requested.connect(commit_extra_action_point)
	view.action_retarget_requested.connect(retarget_extra_action_point_action)
	view.extra_code_update_requested.connect(upsert_extra_code)
	view.catalog_query_requested.connect(func(preferred): _records.extraActionPoint.reload(preferred))
	view.create_requested.connect(_create_extra_action_point)
	view.duplicate_requested.connect(_duplicate_extra_action_point)
	view.delete_requested.connect(_delete_extra_action_point)
	view.selection_changed.connect(func(document, references): inspector_requested.emit("extra-action-point", document, references))
	_bind_step_links(view)


func _bind_action_points() -> void:
	_bind_story_route_tabs(_action_points)
	_action_points.map_changed_requested.connect(reload_action_points_for_map)
	_action_points.row_open_requested.connect(open_action_point)
	_action_points.row_update_requested.connect(commit_action_point)
	_action_points.action_retarget_requested.connect(retarget_action_point_action)
	_action_points.extra_code_update_requested.connect(upsert_action_point_extra_code)
	_action_points.catalog_query_requested.connect(func(preferred): _records.actionPoint.reload(preferred, null, _map_context()))
	_action_points.create_requested.connect(_create_action_point)
	_action_points.duplicate_requested.connect(_duplicate_action_point)
	_action_points.clear_requested.connect(_clear_action_point)
	_action_points.action_point_open_requested.connect(open_action_point_by_record_index)
	_action_points.map_behavior_requested.connect(func(identity, x, y): map_behavior_requested.emit(identity, x, y))
	_action_points.map_reveal_requested.connect(func(identity, x, y): map_reveal_requested.emit(identity, x, y))
	_action_points.selection_changed.connect(func(document, references): inspector_requested.emit("action-point", document, references))
	_bind_step_links(_action_points)


func _bind_step_links(view: Control) -> void:
	view.action_target_search_requested.connect(func(query): _search_action_targets(view, query))
	view.action_form_describe_requested.connect(func(query, request_id, slot): _describe_action_form(view, query, request_id, slot))
	view.code_help_requested.connect(func(code, origin): code_help_requested.emit(code, origin))
	view.message_open_requested.connect(func(id): message_requested.emit(id))
	view.sound_open_requested.connect(func(id): sound_requested.emit(id))
	view.sound_preview_requested.connect(func(id, identity, status): sound_preview_requested.emit(id, identity, status))
	view.sound_stop_requested.connect(func(): sound_stop_requested.emit())
	view.simple_encounter_open_requested.connect(open_simple_encounter_by_native_id)
	view.extra_action_point_open_requested.connect(open_extra_action_point_by_native_id)
	view.semantic_target_open_requested.connect(func(kind: String, native_id: int, identity: String, context: Dictionary):
		semantic_target_requested.emit(kind, native_id, identity, context))


func attach_session(bridge: RefCounted) -> void:
	_bridge = bridge
	_action_catalog.clear()
	_pending_form_descriptions.clear()
	for owner in _records.values(): owner.attach_session(bridge)
	if _documents.peek("scripts.global-macros") != null: _global_commands.attach_session(bridge)


func teardown() -> void:
	_bridge = null
	reset_projection(0)


# Session fan-out visits realized pages only; a page realized later starts empty and stale.
func reset_projection(revision: int) -> void:
	for route in ["encounters.simple", "encounters.complex", "scripts.macros"]:
		var view: Control = _documents.peek(route)
		if view != null: view.set_summaries({"items": [], "total": 0}, revision)
	var globals: Control = _documents.peek("scripts.global-macros")
	if globals != null: globals.set_document({"revision": revision, "hooks": [], "assignedScripts": []})


func dispose() -> void:
	# A queued form read outlives the shell's operation; an empty queue ends its drain.
	_pending_form_descriptions.clear()
	for owner in _records.values(): owner.dispose()
	if _documents.peek("scripts.global-macros") != null: _global_commands.dispose()


func commit_simple_encounter(encounter: Dictionary) -> void:
	await _record("encounter").commit(encounter)


func commit_complex_encounter(encounter: Dictionary) -> void:
	await _record("complexEncounter").commit(encounter)


func retarget_encounter_prompt(identity: String, target_native_id: int) -> void:
	await _record("encounter").submit("encounter.prompt.retarget", {"source": identity, "targetNativeId": target_native_id})


func retarget_encounter_action(identity: String, slot: int, target_native_id: int) -> void:
	await _record("encounter").submit("action-reference.retarget", {"source": identity, "slot": slot, "targetNativeId": target_native_id})


func commit_extra_action_point(extra_action_point: Dictionary) -> void:
	await _record("extraActionPoint").commit(extra_action_point)


func update_global_macros(hooks: Dictionary) -> void:
	await _global_commands.update_hooks(hooks)


func retarget_extra_action_point_action(identity: String, slot: int, target_native_id: int) -> void:
	await _record("extraActionPoint").submit("action-reference.retarget", {"source": identity, "slot": slot, "targetNativeId": target_native_id})


func commit_action_point(action_point: Dictionary) -> void:
	await _record("actionPoint").commit(action_point)


func retarget_action_point_action(identity: String, slot: int, target_native_id: int) -> void:
	await _record("actionPoint").submit("action-reference.retarget", {"source": identity, "slot": slot, "targetNativeId": target_native_id})


func upsert_action_point_extra_code(row: Dictionary) -> void:
	await _record("actionPoint").submit("extra-code.upsert", {"row": row})


func upsert_extra_code(row: Dictionary) -> void:
	await _record("extraActionPoint").submit("extra-code.upsert", {"row": row})


func _load_action_catalog(operation: ProvidenceEditorOperation) -> Dictionary:
	if not _action_catalog.is_empty(): return {"ok": true, "result": _action_catalog}
	var response := await operation.request("action-definition.list", {"cursor": "0", "limit": 128})
	if response.get("ok", false):
		_action_catalog = (response.result as Dictionary).duplicate(true)
		# Pages realized later receive the catalog when they bind.
		for route in RECORD_ROUTES.values():
			var view: Control = _documents.peek(route)
			if view != null: view.set_action_catalog(_action_catalog)
	return response


func _search_encounter_prompts(query: String) -> void:
	await _search_encounter_prompts_for(_encounters, query)


func _search_encounter_prompts_for(view: Control, query: String) -> void:
	if _bridge == null: return
	var response: Dictionary = await _operations.run_workflow(_bridge, "Find encounter prompt", _request_encounter_prompts.bind(query))
	if _accept_response.call(response): view.set_prompt_page(response.result)


func _request_encounter_prompts(operation: ProvidenceEditorOperation, query: String) -> Dictionary:
	return await operation.request("encounter.list-prompts", {"query": query})


func _search_complex_response(kind: String, query: String) -> void:
	if _bridge == null: return
	var response: Dictionary = await _operations.run_workflow(_bridge, "Find Complex Encounter response", _request_complex_response.bind(kind, query))
	if _accept_response.call(response): _complex_encounters.set_response_page(response.result)


func _request_complex_response(operation: ProvidenceEditorOperation, kind: String, query: String) -> Dictionary:
	return await operation.request("action-target.list", {"query": {"kind": kind, "search": query, "limit": 128}})


func _search_rogue_encounters(query: String) -> void:
	if _bridge == null: return
	var response: Dictionary = await _operations.run_workflow(_bridge, "Find Rogue Encounter", _request_rogue_encounters.bind(query))
	if _accept_response.call(response):
		var page := response.result as Dictionary
		if not query.strip_edges().is_empty():
			var filtered: Array = []
			for value in page.get("items", []) as Array:
				var item := value as Dictionary
				if ("%s %s" % [item.get("nativeId", ""), item.get("label", "")]).to_lower().contains(query.to_lower()): filtered.append(item)
			page["items"] = filtered
		_complex_encounters.set_rogue_page(page)


func _request_rogue_encounters(operation: ProvidenceEditorOperation, _query: String) -> Dictionary:
	return await operation.request("encounter.list-rogue", {"offset": 0, "limit": 128})


func _action_catalog_failure(response: Dictionary) -> Dictionary:
	var failure := response.duplicate(true)
	if str(failure.get("error", "")).begins_with("unknown method action-definition."):
		failure["adapterProtocolMismatch"] = true
		failure["error"] = "The running native adapter does not match this editor. Restart Providence with a matching native build."
	failed.emit(str(failure.get("error", "Action definitions could not be loaded.")))
	return failure


func _search_action_targets(view: Control, query: Dictionary) -> void:
	if _bridge == null: return
	var request := query.duplicate(true)
	var generation: int = int(request.get("requestGeneration", -1))
	request.erase("requestGeneration")
	var response: Dictionary = await _operations.run_workflow(_bridge, "Find action target", _request_action_targets.bind(request))
	if _accept_response.call(response):
		response.result["requestGeneration"] = generation
		if str(request.get("kind", "")) == "map-tile":
			var context := request.get("context", {}) as Dictionary
			var map_identity := str(context.get("mapIdentity", ""))
			if not map_identity.is_empty():
				var resource_ids: Array = []
				for value in response.result.get("items", []) as Array:
					var preview := str((value as Dictionary).get("preview", ""))
					if preview.begins_with("cicn:"): resource_ids.append(int(preview.trim_prefix("cicn:")))
				var atlas := await _operations.run_workflow(_bridge, "Read destination tile palette", _request_map_tile_atlas.bind(map_identity, resource_ids))
				if _accept_response.call(atlas): response.result["mapTileAtlas"] = atlas.result
		view.set_action_target_page(response.result)


func _request_action_targets(operation: ProvidenceEditorOperation, query: Dictionary) -> Dictionary:
	return await operation.request("action-target.list", {"query": query})


func _request_map_tile_atlas(operation: ProvidenceEditorOperation, map_identity: String, resource_ids: Array) -> Dictionary:
	return await operation.request("map.render-atlas", {"identity": map_identity, "overlayResourceIds": resource_ids})


func _describe_action_form(view: Control, query: Dictionary, request_id: int, draft_slot: int) -> void:
	if _bridge == null: return
	# Coalesce edits within a step, never drop another step's pending author choice.
	var key := "%d:%d" % [view.get_instance_id(), draft_slot]
	_pending_form_descriptions[key] = {
		"view": view, "bridge": _bridge, "query": query.duplicate(true), "requestId": request_id}
	if _form_description_drain_running: return
	_form_description_drain_running = true
	call_deferred("_drain_form_descriptions")


func _drain_form_descriptions() -> void:
	while not _pending_form_descriptions.is_empty():
		while _operations.busy: await _operations.completed
		# Completion is emitted before the owning command resumes its view refresh.
		# Yield once so this background lookup cannot steal that command's follow-up.
		await _operations.get_tree().process_frame
		# Reconcile an uncertain write before resuming background form reads.
		if _pending_form_descriptions.is_empty() or _operations.requires_reopen: break
		if _operations.busy: continue
		var key: String = _pending_form_descriptions.keys()[0]
		var pending := _pending_form_descriptions[key] as Dictionary
		_pending_form_descriptions.erase(key)
		var view: Control = pending.view
		if not is_instance_valid(view) or pending.bridge != _bridge: continue
		var response: Dictionary = await _operations.run_workflow(
			_bridge, "", _request_action_form.bind(pending.query))
		if _pending_form_descriptions.has(key): continue
		if _accept_response.call(response):
			view.set_action_form_description(response.result, int(pending.requestId))
		elif not response.get("ok", false):
			view.set_action_form_description({"error": str(response.get("error", "Action choices could not be loaded."))}, int(pending.requestId))
	_form_description_drain_running = false


func _request_action_form(operation: ProvidenceEditorOperation, query: Dictionary) -> Dictionary:
	return await operation.request("action-form.describe", {"query": query})


func _create_action_point(map_identity: String, x: int, y: int) -> void:
	var response: Dictionary = await _record("actionPoint").submit("action-point.create", {
		"mapIdentity": map_identity, "x": x, "y": y})
	await _open_changed_record(response, "actionPoint", "action-point:")


func _create_simple_encounter() -> void:
	var response: Dictionary = await _record("encounter").submit("encounter.create-simple", {})
	await _open_changed_record(response, "encounter", "simple-encounter:")


func _create_complex_encounter() -> void:
	var response: Dictionary = await _record("complexEncounter").submit("encounter.create-complex", {})
	await _open_changed_record(response, "complexEncounter", "complex-encounter:")


func _preview_simple_encounter_copy_source(source: String) -> void:
	if _bridge == null: return
	var response: Dictionary = await _operations.run_workflow(_bridge, "Preview Simple Encounter source", _request_simple_encounter_copy_source.bind(source))
	if _accept_response.call(response): _encounters.set_copy_source_document(response.result)


func _request_simple_encounter_copy_source(operation: ProvidenceEditorOperation, source: String) -> Dictionary:
	return await operation.request("encounter.open-simple", {"identity": source})


func _preview_complex_encounter_copy_source(source: String) -> void:
	if _bridge == null: return
	var response: Dictionary = await _operations.run_workflow(_bridge, "Preview Complex Encounter source", _request_complex_encounter_copy_source.bind(source))
	if _accept_response.call(response): _complex_encounters.set_copy_source_document(response.result)


func _request_complex_encounter_copy_source(operation: ProvidenceEditorOperation, source: String) -> Dictionary:
	return await operation.request("encounter.open-complex", {"identity": source})


func _duplicate_action_point(source: String, x: int, y: int) -> void:
	var response: Dictionary = await _record("actionPoint").submit("action-point.duplicate", {
		"source": source, "x": x, "y": y})
	await _open_changed_record(response, "actionPoint", "action-point:")


func _clear_action_point(source: String) -> void:
	await _record("actionPoint").submit("action-point.clear", {"source": source})


func _create_extra_action_point() -> void:
	var response: Dictionary = await _record("extraActionPoint").submit("extra-action-point.create", {})
	await _open_changed_record(response, "extraActionPoint", "extra-action-point:")


func _duplicate_extra_action_point(source: String) -> void:
	var response: Dictionary = await _record("extraActionPoint").submit("extra-action-point.duplicate", {"source": source})
	await _open_changed_record(response, "extraActionPoint", "extra-action-point:")


func _delete_extra_action_point(source: String, confirmed: bool) -> void:
	await _record("extraActionPoint").submit("extra-action-point.delete", {"source": source, "confirmed": confirmed})


func _open_changed_record(response: Dictionary, record: String, prefix: String) -> void:
	if not response.get("ok", false): return
	var result := response.get("result", {}) as Dictionary
	var change := result.get("change", result) as Dictionary
	for value in change.get("changedEntities", []) as Array:
		var identity := str(value)
		if identity.begins_with(prefix):
			await _record(record).open_record(identity)
			return


func reload_simple_encounters(preferred_identity: String = "") -> bool:
	return _accept_response.call(await _record("encounter").reload(preferred_identity))


func reload_complex_encounters(preferred_identity: String = "") -> bool:
	return _accept_response.call(await _record("complexEncounter").reload(preferred_identity))


func open_simple_encounter(identity: String) -> bool:
	return _accept_response.call(await _record("encounter").open_record(identity))


func open_complex_encounter(identity: String) -> bool:
	return _accept_response.call(await _record("complexEncounter").open_record(identity))


func reload_extra_action_points(preferred_identity: String = "") -> bool:
	return _accept_response.call(await _record("extraActionPoint").reload(preferred_identity))


func reload_global_macros() -> bool:
	return _accept_response.call(await _global_commands.reload())


func reload_action_points(preferred_identity: String = "") -> bool:
	if preferred_identity.is_empty(): preferred_identity = _action_points.selected_identity()
	return _accept_response.call(await _record("actionPoint").reload(preferred_identity, null, _map_context(), not preferred_identity.is_empty()))


func reload_action_points_for_map(map_identity: String, preferred_identity: String = "") -> bool:
	return _accept_response.call(await _record("actionPoint").reload(preferred_identity, null, map_identity))


func restore_location(route: String, state: Dictionary) -> bool:
	var record := str({"scripts.action-points":"actionPoint", "scripts.macros":"extraActionPoint", "encounters.simple":"encounter", "encounters.complex":"complexEncounter"}.get(route, ""))
	if record.is_empty(): return false
	var view: Control = _documents.view(route)
	view.prime_navigation_state(state)
	var map_identity := str(state.get("mapIdentity", "")) if record == "actionPoint" else ""
	await _wait_for_form_descriptions(view)
	var restored: bool = _accept_response.call(await _record(record).reload(str(state.get("identity", "")), null, map_identity, true))
	if restored: view.restore_navigation_state(state)
	return restored


func _map_context() -> String:
	var identity := str(_action_points.current_map_identity())
	if identity.is_empty() and not _maps.maps.is_empty(): identity = str(_maps.maps[0].get("identity", ""))
	return identity


func _map_level_type() -> String:
	var identity := _map_context()
	for map: Dictionary in _maps.maps:
		if str(map.get("identity", "")) == identity:
			return str(map.get("levelType", "land"))
	return "land"


func open_action_point(identity: String) -> bool:
	return _accept_response.call(await _record("actionPoint").open_record(identity))


func open_action_point_at_step(identity: String, slot: int) -> bool:
	if str(_action_points.read_state().identity) == identity:
		_action_points.restore_navigation_state({"step": {"selectedSlot": clampi(slot, 0, 7)}}); return true
	await _wait_for_form_descriptions(_action_points)
	var catalog := await _operations.run_workflow(_bridge, "Read action catalog", _load_action_catalog)
	if not catalog.get("ok", false) or not await open_action_point(identity): return false
	_action_points.restore_navigation_state({"step": {"selectedSlot": clampi(slot, 0, 7)}})
	return true


func prepare_action_point_creation(map_identity: String, x: int, y: int) -> bool:
	if not await reload_action_points_for_map(map_identity): return false
	_action_points.set_creation_destination(x,y)
	return true


func open_source(kind: String, identity: String) -> bool:
	var record := str({"action-point": "actionPoint", "extra-action-point": "extraActionPoint", "simple-encounter": "encounter", "complex-encounter": "complexEncounter"}.get(kind, ""))
	if not RECORD_ROUTES.has(record): return false
	var view: Control = _documents.view(RECORD_ROUTES[record])
	if record in ["actionPoint", "extraActionPoint"]:
		await _wait_for_form_descriptions(view)
	var opened: bool = bool(_accept_response.call(await _record(record).open_record(identity)))
	return opened


func _wait_for_form_descriptions(_view: Control) -> void:
	var deadline := Time.get_ticks_msec() + 10000
	while _form_description_drain_running or not _pending_form_descriptions.is_empty() or _operations.busy:
		if Time.get_ticks_msec() >= deadline: return
		if _operations.busy: await _operations.completed
		else: await Engine.get_main_loop().process_frame


func repair_reference(request: Dictionary) -> void:
	var kind := str(request.source).get_slice(":", 0)
	var record := str({"action-point": "actionPoint", "extra-action-point": "extraActionPoint", "simple-encounter": "encounter", "complex-encounter": "complexEncounter"}.get(kind, ""))
	if not RECORD_ROUTES.has(record): return
	var params := {"source": str(request.source), "targetNativeId": int(request.targetNativeId)}
	var method := "encounter.prompt.retarget"
	if str(request.field) != "promptMessage":
		if int(request.slot) < 0: return
		method = "action-reference.retarget"
		params["slot"] = int(request.slot)
	await _record(record).submit(method, params)


func open_action_point_by_record_index(record_index: int) -> void:
	var map_identity := str(_action_points.current_map_identity())
	if not map_identity.begins_with("land:"):
		failed.emit("Same-map Action Point navigation requires a land map context.")
		return
	var level_index := map_identity.get_slice(":", 1).to_int()
	var identity := "action-point:land:%d:%d" % [level_index, record_index]
	if await open_action_point(identity): route_requested.emit("scripts.action-points")


func open_extra_action_point(identity: String) -> bool:
	return _accept_response.call(await _record("extraActionPoint").open_record(identity))


func open_extra_action_point_by_native_id(native_id: int) -> void:
	if await open_extra_action_point("extra-action-point:%d" % native_id): route_requested.emit("scripts.macros")


func open_simple_encounter_by_native_id(native_id: int) -> void:
	if await open_simple_encounter("simple-encounter:%d" % native_id): route_requested.emit("encounters.simple")


func open_complex_encounter_by_native_id(native_id: int) -> void:
	if await open_complex_encounter("complex-encounter:%d" % native_id): route_requested.emit("encounters.complex")
