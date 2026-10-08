extends Node

var view: Window
var _operations: ProvidenceEditorOperation
var _context: Callable
var _bridge: Callable
var _open_record: Callable
var _open_source: Callable
var _display_context: Dictionary = {}
var _generation := 0
var _preview_generation := 0
var _history: Array[Dictionary] = []
var _pending: Dictionary = {}
var _previews: Dictionary = {}
var _restart_retry := false
var _replacement
var _retained: Dictionary = {}
var summary_error := ""

func initialize(operations: ProvidenceEditorOperation, context: Callable, bridge: Callable, navigation, open_record: Callable) -> void:
	_operations = operations
	_context = context
	_bridge = bridge
	_open_record = open_record
	_open_source = navigation.open_script_source
	view = preload("res://src/discovery_flow_view.tscn").instantiate()
	add_child(view)
	view.action_requested.connect(_action)
	view.node_requested.connect(_preview)
	view.closed.connect(_closed)
	view.caller_requested.connect(_choose_caller)
	view.candidate_requested.connect(_inspect_candidate)
	navigation.navigation_canceled.connect(view.resume_after_canceled_navigation)
	navigation.source_navigation_failed.connect(view.navigation_failed)

func _choose_caller(selection: Dictionary) -> void:
	if view.loading or not _current(): return
	_push_history()
	view.model.reset(selection)
	await _refresh()

func _inspect_candidate(selection: Dictionary) -> void:
	if not _current(): return
	_preview_generation += 1
	var token := _preview_generation
	var interaction: int = view.selection_serial
	var response := await _read("discovery.flow-summaries", {"selections":[selection]}, _generation, token)
	if interaction != view.selection_serial or token != _preview_generation: return
	if response.get("ok", false) and response.result.items[0].has("summary"):
		view.inspector.show_candidate(response.result.items[0].summary)

func open(selection: Dictionary) -> void:
	var root := preload("res://src/discovery_selection.gd").flow_selection(selection)
	if view.suspended and not view.model.nodes.is_empty():
		view.present()
		view.render(not _history.is_empty())
		if _display_context != _context.call(): view.mark_stale()
		return
	if view.model.same_selection(root, view.model.root) and _display_context == _context.call() and not view.model.nodes.is_empty():
		view.present()
		view.render(not _history.is_empty())
		if _restart_retry or view.stale: await _refresh()
		elif not _pending.is_empty(): await _load()
		return
	_history.clear()
	view.model.reset(root)
	view.present()
	if str(root.identity).is_empty():
		_generation += 1
		view.render(false)
		view.mark_stale("Select an existing record. Apply a new record in its editor before viewing flow.")
		return
	await _refresh()

func _closed() -> void:
	if view.loading: _restart_retry = true
	_generation += 1
	_preview_generation += 1
	view.loading = false
	_replacement = null
	_pending.clear()

func _process(_delta: float) -> void:
	if view == null: return
	if not _context.call().get("connected", false):
		if view.visible or view.suspended: view.close_view()
		return
	if not view.visible or view.stale: return
	if not _display_context.is_empty() and _context.call() != _display_context:
		_generation += 1
		_preview_generation += 1
		view.loading = false
		_pending.clear()
		_replacement = null
		_restart_retry = true
		view.render(not _history.is_empty())
		view.mark_stale()

func _refresh() -> void:
	_restart_retry = false
	_generation += 1
	_preview_generation += 1
	_previews.clear()
	_display_context = _context.call().duplicate(true)
	view.graph.save_positions()
	_retained = view.model.snapshot()
	_replacement = preload("res://src/discovery_flow_state.gd").new()
	_replacement.reset(view.model.root)
	_replacement.categories = view.model.categories.duplicate()
	_replacement.depth = view.model.depth
	_replacement.direction = view.model.direction
	view.stale = false
	view.get_node("%Notice").text = "Showing applied project state; unapplied edits are excluded."
	_pending = {"root":view.model.root.duplicate(true), "direction":view.model.direction, "depth":view.model.depth, "categories":view.model.categories.duplicate(), "group":"initial", "origin":""}
	await _load()

