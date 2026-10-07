extends Node

var _view: Window
var _operations: ProvidenceEditorOperation
var _context: Callable
var _bridge: Callable
var _navigation
var _registry
var _tabs: TabContainer
var _generation := 0
var _query_generation := 0
var _preview_generation := 0
var _display_context: Dictionary = {}
var _code_helper: Window

func initialize(operations: ProvidenceEditorOperation, context: Callable, bridge: Callable, navigation, registry, tabs: TabContainer) -> void:
	_operations = operations
	_context = context
	_bridge = bridge
	_navigation = navigation
	_registry = registry
	_tabs = tabs
	_view = preload("res://src/discovery_view.tscn").instantiate()
	add_child(_view)
	_view.query_requested.connect(search)
	_view.preview_requested.connect(preview)
	_view.links_requested.connect(links)
	_view.open_record_requested.connect(open_record)
	_view.open_source_requested.connect(open_source)
	_view.open_target_requested.connect(open_target)
	_view.trace_branch_requested.connect(trace_branch)
	_view.closed.connect(func(): _generation += 1)
	_navigation.navigation_canceled.connect(_view.resume_after_canceled_navigation)
	_navigation.source_navigation_failed.connect(_view.navigation_failed)

func open_search() -> void:
	_generation += 1
	_view.open_search()

func configure_help(code_helper: Window) -> void:
	_code_helper = code_helper

func open_current_links(direction: String) -> void:
	var view: Control = _tabs.get_current_tab_control()
	var route := str(_registry.identity_for_tab(_tabs.current_tab))
	var selected := preload("res://src/discovery_selection.gd").record(view, route)
	_generation += 1
	if selected.kind.is_empty() or selected.identity.is_empty():
		_view.open_links({}, direction)
		_view.show_failure("Select an authoring record before opening Links")
		return
	if selected.get("linkOnly", false):
		_view.open_links(selected, direction)
		return
	var response := await _read("discovery.preview", {"identity":selected.identity, "scope":selected.scope})
	if view != _tabs.get_current_tab_control() or selected != preload("res://src/discovery_selection.gd").record(view, route): return
	if response.get("ok", false): _view.open_links(response.result.record, direction)
	elif not response.get("stale", false):
		_view.open_links({}, direction)
		_view.show_failure(str(response.get("error", "The selected record cannot be traced")))

func search(query: String, scope: String, kind: String, offset: int) -> void:
	_query_generation += 1
	_preview_generation += 1
	var query_generation := _query_generation
	var interaction: int = _view.interaction_token()
	var response := await _read("discovery.search", {"query":query, "scope":scope, "kind":kind, "offset":offset, "limit":64})
	if query_generation != _query_generation or interaction != _view.interaction_token(): return
	if response.get("ok", false):
		_display_context = _context.call().duplicate(true)
		_view.set_page(response.result)
	elif not response.get("stale", false): _view.show_failure(str(response.get("error", "Search failed")))

func preview(identity: String, scope := "scenario", query := "") -> void:
	_preview_generation += 1
	var generation := _preview_generation
	var interaction: int = _view.interaction_token()
	var response := await _read("discovery.preview", {"identity":identity, "scope":scope, "query":query})
	if generation != _preview_generation or interaction != _view.interaction_token(): return
	if response.get("ok", false):
		_display_context = _context.call().duplicate(true)
		_view.set_preview(response.result)
	elif not response.get("stale", false): _view.show_failure(str(response.get("error", "Preview failed")))

func links(record: Dictionary, direction: String, query: String, offset: int, trace_params: Dictionary = {}) -> void:
	_query_generation += 1
	_preview_generation += 1
	var generation := _query_generation
	var interaction: int = _view.interaction_token()
	var native_id: Variant = record.get("nativeId", "")
	var id := str(int(native_id)) if native_id is int or native_id is float else str(native_id)
	var params := {"direction":direction, "kind":record.get("kind", ""), "id":id, "identity":record.get("identity", ""), "scope":record.get("scope", "scenario"), "query":query, "offset":offset, "limit":64}
	params.merge(trace_params)
	if direction == "trace":
		params["ancestors"] = record.get("traceAncestors", [])
		params["requiredPosition"] = record.get("tracePosition")
		params["ancestorPositions"] = record.get("traceAncestorPositions", [])
		params["ancestorContexts"] = record.get("traceAncestorContexts", [])
		params["callerContext"] = record.get("traceCallerContext")
	if params.kind == "action-point": params.id = params.identity
	var response := await _read("discovery.trace" if direction == "trace" else "discovery.links", params)
	if generation != _query_generation or interaction != _view.interaction_token(): return
	if response.get("ok", false):
		_display_context = _context.call().duplicate(true)
		if direction == "trace":
			var trace: Dictionary = response.result.trace
			_view.set_page({"items":trace.items, "total":trace.total, "offset":offset, "workLimited":trace.workLimited, "frontiers":trace.frontiers, "depthLimit":trace.depthLimit, "remaining":trace.remaining, "batchToken":trace.batchToken})
		else: _view.set_page(response.result)
	elif not response.get("stale", false): _view.show_failure(str(response.get("error", "Links failed")))

