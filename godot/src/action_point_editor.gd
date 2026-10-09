class_name ProvidenceActionPointEditor
extends VBoxContainer

signal discovery_requested(direction: String)
signal navigation_requested(action: Callable, destination: String)

const LegacyLabels = preload("res://src/action_point_legacy_labels.gd")

signal map_changed_requested(map_identity: String)
signal row_open_requested(identity: String)
signal row_update_requested(action_point: Dictionary)
signal action_retarget_requested(identity: String, slot: int, target_native_id: int)
signal extra_code_update_requested(row: Dictionary)
signal message_open_requested(native_id: int)
signal sound_open_requested(native_id: int)
signal sound_preview_requested(native_id: int, identity: String, status: String)
signal sound_stop_requested
signal simple_encounter_open_requested(native_id: int)
signal extra_action_point_open_requested(native_id: int)
signal action_point_open_requested(record_index: int)
signal semantic_target_open_requested(kind: String, native_id: int, identity: String, context: Dictionary)
signal map_reveal_requested(map_identity: String, x: int, y: int)
signal action_target_search_requested(query: Dictionary)
signal action_form_describe_requested(query: Dictionary, request_id: int, draft_slot: int)
signal code_help_requested(code: int, origin: Control)
signal catalog_query_requested(preferred_identity: String)
signal create_requested(map_identity: String, x: int, y: int)
signal duplicate_requested(source: String, x: int, y: int)
signal clear_requested(source: String)
signal compile_requested
signal selection_changed(action_point: Dictionary, references: Array)
signal apply_state_changed(can_apply: bool)


func route_identity() -> String:
	return "scripts.action-points"

var _maps: Array = []
var _map_identity := ""
var _map_name := "No map"
var _summaries: Array = []
var _document: Dictionary = {}
var _saved_record_draft: Dictionary = {}
var _references: Array = []
var _used_by: Array = []
var _working_actions: Array = []
var _revision := 0
var _page_offset := 0
var _page_limit := 128
var _list_total := 0
var _catalog_counts := {}
var _catalog_filter := "current-map"
var _search_generation := 0
var _updating := false
var _selected_action_slot := -1
var commit_handler: Callable
var _draft_controls_locked := false
@onready var _map_picker: OptionButton = %ActionPointMapPicker
@onready var _inventory_summary: Label = %ActionPointInventorySummary
@onready var _search: LineEdit = %ActionPointSearch
@onready var _list: ItemList = %ActionPointCollection
@onready var _previous_page: Button = %ActionPointPreviousPage
@onready var _next_page: Button = %ActionPointNextPage
@onready var _page_status: Label = %ActionPointPageStatus
@onready var _identity: Label = %ActionPointIdentity
@onready var _descriptor: LineEdit = %ActionPointDescriptor
@onready var _validation: Label = %ActionPointDraftValidation
@onready var _placed: CheckBox = %ActionPointPlaced
@onready var _chance: SpinBox = %ActionPointChance
@onready var _activation_status: Label = %SemanticActivationStatus
@onready var _trigger_map: Label = %ActionPointTriggerMap
@onready var _trigger_x: SpinBox = %ActionPointTriggerX
@onready var _trigger_y: SpinBox = %ActionPointTriggerY
@onready var _post_level: SpinBox = %ActionPointPostLevel
@onready var _post_x: SpinBox = %ActionPointPostX
@onready var _post_y: SpinBox = %ActionPointPostY
@onready var _destination_summary: Label = %ActionPointDestinationSummary
@onready var _actions: Tree = %ActionPointActions
@onready var _action_heading: Label = %ActionPointActionSummary
@onready var _action_opcode: SpinBox = %ActionPointSelectedOpcode
@onready var _action_target: SpinBox = %ActionPointSelectedTarget
@onready var _apply_action: Button = %ApplyActionPointSlot
@onready var _repair_action: Button = %RepairActionPointTarget
@onready var _peek_action: Button = %PeekActionPointTarget
@onready var _source: Label = %ActionPointSourceEvidence
@onready var _commit: Button = %ApplyActionPoint
@onready var _compile: Button = %CompileActionPointSlice
@onready var _semantic_steps: ProvidenceActionStepWorkbench = %SemanticActionSteps
@onready var _header_grid: GridContainer = %ActionPointHeaderGrid
@onready var _record_header: PanelContainer = %ActionPointRecordHeader
@onready var _step_authoring: HSplitContainer = %ActionPointStepAuthoring
@onready var _empty_state: PanelContainer = %ActionPointEmptyState
@onready var _new_x: SpinBox = %NewActionPointX
@onready var _new_y: SpinBox = %NewActionPointY
@onready var _create_button: Button = %CreateActionPoint
@onready var _duplicate_button: Button = %DuplicateActionPoint
@onready var _clear_button: Button = %ClearActionPoint
@onready var _clear_confirmation: ConfirmationDialog = %ClearActionPointConfirmation