func _load() -> void:
	var generation := _generation
	view.loading = true
	view.get_node("%Retry").visible = false
	view.render(not _history.is_empty())
	while generation == _generation and not _pending.is_empty():
		var params := _pending.duplicate(true)
		params.erase("group")
		params.erase("origin")
		var response := await _read("discovery.flow", params, generation)
		if generation != _generation: return
		if not response.get("ok", false):
			if not response.get("stale", false):
				var error := str(response.get("error", "Flow could not be loaded"))
				_restart_retry = error.begins_with("This flow continuation expired")
				if _replacement != null:
					_restart_retry = true
					view.mark_stale("Refresh failed; the previous view is retained. Retry to load current state.")
				view.show_failure(error)
			return
		var target = _replacement if _replacement != null else view.model
		target.merge_page(response.result.graph, _pending.group, _pending.origin, _pending.direction)
		view.render(not _history.is_empty())
		if response.result.get("cursor") == null or target.limited: _pending.clear()
		else: _pending.cursor = response.result.cursor
		await get_tree().process_frame
	if generation != _generation: return
	_accept_replacement()
	await _summaries(generation)
	if generation != _generation: return
	view.loading = false
	view.render(not _history.is_empty())
	if _retained.get("nodes", {}).is_empty() and view.model.groups.size() == 1:
		if view.model.nodes.size() < 30: view.graph.fit_content()
		else: view.graph.recenter(view.root_id())
	else:
		view.graph.zoom = view.model.viewport.zoom
		view.graph.scroll_offset = view.model.viewport.scroll
	_preview(view.model.selected)

func _accept_replacement() -> void:
	if _replacement == null: return
	for id in _replacement.nodes:
		if _retained.positions.has(id): _replacement.positions[id] = _retained.positions[id]
	if _replacement.nodes.has(_retained.selected):
		_replacement.selected = _retained.selected
		_replacement.step = _retained.step
		_replacement.steps_expanded = _retained.steps_expanded
		_replacement.inspector_tab = _retained.inspector_tab
	if _replacement.edges.has(_retained.edge): _replacement.edge = _retained.edge
	_replacement.viewport = _retained.viewport.duplicate()
	_replacement.manual_positions = _retained.manual_positions.duplicate()
	_replacement.group_positions = _retained.group_positions.duplicate()
	_replacement.nodes_locked = _retained.nodes_locked
	_replacement.revealed = _retained.revealed.duplicate()
	_replacement.source_edge = _retained.source_edge if _replacement.edges.has(_retained.source_edge) else ""
	_replacement.occurrence_filter = _retained.occurrence_filter.filter(func(id): return _replacement.edges.has(id))
	view.model = _replacement
	_replacement = null

func _summaries(generation: int) -> void:
	summary_error = ""
	var selections: Array = []
	for id in view.model.nodes:
		if not view.model.summaries.has(id): selections.append(view.model.nodes[id].selection.duplicate(true))
	while not selections.is_empty() and generation == _generation:
		var batch := selections.slice(0, 64)
		selections = selections.slice(64)
		var response := await _read("discovery.flow-summaries", {"selections":batch}, generation)
		if generation != _generation: return
		if not response.get("ok", false):
			summary_error = str(response.get("error", "Summary request failed"))
			view.get_node("%Notice").text = "Step summaries unavailable. Refresh to retry; loaded relationships are retained."
			return
		for item: Dictionary in response.result.items:
			if item.has("summary"): view.model.summaries[item.id] = item.summary
		view.render(not _history.is_empty())
		await get_tree().process_frame

func _read(method: String, params: Dictionary, generation: int, preview_token := -1) -> Dictionary:
	if not _display_context.get("connected", false): return {"ok":false, "error":"Open a project to view flow."}
	while _operations.busy:
		await get_tree().process_frame
		if generation != _generation or (preview_token >= 0 and preview_token != _preview_generation): return {"ok":false, "stale":true}
	if generation != _generation or _context.call() != _display_context or (preview_token >= 0 and preview_token != _preview_generation): return {"ok":false, "stale":true}
	params.merge({"expectedRevision":_display_context.revision, "projectId":_display_context.projectId, "generation":generation}, true)
	var response := await _operations.run_workflow(_bridge.call(), "Read record flow", func(operation): return await operation.request(method, params))
	if generation != _generation or _context.call() != _display_context: return {"ok":false, "stale":true}
	return response

func _action(action: String) -> void:
	if action == "refresh" and view.loading:
		_cancel_load()
		return
	if action == "refresh" or action == "retry" and _restart_retry:
		await _refresh()
		return
	if action in ["filters", "query"]:
		_push_history()
		view.model.categories = view.filter_categories()
		view.model.depth = view.query_depth()
		view.model.direction = view.query_direction()
		await _refresh()
		return
	if action == "back":
		await _restore_previous()
		return
	if not _current(): return
	match action:
		"retry":
			if _restart_retry: await _refresh()
			elif not _pending.is_empty(): await _load()
		"focus": await _focus_selected()
		"upstream", "downstream": await _expand(action)
		"collapse":
			view.model.collapse(view.model.selected)
			view.render(not _history.is_empty())
		"open-record": await _navigate_record()
		"open-source": await _navigate_source()

