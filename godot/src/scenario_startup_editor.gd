extends ProvidenceScenarioSectionEditor

var _map_identity := ""
var _map_label := ""
var _picker: Window
var _searching := false
var _pending_search: Dictionary = {}
var _map_resolves := false
var _rule_dialog: Window
var _rule_operations: ProvidenceEditorOperation
var _rule_read_bridge: Callable
var _rule_controller := preload("res://src/classic_rule_selection_controller.gd").new()


func _ready() -> void:
	_picker = preload("res://src/scenario_map_picker.tscn").instantiate()
	add_child(_picker)
	_picker.search_requested.connect(_search_maps)
	_picker.accepted.connect(_accept_map)
	find_child("ChooseStartupLand", true, false).pressed.connect(_choose_map)
	find_child("MakeStartupMapCurrent", true, false).pressed.connect(func(): if not _map_identity.is_empty(): map_open_requested.emit(_map_identity))
	_rule_dialog = preload("res://src/classic_rule_selection_dialog.tscn").instantiate()
	add_child(_rule_dialog)
	find_child("ClassicRuleSource", true, false).pressed.connect(_rule_controller.open)
	visibility_changed.connect(func(): if not is_visible_in_tree(): _rule_controller.teardown())
	super._ready()
	if _rule_operations != null: _rule_controller.initialize(self, _rule_dialog, _rule_operations, _rule_read_bridge)


func configure_operations(operations: ProvidenceEditorOperation, read_bridge: Callable) -> void:
	super.configure_operations(operations, read_bridge)
	_rule_operations = operations
	_rule_read_bridge = read_bridge
	if is_instance_valid(_rule_dialog): _rule_controller.initialize(self, _rule_dialog, operations, read_bridge)


func configure_authoring(accept_draft: Callable) -> void:
	super.configure_authoring(accept_draft)
	_rule_controller.configure_authoring(accept_draft)


func draft_changed() -> void:
	super.draft_changed()
	set_extra_interaction(can_edit())

func editing_nodes() -> Array:
	return [text_field("ScenarioName"), text_field("MarkerFile"), text_field("RecommendedLevel"),
		text_field("MaximumLevel"), text_field("CreatorUserCheck"), text_field("StartupX"), text_field("StartupY")]


func render_projection(result: Dictionary) -> void:
	_rule_controller.has_receipt()
	var startup: Dictionary = result.get("startup", {})
	var location: Dictionary = result.get("startLocation", {}) if result.get("startLocation") is Dictionary else {}
	var coordinate: Dictionary = location.get("coordinate", {})
	for pair in [["ScenarioName", "name"], ["MarkerFile", "markerFilename"], ["CreatorUserCheck", "creatorUserCheck"]]:
		text_field(pair[0]).text = str(startup.get(pair[1], ""))
	text_field("RecommendedLevel").text = str(int(startup.get("recommendedPartyLevels", 0)))
	text_field("MaximumLevel").text = str(int(startup.get("maximumPartyLevels", 0)))
	text_field("StartupX").text = str(int(coordinate.get("x", 0)))
	text_field("StartupY").text = str(int(coordinate.get("y", 0)))
	_map_identity = str(location.get("map", ""))
	_map_label = _map_identity.replace("land:", "Land ")
	_map_resolves = bool(result.get("startMapResolves", false))
	_refresh_map()
	find_child("SourceEvidence", true, false).text = str(result.get("source", "No retained startup source."))


func draft_params() -> Dictionary:
	var values := {}
	for pair in [["RecommendedLevel", 2147483647], ["MaximumLevel", 2147483647], ["StartupX", 89], ["StartupY", 89]]:
		var checked := integer_field(pair[0], pair[1])
		if checked.has("localError"): return checked
		values[pair[0]] = checked.value
	if _map_identity.is_empty(): return {"localError": "Choose a startup land map first."}
	return {"startup": {"name": text_field("ScenarioName").text, "markerFilename": text_field("MarkerFile").text,
		"creatorUserCheck": text_field("CreatorUserCheck").text, "recommendedPartyLevels": values.RecommendedLevel,
		"maximumPartyLevels": values.MaximumLevel,
		"startLocation": {"map": _map_identity, "coordinate": {"x": values.StartupX, "y": values.StartupY}}}}


func extra_draft_token() -> Dictionary:
	return {"map": _map_identity}


func clear_extra_state() -> void:
	_rule_controller.teardown()
	_map_identity = ""
	_map_label = ""
	_map_resolves = false
	_pending_search.clear()
	if is_instance_valid(_picker): _picker.cancel(false)
	_refresh_map()


func _refresh_map() -> void:
	find_child("ChooseStartupLand", true, false).text = (_map_label + " · Choose…") if not _map_identity.is_empty() else "Choose land map…"
	find_child("MakeStartupMapCurrent", true, false).disabled = _map_identity.is_empty() or not _map_resolves


func _choose_map() -> void:
	if not can_edit(): return
	_picker.begin({"destination": "Scenario · Startup · Land", "current": _map_identity,
		"revision": applied_revision(), "token": draft_token()}, find_child("ChooseStartupLand", true, false))


func _search_maps(query: Dictionary, generation: int) -> void:
	query["currentIdentity"] = _map_identity
	query["seekCurrent"] = int(query.offset) == 0 and str(query.query).is_empty()
	_pending_search = {"query": query.duplicate(true), "generation": generation}
	if _searching: return
	_searching = true
	while not _pending_search.is_empty() and _picker.visible:
		var pending := _pending_search.duplicate(true)
		_pending_search.clear()
		var response := await controller.query("map.catalog", pending.query)
		if response.get("busy", false):
			if _pending_search.is_empty(): _pending_search = pending
			await get_tree().process_frame
			continue
		_picker.receive_page(response, int(pending.generation))
	_searching = false


func _accept_map(identity: String, context: Dictionary) -> void:
	if applied.is_empty() or context.get("revision") != applied_revision() or context.get("token") != draft_token(): return
	if identity == _map_identity: return
	_map_identity = identity
	_map_label = identity.replace("land:", "Land ")
	_map_resolves = true
	_refresh_map()
	draft_changed()


func set_extra_interaction(enabled: bool) -> void:
	find_child("ChooseStartupLand", true, false).disabled = not enabled
	find_child("MakeStartupMapCurrent", true, false).disabled = not enabled or _map_identity.is_empty() or not _map_resolves
	var imported := bool(applied.get("startup", {}).get("imported", false))
	var dirty := has_unapplied_changes()
	var receipt: bool = _rule_controller.has_receipt()
	find_child("ClassicRuleSource", true, false).disabled = (not enabled and not receipt) or not imported or dirty
	find_child("ClassicRuleReason", true, false).text = "Apply or discard Startup before changing Classic rules." if dirty else (
		"Classic rule source applies to imported scenarios. New scenarios use their authored rules." if not imported else "")


func restore_extra_draft(token: Dictionary) -> void:
	_map_identity = str(token.get("map", _map_identity))
	_map_label = _map_identity.replace("land:", "Land ")
	_refresh_map()