func focus_source(identity: String, slot: int, field: String) -> bool:
	preload("res://src/record_navigation.gd").select_summary(_list, _summaries, identity)
	if slot >= 0: return await _semantic_steps.focus_source_target(slot, field)
	return true


func focus_action_slot(slot: int) -> bool:
	return preload("res://src/record_navigation.gd").focus_action(_actions, _action_target, slot)


func draft_focus_fallback() -> Control:
	return _semantic_steps.draft_focus_control()


func _ready() -> void:
	%DiscardActionPoint.pressed.connect(discard_draft)
	resized.connect(_fit_header_grid)
	_semantic_steps.target_search_requested.connect(func(query): action_target_search_requested.emit(query))
	_semantic_steps.form_describe_requested.connect(func(query, request_id, slot): action_form_describe_requested.emit(query, request_id, slot))
	_semantic_steps.validation_changed.connect(_update_validation)
	_semantic_steps.help_requested.connect(func(code, origin): code_help_requested.emit(code, origin))
	_semantic_steps.peek_requested.connect(_open_semantic_target)
	_semantic_steps.preview_requested.connect(func(kind, id, identity, status):
		if kind == "sound": sound_preview_requested.emit(id, identity, status)
		elif kind == "sound-stop": sound_stop_requested.emit())
	var filters := {"current-map": "CurrentMap", "all": "All", "active": "Active", "reusable": "Reusable", "warnings": "Warnings"}
	for filter in filters:
		var button := get_node("ActionPointEditorSurface/ActionPointMasterDetail/ActionPointMasterPanel/Body/ActionPointFilters/" + filters[filter]) as Button
		button.pressed.connect(_set_catalog_filter.bind(filter))
	_create_button.pressed.connect(func(): create_requested.emit(_map_identity, int(_new_x.value), int(_new_y.value)))
	_duplicate_button.pressed.connect(func(): duplicate_requested.emit(str(_document.get("identity", "")), int(_new_x.value), int(_new_y.value)))
	_clear_button.pressed.connect(_show_clear_confirmation)
	_clear_confirmation.confirmed.connect(func(): clear_requested.emit(str(_document.get("identity", ""))))
	_descriptor.text_changed.connect(func(_text): _update_validation())
	_create_button.disabled = false
	_actions.set_column_title(0, "Slot")
	_actions.set_column_title(1, "Action")
	_actions.set_column_title(2, "Target")
	_actions.set_column_title(3, "State")
	_actions.set_column_custom_minimum_width(0, 38)
	_actions.set_column_custom_minimum_width(1, 104)
	_actions.set_column_expand(2, true)
	_actions.set_column_custom_minimum_width(3, 66)
	_fit_header_grid()


func _fit_header_grid() -> void:
	if _header_grid != null: _header_grid.columns = 3 if get_viewport_rect().size.x >= 1500.0 else 2
	if _activation_status != null: _activation_status.visible = get_viewport_rect().size.y > 900.0