func _cancel_load() -> void:
	_generation += 1
	_preview_generation += 1
	_pending.clear()
	if _replacement != null and not _retained.is_empty(): view.model.restore(_retained)
	_replacement = null
	view.loading = false
	if view.model.nodes.is_empty():
		view.close_view()
		return
	_restart_retry = true
	view.render(not _history.is_empty())
	view.mark_stale("Loading canceled. Previous view retained; refresh to retry.")
	view.get_node("%Retry").visible = true

func _expand(direction: String) -> void:
	if view.loading or not view.model.nodes.has(view.model.selected): return
	if view.model.limited: return
	_generation += 1
	var id: String = view.model.selected
	_pending = {"root":view.model.nodes[id].selection.duplicate(true), "direction":direction, "depth":1,
		"categories":view.model.categories.duplicate(), "group":id + ":" + direction, "origin":id}
	await _load()

func _focus_selected() -> void:
	if view.loading or not view.model.nodes.has(view.model.selected): return
	_push_history()
	var selection: Dictionary = view.model.nodes[view.model.selected].selection.duplicate(true)
	view.model.reset(selection)
	await _refresh()

func _push_history() -> void:
	view.graph.save_positions()
	_history.append({"model":view.model.snapshot(), "context":_display_context.duplicate(true)})
	if _history.size() > 16: _history.pop_front()

func _restore_previous() -> void:
	if _history.is_empty(): return
	_generation += 1
	_preview_generation += 1
	_pending.clear()
	var previous: Dictionary = _history.pop_back()
	view.model.restore(previous.model)
	_display_context = previous.context
	view.loading = false
	view.stale = false
	view.render(not _history.is_empty())
	view.graph.zoom = view.model.viewport.zoom
	view.graph.scroll_offset = view.model.viewport.scroll
	if _display_context != _context.call(): await _refresh()

func _preview(id: String) -> void:
	_preview_generation += 1
	var token := _preview_generation
	if not _current() or not view.model.nodes[id].navigable: return
	var selection: Dictionary = view.model.nodes[id].selection
	var key := JSON.stringify(selection)
	if _previews.has(key):
		view.show_preview(_previews[key], id)
		return
	var response := await _read("discovery.preview", {"identity":selection.identity, "scope":selection.scope}, _generation, token)
	if token == _preview_generation and response.get("ok", false):
		if _previews.size() >= 64: _previews.erase(_previews.keys()[0])
		_previews[key] = response.result
		view.show_preview(response.result, id)

func _navigate_record() -> void:
	var id: String = view.model.selected
	var edge: Dictionary = view.model.edges.get(view.model.edge, {})
	if not edge.is_empty(): id = view.inspector.target_node()
	if not view.model.nodes.has(id) or not view.model.nodes[id].navigable: return
	var selected: Dictionary = view.model.nodes[id].selection.duplicate(true)
	var generation := _generation
	var interaction: int = view.selection_serial
	var response := await _read("discovery.preview", {"identity":selected.identity, "scope":selected.scope}, generation)
	if generation != _generation or interaction != view.selection_serial: return
	if not response.get("ok", false):
		view.show_failure(str(response.get("error", "The selected record is unavailable")), false)
		return
	view.suspend_for_navigation()
	var reference: Dictionary = edge.get("reference", {}).duplicate(true)
	if selected.get("entryPosition") != null: reference.codePosition = selected.entryPosition
	if selected.get("entryPosition") != null: reference.entryPosition = selected.entryPosition
	if selected.get("throughPosition") != null: reference.throughPosition = selected.throughPosition
	if selected.get("callerContext") != null: reference.callerContext = selected.callerContext
	await _open_record.call(response.result.record, {"originReference":reference})

func _navigate_source() -> void:
	var reference: Dictionary = view.model.source_reference()
	if reference.is_empty(): return
	_preview_generation += 1
	var generation := _generation
	var interaction: int = view.selection_serial
	while _operations.busy:
		await get_tree().process_frame
		if generation != _generation or interaction != view.selection_serial: return
	if not _current(): return
	view.suspend_for_navigation()
	await _open_source.call(reference)

func _current() -> bool:
	if view.loading: return false
	if _display_context != _context.call() or not _display_context.get("connected", false):
		view.mark_stale()
		return false
	return not view.stale