func open_record(record: Dictionary, destination_context: Dictionary = {}) -> void:
	if not await _still_current(): return
	_view.suspend_for_navigation()
	var kind := str(record.get("kind", ""))
	if kind.ends_with("-encounter-result"):
		var identity := str(record.identity)
		var entry = destination_context.get("originReference", {}).get("codePosition")
		var position := int(entry) if entry != null else 0
		await _navigation.open_script_source({"source":identity.get_slice(":result:", 0), "field":"actions[%d]" % (int(identity.get_slice(":result:", 1)) * 8 + position)})
		return
	if kind == "scenario":
		await _navigation.select_route("scenario.startup")
		return
	if kind == "random-rectangle":
		await _navigation.open_script_source({"source":record.identity, "field":""})
		return
	if kind in ["reference-string", "personal-asset", "library-asset"] or (record.get("scope") in ["stock", "personal"] and kind in ["icon", "picture", "sound", "text-resource"]):
		await _navigation.open_discovery_catalog(str(record.identity), str(record.scope), kind)
		return
	if kind == "documentation" and _code_helper != null:
		_code_helper.open_for_code(int(record.nativeId))
		return
	if kind == "quest-flag": kind = "quest"
	if kind == "action-point": kind = "same-map-action-point"
	if kind == "icon": kind = "monster-appearance"
	if kind == "map":
		await _navigation.open_map(str(record.identity))
	else:
		await _navigation.open_script_target(kind, int(record.get("nativeId", 0)), str(record.get("identity", "")), destination_context)

func open_target(link: Dictionary) -> void:
	if not await _still_current(): return
	var interaction: Dictionary = _view.state()
	var token: int = _view.interaction_token()
	if link.get("targetIdentity") == null:
		if link.get("targetKind") == "monster": _view.choose_record_variant("monster", str(link.targetId))
		return
	var response := await _read("discovery.preview", {"identity":link.targetIdentity, "scope":link.get("targetScope", "scenario")})
	if interaction != _view.state() or token != _view.interaction_token(): return
	if response.get("ok", false): await open_record(response.result.record, {"originReference":link.duplicate(true)})
	elif not response.get("stale", false): _view.show_failure(str(response.get("error", "The linked target is unavailable")))

func trace_branch(link: Dictionary) -> void:
	if not await _still_current(): return
	var interaction: Dictionary = _view.state()
	var token: int = _view.interaction_token()
	if link.get("cycle", false):
		await open_source(link)
		return
	var ancestry: Array = link.get("tracePath", [])
	var owner: String = str(ancestry.back()) if not ancestry.is_empty() else str(link.source)
	var response := await _read("discovery.preview", {"identity":owner})
	if interaction != _view.state() or token != _view.interaction_token(): return
	if response.get("ok", false):
		var record: Dictionary = response.result.record
		record["traceAncestors"] = link.get("tracePath", []).duplicate()
		record["tracePosition"] = link.get("callerPosition")
		record["traceAncestorPositions"] = link.get("tracePositions", []).duplicate()
		record["traceAncestorContexts"] = link.get("traceContexts", []).duplicate()
		record["traceCallerContext"] = link.get("callerContext")
		_view.follow_caller(record)
	elif not response.get("stale", false): _view.show_failure(str(response.get("error", "The caller is unavailable")))

func open_source(link: Dictionary) -> void:
	if not await _still_current(): return
	_view.suspend_for_navigation()
	await _navigation.open_script_source(link.duplicate(true))

func _still_current() -> bool:
	if not _context.call().get("connected", false) or _display_context != _context.call():
		_view.show_failure("These results belong to an earlier project revision")
		return false
	return true

func _read(method: String, params: Dictionary) -> Dictionary:
	var context: Dictionary = _context.call()
	var generation := _generation
	if not context.get("connected", false): return {"ok":false, "error":"Open a project to search its contents."}
	params["expectedRevision"] = context.revision
	params["projectId"] = context.projectId
	params["generation"] = generation
	while _operations.busy:
		await get_tree().process_frame
		if generation != _generation or context != _context.call(): return {"ok":false, "stale":true}
	var response := await _operations.run_workflow(_bridge.call(), "Read scenario links", func(operation): return await operation.request(method, params))
	if generation != _generation or context != _context.call(): return {"ok":false, "stale":true}
	return response