func set_maps(maps: Array) -> void:
	_maps = maps.duplicate(true)
	if not _maps.any(func(map): return str(map.get("identity", "")) == _map_identity):
		_map_identity = ""
		_map_name = "No map"
	_updating = true
	_map_picker.clear()
	for map_value in _maps:
		var map := map_value as Dictionary
		_map_picker.add_item(str(map.get("name", "Unnamed map")))
		_map_picker.set_item_metadata(_map_picker.item_count - 1, str(map.get("identity", "")))
		if str(map.get("identity", "")) == _map_identity:
			_map_picker.select(_map_picker.item_count - 1)
	_updating = false
	if _map_identity.is_empty() and not _maps.is_empty():
		var first := _maps[0] as Dictionary
		_map_identity = str(first.get("identity", ""))
		_map_name = str(first.get("name", "Unnamed map"))
	_trigger_map.text = _map_name


func selected_identity() -> String:
	return str(_document.get("identity", ""))


func set_creation_destination(x: int, y: int) -> void:
	_new_x.value = x; _new_y.value = y
	_create_button.grab_focus()
	_create_button.tooltip_text = "Create one Action Point at (%d, %d) on %s. Occupied cells and full fixed-slot ranges cannot be overwritten." % [x,y,_map_name]


func set_summaries(result: Dictionary, revision: int, preferred_identity: String = "") -> void:
	var previous_identity := preferred_identity if not preferred_identity.is_empty() else str(_document.get("identity", ""))
	_summaries = (result.get("items", []) as Array).duplicate(true)
	_page_offset = int(result.get("offset", 0))
	_page_limit = int(result.get("limit", _page_limit))
	_list_total = int(result.get("total", _summaries.size()))
	_catalog_counts = (result.get("counts", {}) as Dictionary).duplicate(true)
	_revision = revision
	var map := result.get("map", {}) as Dictionary
	if not map.is_empty():
		_map_identity = str(map.get("identity", _map_identity))
		_map_name = str(map.get("name", _map_name))
		_select_map_picker(_map_identity)
	_trigger_map.text = _map_name
	_render_list(previous_identity)
	_render_catalog_controls()


func list_query() -> Dictionary:
	return {"offset": 0, "limit": 128, "search": _search.text, "filter": _catalog_filter}


func set_document(result: Dictionary) -> void:
	var previous_identity := str(_document.get("identity", ""))
	var previous_slot := _selected_action_slot
	_document = (result.get("actionPoint", {}) as Dictionary).duplicate(true)
	_references = (result.get("references", []) as Array).duplicate(true)
	_used_by = (result.get("usedBy", []) as Array).duplicate(true)
	_working_actions = (_document.get("actions", []) as Array).duplicate(true)
	_revision = int(result.get("revision", _revision))
	var map := result.get("map", {}) as Dictionary
	if not map.is_empty():
		_map_identity = str(map.get("identity", _map_identity))
		_map_name = str(map.get("name", _map_name))
	_trigger_map.text = _map_name
	_empty_state.hide()
	_record_header.show()
	_validation.show()
	_header_grid.show()
	_step_authoring.hide()
	_semantic_steps.show()
	_populate_document()
	_duplicate_button.disabled = false
	_clear_button.disabled = false
	_semantic_steps.set_document(str(_document.get("identity", "")), result.get("steps", []) as Array,
		{"mapIdentity": _map_identity, "levelType": str(map.get("levelType", "")), "scriptKind": "action-point"})
	_update_validation()
	_saved_record_draft = _record_draft()
	if previous_identity == str(_document.get("identity", "")):
		preload("res://src/record_navigation.gd").focus_action(_actions, _action_target, previous_slot, false)
	restore_catalog_selection()
	selection_changed.emit(_document.duplicate(true), _references.duplicate(true))


func set_action_catalog(page: Dictionary) -> void:
	_semantic_steps.set_catalog(page)


func set_action_target_page(page: Dictionary) -> void:
	_semantic_steps.set_target_page(page)


func set_action_form_description(description: Dictionary, request_id: int) -> void:
	_semantic_steps.set_form_description(description, request_id)


func review_settings_change(impact: Dictionary) -> String:
	return await _semantic_steps.review_settings_change(impact)


func _open_semantic_target(kind: String, native_id: int, identity: String, context: Dictionary) -> void:
	semantic_target_open_requested.emit(kind, native_id, identity, context)


func read_state() -> Dictionary:
	return {"identity": str(_document.get("identity", "")), "draft": _record_draft(), "query": _search.text, "filter": _catalog_filter, "offset": _page_offset, "mapIdentity": _map_identity, "slot": _selected_action_slot, "step": _semantic_steps.read_state()}


func read_navigation_state() -> Dictionary:
	var state := read_state()
	state["listScroll"] = _list.get_v_scroll_bar().value
	state["step"] = _semantic_steps.read_navigation_state()
	return state


func prime_navigation_state(state: Dictionary) -> void:
	_search.set_block_signals(true)
	_search.text = str(state.get("query", ""))
	_search.set_block_signals(false)
	_catalog_filter = str(state.get("filter", "current-map"))
	_page_offset = maxi(0, int(state.get("offset", 0)))
	_map_identity = str(state.get("mapIdentity", _map_identity))
	_render_catalog_controls()


func restore_navigation_state(state: Dictionary) -> void:
	_selected_action_slot = int(state.get("slot", _selected_action_slot))
	_semantic_steps.restore_navigation_state(state.get("step", {}) as Dictionary)
	_list.get_v_scroll_bar().value = float(state.get("listScroll", 0.0))


func catalog_identity(items: Array, preferred: String = "") -> String:
	return preload("res://src/record_navigation.gd").catalog_identity(items, "", preferred if not preferred.is_empty() else str(_document.get("identity", "")), "recordIndex")


func restore_catalog_selection() -> void:
	var scroll := _list.get_v_scroll_bar().value
	preload("res://src/record_navigation.gd").select_summary(_list, _summaries, str(_document.get("identity", "")))
	_list.get_v_scroll_bar().value = scroll
	_select_map_picker(_map_identity)


func accept_saved_document(document: Dictionary) -> void:
	_document = document.duplicate(true)
	_update_validation()


func accept_saved_draft(record_draft: Dictionary) -> void:
	_saved_record_draft = record_draft.duplicate(true)
	_semantic_steps.accept_saved_draft(record_draft)
	_update_validation()


func current_action_point() -> Dictionary:
	return _document.duplicate(true)


func current_map_identity() -> String:
	return _map_identity


func reset_catalog_page() -> void:
	_page_offset = 0


func has_unapplied_changes() -> bool:
	return not _document.is_empty() and (_semantic_steps.has_unapplied_changes() or not preload("res://src/document_value_equality.gd").equal(_record_draft(), _saved_record_draft))


func discard_draft() -> void:
	_semantic_steps.discard_draft()
	_apply_saved_header()
	_update_validation()


func commit_selected() -> void:
	if _document.is_empty():
		return
	var problem := str(draft_error().get("error", ""))
	if not problem.is_empty():
		_validation.text = problem
		return
	var draft := _record_draft()
	if commit_handler.is_valid(): await commit_handler.call(draft)
	else: row_update_requested.emit(draft)


func set_compile_available(available: bool, reason: String = "") -> void:
	_compile.disabled = not available
	_compile.tooltip_text = reason if not available else "Export the supported Legacy Realmz scenario files."


func _render_list(preferred_identity: String) -> void:
	_list.clear()
	var visible_indexes: Array[int] = []
	for index in range(_summaries.size()):
		var summary := _summaries[index] as Dictionary
		var problem_count := int(summary.get("problems", 0))
		var state := "READY" if problem_count == 0 else "%d PROBLEM%s" % [problem_count, "" if problem_count == 1 else "S"]
		var name := str(summary.get("descriptor", "")).strip_edges()
		var title := name if not name.is_empty() else str(summary.get("label", "Unnamed Action Point"))
		var slot := int(summary.get("recordIndex", 0))
		var chance := int(summary.get("chancePercent", 0))
		var steps := int(summary.get("populatedActions", 0))
		_list.add_item("%03d  %s  ·  %d%% / %d" % [slot, title, chance, steps])
		_list.set_item_tooltip(_list.item_count - 1, "%s · %s · %s · %d steps" % [title, _map_name, state, steps])
		_list.set_item_metadata(_list.item_count - 1, index)
		if problem_count > 0:
			_list.set_item_custom_fg_color(_list.item_count - 1, Color("ff9cad"))
		visible_indexes.append(index)
	_inventory_summary.text = "%d shown  |  %d matching  |  %d on map" % [_list.item_count, _list_total, int(_catalog_counts.get("current-map", _list_total))]
	if _list.item_count == 0:
		_document.clear()
		_clear_document()
		return
	var visible_index := 0
	for index in range(visible_indexes.size()):
		var summary := _summaries[visible_indexes[index]] as Dictionary
		if str(summary.get("identity", "")) == preferred_identity:
			visible_index = index
			break
		if preferred_identity.is_empty() and bool(summary.get("active", false)):
			visible_index = index
			break
	_list.select(visible_index)
	_select_summary(visible_index)


func _select_summary(visible_index: int) -> void:
	if visible_index < 0 or visible_index >= _list.item_count:
		return
	var summary := _summaries[int(_list.get_item_metadata(visible_index))] as Dictionary
	var identity := str(summary.get("identity", ""))
	if has_unapplied_changes() and navigation_requested.has_connections():
		if identity == selected_identity(): return
		restore_catalog_selection()
		navigation_requested.emit(row_open_requested.emit.bind(identity), "opening another Action Point")
	else: row_open_requested.emit(identity)


func _populate_document() -> void:
	if _document.is_empty():
		_clear_document()
		return
	_updating = true
	var record_index := int(_document.get("recordIndex", 0))
	var coordinate_value: Variant = _document.get("coordinate", {})
	var coordinate := coordinate_value as Dictionary if coordinate_value is Dictionary else {}
	_identity.text = "Action Point %d · Unplaced" % record_index if coordinate.is_empty() else "Action Point %d (%d, %d)" % [record_index, int(coordinate.x), int(coordinate.y)]
	_descriptor.text = str(_document.get("descriptor", ""))
	_placed.button_pressed = not coordinate.is_empty()
	_trigger_x.value = int(coordinate.get("x", 0))
	_trigger_y.value = int(coordinate.get("y", 0))
	_chance.value = int(_document.get("chancePercent", 0))
	_post_level.value = int(_document.get("postActionLevel", 0))
	_post_x.value = int(_document.get("postActionX", 0))
	_post_y.value = int(_document.get("postActionY", 0))
	_render_actions()
	var absolute_record := int(_document.get("levelIndex", 0)) * 100 + record_index
	var start := absolute_record * 40
	_source.text = "Data DD row %d · bytes %d…%d · action targets %d…%d · revision %d" % [absolute_record, start, start + 39, start + 24, start + 39, _revision]
	_updating = false
	_update_validation()


func _render_actions() -> void:
	_actions.clear()
	_action_heading.text = "%d OF 8 USED  ·  STEPS" % _working_actions.size()
	var root := _actions.create_item()
	_selected_action_slot = -1
	_apply_action.disabled = true
	_repair_action.disabled = true
	_peek_action.disabled = true
	var absolute_record := int(_document.get("levelIndex", 0)) * 100 + int(_document.get("recordIndex", 0))
	for slot in range(8):
		var action := _action_for_slot(slot)
		var raw_opcode := int(action.get("rawOpcode", 0))
		var opcode := _normalized_opcode(raw_opcode)
		var target := int(action.get("targetNativeId", 0))
		var reference := _reference_for_action(slot)
		var state := str(reference.get("resolution", "not typed"))
		var target_kind := str(reference.get("targetKind", _target_kind(opcode))).replace("-", " ").capitalize()
		var item := _actions.create_item(root)
		item.set_text(0, "%02d" % slot)
		item.set_text(1, "—" if action.is_empty() else "%d · %s" % [raw_opcode, _opcode_label(opcode)])
		item.set_text(2, "—" if action.is_empty() else "%s %d" % [target_kind, target])
		item.set_text(3, "%s · %d…%d" % [
			"Unused" if action.is_empty() else state.capitalize(),
			absolute_record * 40 + 24 + slot * 2,
			absolute_record * 40 + 25 + slot * 2,
		])
		item.set_metadata(0, {"slot": slot, "rawOpcode": raw_opcode, "target": target})
		if state != "resolved" and state != "not typed" and not action.is_empty():
			item.set_custom_color(2, Color("ff9cad"))
			item.set_custom_color(3, Color("ff9cad"))


func _select_action() -> void:
	var selected := _actions.get_selected()
	if selected == null:
		return
	var metadata: Variant = selected.get_metadata(0)
	if not metadata is Dictionary:
		return
	var row := metadata as Dictionary
	_selected_action_slot = int(row.get("slot", -1))
	_action_opcode.value = int(row.get("rawOpcode", 0))
	_action_target.value = int(row.get("target", 0))
	_apply_action.disabled = _selected_action_slot < 0
	var opcode := _normalized_opcode(int(_action_opcode.value))
	_repair_action.disabled = _selected_action_slot < 0 or not [1, 4, 8, 39].has(opcode)
	_repair_action.text = "Retarget → %s" % _repair_label(opcode)
	_peek_action.disabled = _selected_action_slot < 0 or not [1, 4, 8, 39].has(opcode)


func _apply_selected_action() -> void:
	if _selected_action_slot < 0:
		return
	var raw_opcode := int(_action_opcode.value)
	var target := int(_action_target.value)
	for index in range(_working_actions.size()):
		var action := _working_actions[index] as Dictionary
		if int(action.get("slot", -1)) == _selected_action_slot:
			if raw_opcode == 0 and target == 0:
				_working_actions.remove_at(index)
			else:
				action["rawOpcode"] = raw_opcode
				action["targetNativeId"] = target
				_working_actions[index] = action
			_render_actions()
			_update_validation()
			return
	if raw_opcode != 0 or target != 0:
		_working_actions.append({"slot": _selected_action_slot, "rawOpcode": raw_opcode, "targetNativeId": target})
		_working_actions.sort_custom(func(left: Dictionary, right: Dictionary) -> bool: return int(left.get("slot", 0)) < int(right.get("slot", 0)))
	_render_actions()
	_update_validation()


func _repair_selected_action() -> void:
	if _document.is_empty() or _selected_action_slot < 0:
		return
	action_retarget_requested.emit(
		str(_document.get("identity", "")),
		_selected_action_slot,
		int(_action_target.value)
	)


func _peek_selected_action() -> void:
	if _selected_action_slot < 0:
		return
	var opcode := _normalized_opcode(int(_action_opcode.value))
	var target := int(_action_target.value)
	match opcode:
		1:
			message_open_requested.emit(target)
		4:
			simple_encounter_open_requested.emit(target)
		8:
			action_point_open_requested.emit(target)
		39:
			extra_action_point_open_requested.emit(target)


func _record_draft() -> Dictionary:
	if _document.is_empty(): return {}
	var coordinate: Variant = null
	if _placed.button_pressed:
		coordinate = {"x": int(_trigger_x.value), "y": int(_trigger_y.value)}
	return {
		"source": str(_document.get("identity", "")),
		"descriptor": _descriptor.text.strip_edges(),
		"header": {
			"coordinate": coordinate,
			"postActionLevel": int(_post_level.value),
			"postActionX": int(_post_x.value),
			"postActionY": int(_post_y.value),
			"chancePercent": int(_chance.value),
		},
		"steps": _semantic_steps.draft_steps(),
	}


func _apply_saved_header() -> void:
	var header := _saved_record_draft.get("header", {}) as Dictionary
	var coordinate: Variant = header.get("coordinate")
	_updating = true
	_descriptor.text = str(_saved_record_draft.get("descriptor", ""))
	_placed.button_pressed = coordinate is Dictionary
	if coordinate is Dictionary:
		var placed := coordinate as Dictionary
		_trigger_x.value = int(placed.get("x", 0))
		_trigger_y.value = int(placed.get("y", 0))
	_chance.value = int(header.get("chancePercent", 0))
	_post_level.value = int(header.get("postActionLevel", 0))
	_post_x.value = int(header.get("postActionX", 0))
	_post_y.value = int(header.get("postActionY", 0))
	_updating = false


func set_draft_controls_locked(locked: bool) -> void:
	_draft_controls_locked = locked
	_update_validation()


func draft_error() -> Dictionary:
	var step_problem := _semantic_steps.draft_error()
	if not step_problem.is_empty(): return step_problem
	var result = preload("res://src/editor_draft_apply.gd")
	if _placed.button_pressed and int(_document.get("levelIndex", 0)) == 0 and int(_trigger_x.value) == 0 and int(_trigger_y.value) == 0:
		return result.failure("This Action Point cannot be placed at 0,0 on the first land level. Choose another location or turn off Placed.", _trigger_x.get_line_edit())
	return {}

func can_apply_draft() -> bool:
	return not _document.is_empty() and draft_error().is_empty()

func _update_validation() -> void:
	if _updating or _validation == null:
		return
	var problem := str(draft_error().get("error", ""))
	%Callers.disabled = _document.is_empty()
	_commit.disabled = _draft_controls_locked or _document.is_empty() or not problem.is_empty()
	%DiscardActionPoint.disabled = _draft_controls_locked or _document.is_empty()
	var same_destination := _placed.button_pressed and int(_post_level.value) == int(_document.get("levelIndex", 0)) and int(_post_x.value) == int(_trigger_x.value) and int(_post_y.value) == int(_trigger_y.value)
	_destination_summary.text = "Same as trigger" if same_destination else "Explicit destination"
	_validation.text = problem if not problem.is_empty() else ""
	_validation.add_theme_color_override("font_color", Color("ff9cad") if not problem.is_empty() else Color("a7f3c3"))
	apply_state_changed.emit(can_apply_draft())


func _action_for_slot(slot: int) -> Dictionary:
	for value in _working_actions:
		var action := value as Dictionary
		if int(action.get("slot", -1)) == slot:
			return action
	return {}


func _reference_for_action(slot: int) -> Dictionary:
	var field := "actions[%d].target" % slot
	for value in _references:
		var reference := value as Dictionary
		if str(reference.get("field", "")) == field:
			return reference
	return {}


func _normalized_opcode(raw_opcode: int) -> int:
	return -raw_opcode if raw_opcode < 0 and raw_opcode not in [-14, -23] else raw_opcode


func _target_kind(opcode: int) -> String:
	return LegacyLabels.target_kind(opcode)


func _opcode_label(opcode: int) -> String:
	return LegacyLabels.opcode_label(opcode)


func _repair_label(opcode: int) -> String:
	return LegacyLabels.repair_label(opcode)


func _on_search_changed(_text: String) -> void:
	_search_generation += 1
	var generation := _search_generation
	await get_tree().create_timer(0.18).timeout
	if generation != _search_generation or has_unapplied_changes(): return
	_page_offset = 0
	catalog_query_requested.emit(str(_document.get("identity", "")))


func _set_catalog_filter(filter: String) -> void:
	if has_unapplied_changes():
		_render_catalog_controls()
		return
	_catalog_filter = filter
	_page_offset = 0
	_render_catalog_controls()
	catalog_query_requested.emit(str(_document.get("identity", "")))


func _render_catalog_controls() -> void:
	var filters := {"current-map": "CurrentMap", "all": "All", "active": "Active", "reusable": "Reusable", "warnings": "Warnings"}
	for filter in filters:
		var button := get_node("ActionPointEditorSurface/ActionPointMasterDetail/ActionPointMasterPanel/Body/ActionPointFilters/" + filters[filter]) as Button
		button.button_pressed = _catalog_filter == filter
		button.text = "%s  %d" % [filter.to_upper(), int(_catalog_counts.get(filter, 0))]
	_previous_page.hide(); _next_page.hide()
	_page_status.text = "%d entries · scroll to browse" % _list_total


func _on_placed_toggled(_pressed: bool) -> void:
	_update_validation()


func _on_context_value_changed(_value: float) -> void:
	_update_validation()


func _on_compile_pressed() -> void:
	compile_requested.emit()


func _on_map_selected(index: int) -> void:
	if _updating or index < 0 or index >= _map_picker.item_count:
		return
	var identity := str(_map_picker.get_item_metadata(index))
	if not identity.is_empty() and identity != _map_identity:
		reset_catalog_page()
		map_changed_requested.emit(identity)


func _select_map_picker(identity: String) -> void:
	_updating = true
	for index in range(_map_picker.item_count):
		if str(_map_picker.get_item_metadata(index)) == identity:
			_map_picker.select(index)
			break
	_updating = false


func _reveal_trigger() -> void:
	if _placed.button_pressed:
		map_reveal_requested.emit(_map_identity, int(_trigger_x.value), int(_trigger_y.value))


func _reveal_destination() -> void:
	var destination_identity := "land:%d" % int(_post_level.value)
	map_reveal_requested.emit(destination_identity, int(_post_x.value), int(_post_y.value))


func _clear_document() -> void:
	_semantic_steps.clear_document()
	_saved_record_draft.clear()
	_semantic_steps.hide()
	_header_grid.hide()
	_step_authoring.hide()
	%Callers.disabled = true
	_record_header.hide()
	_validation.hide()
	_empty_state.show()
	_used_by.clear()
	_duplicate_button.disabled = true
	_clear_button.disabled = true
	_identity.text = "No matching Action Point"
	_descriptor.clear()
	_placed.button_pressed = false
	_chance.value = 0
	_trigger_x.value = 0
	_trigger_y.value = 0
	_post_level.value = 0
	_post_x.value = 0
	_post_y.value = 0
	_actions.clear()
	_source.text = "Import a certified Data DD source to edit Action Points."
	_validation.text = "No Action Point selected"
	_commit.disabled = true


func _show_clear_confirmation() -> void:
	var coordinate := _document.get("coordinate", {}) as Dictionary
	var impacts := ["Map cell %d,%d on %s" % [int(coordinate.get("x", 0)), int(coordinate.get("y", 0)), _map_name]]
	for value in _used_by:
		var use := value as Dictionary
		impacts.append("%s · %s" % [str(use.get("source", "Unknown caller")), str(use.get("field", "unknown field"))])
	_clear_confirmation.dialog_text = "Clear this fixed slot? The marker and all eight steps will be removed.\n\nAffected uses:\n• %s\n\nExisting records are not renumbered or retargeted. Undo remains available." % "\n• ".join(impacts)
	_clear_confirmation.popup_centered()
	_clear_confirmation.get_cancel_button().grab_focus.call_deferred()
