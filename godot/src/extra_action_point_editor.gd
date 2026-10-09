class_name ProvidenceExtraActionPointEditor
extends VBoxContainer

signal discovery_requested(direction: String)
signal navigation_requested(action: Callable, destination: String)

signal row_open_requested(identity: String)
signal row_update_requested(extra_action_point: Dictionary)
signal action_retarget_requested(identity: String, slot: int, target_native_id: int)
signal extra_code_update_requested(row: Dictionary)
signal message_open_requested(native_id: int)
signal sound_open_requested(native_id: int)
signal sound_preview_requested(native_id: int, identity: String, status: String)
signal sound_stop_requested
signal extra_action_point_open_requested(native_id: int)
signal simple_encounter_open_requested(native_id: int)
signal semantic_target_open_requested(kind: String, native_id: int, identity: String, context: Dictionary)
signal action_target_search_requested(query: Dictionary)
signal action_form_describe_requested(query: Dictionary, request_id: int, draft_slot: int)
signal code_help_requested(code: int, origin: Control)
signal catalog_query_requested(preferred_identity: String)
signal create_requested
signal duplicate_requested(source: String)
signal delete_requested(source: String, confirmed: bool)
signal compile_requested
signal selection_changed(extra_action_point: Dictionary, references: Array)
signal apply_state_changed(can_apply: bool)


func route_identity() -> String:
	return "scripts.macros"

var _summaries: Array = []
var _total_records := 0
var _document: Dictionary = {}
var _saved_record_draft: Dictionary = {}
var _references: Array = []
var _used_by: Array = []
var _attachments: Array = []
var _working_actions: Array = []
var _revision := 0
var _page_offset := 0
var _page_limit := 128
var _catalog_filter := "all"
var _catalog_counts := {}
var _search_generation := 0
var _updating := false
var _selected_action_slot := -1
var commit_handler: Callable
var _draft_controls_locked := false
@onready var _list: ItemList = %ExtraActionPointCollection
@onready var _search: LineEdit = %ExtraActionPointSearch
@onready var _inventory_summary: Label = %ExtraActionPointInventorySummary
@onready var _previous_page: Button = %ExtraActionPointPreviousPage
@onready var _next_page: Button = %ExtraActionPointNextPage
@onready var _page_status: Label = %ExtraActionPointPageStatus
@onready var _identity: Label = %ExtraActionPointIdentity
@onready var _descriptor: LineEdit = %ExtraActionPointDescriptor
@onready var _door_id: SpinBox = %ClassicDoorId
@onready var _post_level: SpinBox = %PostActionLevel
@onready var _post_x: SpinBox = %PostActionX
@onready var _post_y: SpinBox = %PostActionY
@onready var _chance: SpinBox = %ChancePercent
@onready var _actions: Tree = %ExtraActionPointActions
@onready var _action_opcode: SpinBox = %SelectedActionOpcode
@onready var _action_target: SpinBox = %SelectedActionTarget
@onready var _apply_action: Button = %ApplyActionSlot
@onready var _repair_action: Button = %RepairActionTarget
@onready var _peek_action: Button = %PeekActionTarget
@onready var _attachment_panel: VBoxContainer = %ExtraCodeAttachments
@onready var _validation: Label = %ExtraActionPointDraftValidation
@onready var _source: Label = %ExtraActionPointSourceEvidence
@onready var _commit: Button = %ApplyExtraActionPoint
@onready var _compile: Button = %CompileExtraActionPointSlice
@onready var _semantic_steps: ProvidenceActionStepWorkbench = %SemanticActionSteps
@onready var _record_header: PanelContainer = %ExtraActionPointRecordHeader
@onready var _step_authoring: HSplitContainer = %ExtraActionPointStepAuthoring
@onready var _empty_state: PanelContainer = %ExtraActionPointEmptyState
@onready var _create_button: Button = %CreateExtraActionPoint
@onready var _duplicate_button: Button = %DuplicateExtraActionPoint
@onready var _delete_button: Button = %DeleteExtraActionPoint
@onready var _delete_confirmation: ConfirmationDialog = %DeleteExtraActionPointConfirmation


func focus_source(identity: String, slot: int, field: String) -> bool:
	preload("res://src/record_navigation.gd").select_summary(_list, _summaries, identity)
	if slot >= 0: return await _semantic_steps.focus_source_target(slot, field)
	return true


func focus_action_slot(slot: int) -> bool:
	return preload("res://src/record_navigation.gd").focus_action(_actions, _action_target, slot)


func draft_focus_fallback() -> Control:
	return _semantic_steps.draft_focus_control()


func _ready() -> void:
	%DiscardExtraActionPoint.pressed.connect(discard_draft)
	_semantic_steps.target_search_requested.connect(func(query): action_target_search_requested.emit(query))
	_semantic_steps.form_describe_requested.connect(func(query, request_id, slot): action_form_describe_requested.emit(query, request_id, slot))
	_semantic_steps.validation_changed.connect(_update_validation)
	_semantic_steps.help_requested.connect(func(code, origin): code_help_requested.emit(code, origin))
	_semantic_steps.peek_requested.connect(_open_semantic_target)
	_semantic_steps.preview_requested.connect(func(kind, id, identity, status):
		if kind == "sound": sound_preview_requested.emit(id, identity, status)
		elif kind == "sound-stop": sound_stop_requested.emit())
	var filters := _catalog_filters()
	for filter in filters:
		var button := get_node("ExtraActionPointEditorSurface/ExtraActionPointMasterDetail/ExtraActionPointMasterPanel/ExtraActionPointMaster/ExtraActionPointFilters/" + filters[filter]) as Button
		button.pressed.connect(_set_catalog_filter.bind(filter))
	_create_button.pressed.connect(func(): create_requested.emit())
	_duplicate_button.pressed.connect(func(): duplicate_requested.emit(str(_document.get("identity", ""))))
	_delete_button.pressed.connect(_show_delete_confirmation)
	_delete_confirmation.confirmed.connect(func(): delete_requested.emit(str(_document.get("identity", "")), true))
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


func selected_identity() -> String:
	return str(_document.get("identity", ""))


func set_summaries(result: Dictionary, revision: int, preferred_identity: String = "") -> void:
	var previous_identity := preferred_identity if not preferred_identity.is_empty() else str(_document.get("identity", ""))
	_summaries = result.get("items", []) as Array
	_total_records = int(result.get("total", _summaries.size()))
	_page_offset = int(result.get("offset", 0))
	_page_limit = int(result.get("limit", _page_limit))
	_catalog_counts = (result.get("counts", {}) as Dictionary).duplicate(true)
	_revision = revision
	_render_list(previous_identity)
	_render_catalog_controls()


func list_query() -> Dictionary:
	return {"offset": 0, "limit": 128, "search": _search.text, "filter": _catalog_filter}


func set_document(result: Dictionary) -> void:
	var previous_identity := str(_document.get("identity", ""))
	var previous_slot := _selected_action_slot
	_document = (result.get("extraActionPoint", {}) as Dictionary).duplicate(true)
	_references = (result.get("references", []) as Array).duplicate(true)
	_used_by = (result.get("usedBy", []) as Array).duplicate(true)
	_attachments = (result.get("extraCodeAttachments", []) as Array).duplicate(true)
	_working_actions = (_document.get("actions", []) as Array).duplicate(true)
	_revision = int(result.get("revision", _revision))
	_empty_state.hide()
	_record_header.show()
	_validation.show()
	_step_authoring.hide()
	_semantic_steps.show()
	_populate_document()
	_duplicate_button.disabled = false
	_delete_button.disabled = false
	_semantic_steps.set_document(str(_document.get("identity", "")), result.get("steps", []) as Array,
		{"scriptKind": "extra-action-point"})
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
	return {"identity": str(_document.get("identity", "")), "draft": _record_draft(), "query": _search.text, "filter": _catalog_filter, "offset": _page_offset, "slot": _selected_action_slot, "step": _semantic_steps.read_state()}


func read_navigation_state() -> Dictionary:
	var state := read_state()
	state["listScroll"] = _list.get_v_scroll_bar().value
	state["step"] = _semantic_steps.read_navigation_state()
	return state


func prime_navigation_state(state: Dictionary) -> void:
	_search.set_block_signals(true)
	_search.text = str(state.get("query", ""))
	_search.set_block_signals(false)
	_catalog_filter = str(state.get("filter", "all"))
	_page_offset = maxi(0, int(state.get("offset", 0)))
	_render_catalog_controls()


func restore_navigation_state(state: Dictionary) -> void:
	_selected_action_slot = int(state.get("slot", _selected_action_slot))
	_semantic_steps.restore_navigation_state(state.get("step", {}) as Dictionary)
	_list.get_v_scroll_bar().value = float(state.get("listScroll", 0.0))


func catalog_identity(items: Array, preferred: String = "") -> String:
	return preload("res://src/record_navigation.gd").catalog_identity(items, "", preferred if not preferred.is_empty() else str(_document.get("identity", "")), "nativeId")


func restore_catalog_selection() -> void:
	var scroll := _list.get_v_scroll_bar().value
	preload("res://src/record_navigation.gd").select_summary(_list, _summaries, str(_document.get("identity", "")))
	_list.get_v_scroll_bar().value = scroll


func accept_saved_document(document: Dictionary) -> void:
	_document = document.duplicate(true)
	_update_validation()


func accept_saved_draft(record_draft: Dictionary) -> void:
	_saved_record_draft = record_draft.duplicate(true)
	_semantic_steps.accept_saved_draft(record_draft)
	_update_validation()


func current_extra_action_point() -> Dictionary:
	return _document.duplicate(true)


func current_applied_native_id() -> int:
	var value: Variant = _document.get("nativeId")
	var native_id := -1
	if value is int:
		native_id = int(value)
	elif value is float and float(int(value)) == float(value):
		native_id = int(value)
	if native_id < 0 or str(_document.get("identity", "")) != "extra-action-point:%d" % native_id:
		return -1
	return native_id


func trusted_applied_native_id(draft_active := false) -> int:
	return -1 if draft_active or has_unapplied_changes() else current_applied_native_id()


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
		var suffix := "  ·  %d problem%s" % [problem_count, "" if problem_count == 1 else "s"] if problem_count > 0 else ""
		var descriptor := str(summary.get("descriptor", "")).strip_edges()
		_list.add_item("%03d  %s  ·  %d uses%s" % [
			int(summary.get("nativeId", 0)),
			descriptor if not descriptor.is_empty() else str(summary.get("label", "Unnamed Extra AP")),
			int(summary.get("usedBy", 0)),
			suffix,
		])
		_list.set_item_metadata(_list.item_count - 1, index)
		if problem_count > 0:
			_list.set_item_custom_fg_color(_list.item_count - 1, Color("ff9cad"))
		visible_indexes.append(index)
	_inventory_summary.text = "%d shown  |  %d matching  |  %d total" % [_list.item_count, _total_records, int(_catalog_counts.get("all", _total_records))]
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
		if preferred_identity.is_empty() and int(summary.get("problems", 0)) > 0:
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
		navigation_requested.emit(row_open_requested.emit.bind(identity), "opening another Extra Action Point")
	else: row_open_requested.emit(identity)


func _populate_document() -> void:
	if _document.is_empty():
		_clear_document()
		return
	_updating = true
	var native_id := int(_document.get("nativeId", 0))
	_identity.text = "Extra Action Point %d" % native_id
	_descriptor.text = str(_document.get("descriptor", ""))
	_door_id.value = int(_document.get("classicDoorId", 0))
	_post_level.value = int(_document.get("postActionLevel", 0))
	_post_x.value = int(_document.get("postActionX", 0))
	_post_y.value = int(_document.get("postActionY", 0))
	_chance.value = int(_document.get("chancePercent", 0))
	_render_actions()
	_render_attachments()
	var start := native_id * 40
	_source.text = "Data ED3 row %d · bytes %d…%d · action targets %d…%d · revision %d" % [native_id, start, start + 39, start + 24, start + 39, _revision]
	_updating = false
	_update_validation()


func _render_actions() -> void:
	_actions.clear()
	var root := _actions.create_item()
	_selected_action_slot = -1
	_apply_action.disabled = true
	_repair_action.disabled = true
	_peek_action.disabled = true
	var native_id := int(_document.get("nativeId", 0))
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
			native_id * 40 + 24 + slot * 2,
			native_id * 40 + 25 + slot * 2,
		])
		item.set_metadata(0, {"slot": slot, "rawOpcode": raw_opcode, "target": target})
		if state != "resolved" and state != "not typed" and not action.is_empty():
			item.set_custom_color(2, Color("f09a82"))
			item.set_custom_color(3, Color("f09a82"))


func _render_attachments() -> void:
	for child in _attachment_panel.get_children():
		child.queue_free()
	var heading := Label.new()
	heading.text = "OPCODE 92 ATTACHMENTS  ·  DATA EDCD PRIMARY + REQUIRED ROW + 1"
	heading.add_theme_color_override("font_color", Color("d6b875"))
	_attachment_panel.add_child(heading)
	if _attachments.is_empty():
		var empty := Label.new()
		empty.text = "No opcode 92 slot in this record."
		empty.add_theme_color_override("font_color", Color("8fa0ad"))
		_attachment_panel.add_child(empty)
		return
	for value in _attachments:
		var attachment := value as Dictionary
		var group := VBoxContainer.new()
		group.name = "Opcode92Slot%d" % int(attachment.get("slot", 0))
		var label := Label.new()
		label.text = "Slot %d · random-region shape mutation" % int(attachment.get("slot", 0))
		group.add_child(label)
		group.add_child(_extra_code_row_editor("Primary", attachment.get("primary", {}) as Dictionary))
		group.add_child(_extra_code_row_editor("Companion", attachment.get("secondary", {}) as Dictionary))
		_attachment_panel.add_child(group)


func _extra_code_row_editor(label_text: String, row: Dictionary) -> Control:
	var line := HBoxContainer.new()
	var label := Label.new()
	label.text = "%s row" % label_text
	label.custom_minimum_size.x = 112
	line.add_child(label)
	if row.is_empty():
		var missing := Label.new()
		missing.text = "Missing — required for opcode 92"
		missing.add_theme_color_override("font_color", Color("f09a82"))
		line.add_child(missing)
		return line
	var fields: Array[SpinBox] = []
	for value in row.get("values", []) as Array:
		var field := SpinBox.new()
		field.min_value = -32768
		field.max_value = 32767
		field.value = int(value)
		field.custom_minimum_size.x = 92
		fields.append(field)
		line.add_child(field)
	var save := Button.new()
	save.text = "Apply EDCD %d" % int(row.get("nativeId", 0))
	save.pressed.connect(func() -> void:
		var values: Array = []
		for field in fields:
			values.append(int(field.value))
		extra_code_update_requested.emit({"nativeId": int(row.get("nativeId", 0)), "values": values})
	)
	line.add_child(save)
	return line


func _select_action() -> void:
	var selected: TreeItem = _actions.get_selected()
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
	_repair_action.disabled = _selected_action_slot < 0 or not [1, 4, 39].has(opcode)
	_repair_action.text = "Retarget → %s" % _repair_label(opcode)
	_peek_action.disabled = _selected_action_slot < 0 or not [1, 4, 39].has(opcode)


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
		39:
			extra_action_point_open_requested.emit(target)


func _record_draft() -> Dictionary:
	if _document.is_empty(): return {}
	return {
		"source": str(_document.get("identity", "")),
		"descriptor": _descriptor.text.strip_edges(),
		"header": {
			"classicDoorId": int(_door_id.value),
			"postActionLevel": int(_post_level.value),
			"postActionX": int(_post_x.value),
			"postActionY": int(_post_y.value),
			"chancePercent": int(_chance.value),
		},
		"steps": _semantic_steps.draft_steps(),
	}


func _apply_saved_header() -> void:
	var header := _saved_record_draft.get("header", {}) as Dictionary
	_updating = true
	_descriptor.text = str(_saved_record_draft.get("descriptor", ""))
	_door_id.value = int(header.get("classicDoorId", 0))
	_post_level.value = int(header.get("postActionLevel", 0))
	_post_x.value = int(header.get("postActionX", 0))
	_post_y.value = int(header.get("postActionY", 0))
	_chance.value = int(header.get("chancePercent", 0))
	_updating = false


func set_draft_controls_locked(locked: bool) -> void:
	_draft_controls_locked = locked
	_update_validation()


func draft_error() -> Dictionary:
	return _semantic_steps.draft_error()

func can_apply_draft() -> bool:
	return not _document.is_empty() and draft_error().is_empty()

func _update_validation() -> void:
	if _updating or _validation == null:
		return
	var problem := str(draft_error().get("error", ""))
	%Callers.disabled = _document.is_empty()
	_commit.disabled = _draft_controls_locked or _document.is_empty() or not problem.is_empty()
	%DiscardExtraActionPoint.disabled = _draft_controls_locked or _document.is_empty()
	_validation.text = problem if not problem.is_empty() else ""
	_validation.add_theme_color_override("font_color", Color("f09a82") if not problem.is_empty() else Color("7dcaa2"))
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
	match opcode:
		1:
			return "message"
		4:
			return "simple encounter"
		5:
			return "complex encounter"
		39:
			return "extra action point"
		92:
			return "EDCD row pair"
		_:
			return "raw target"


func _opcode_label(opcode: int) -> String:
	match opcode:
		1:
			return "Show Message"
		4:
			return "Simple Encounter"
		5:
			return "Complex Encounter"
		39:
			return "Extra Action Point"
		92:
			return "Random Region Shape"
		_:
			return "Classic opcode"


func _repair_label(opcode: int) -> String:
	match opcode:
		1:
			return "Message 47"
		4:
			return "Simple Encounter 3"
		39:
			return "Extra AP 40"
		_:
			return "Typed Target"


func _on_context_value_changed(_value: float) -> void:
	_update_validation()


func _on_compile_pressed() -> void:
	compile_requested.emit()


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
	var filters := _catalog_filters()
	for filter in filters:
		var button := get_node("ExtraActionPointEditorSurface/ExtraActionPointMasterDetail/ExtraActionPointMasterPanel/ExtraActionPointMaster/ExtraActionPointFilters/" + filters[filter]) as Button
		button.button_pressed = _catalog_filter == filter
		var label: String = {"no-known-caller": "NO KNOWN CALLER", "authored-without-known-caller": "AUTHORED / NO CALLER"}.get(filter, filter.to_upper())
		var count_key: String = {"no-known-caller": "noKnownCaller", "authored-without-known-caller": "authoredWithoutKnownCaller"}.get(filter, filter)
		button.text = "%s  %d" % [label, int(_catalog_counts.get(count_key, 0))]
	_previous_page.hide(); _next_page.hide()
	_page_status.text = "%d entries · scroll to browse" % _total_records


func _catalog_filters() -> Dictionary:
	return {"all": "All", "macro": "Macro", "battle": "Battle", "monster": "Monster",
		"no-known-caller": "Unlinked", "padding": "Padding", "residue": "Residue",
		"authored-without-known-caller": "Orphan", "trace": "Trace", "warnings": "Warnings"}


func _clear_document() -> void:
	_semantic_steps.clear_document()
	_saved_record_draft.clear()
	_semantic_steps.hide()
	_step_authoring.hide()
	%Callers.disabled = true
	_record_header.hide()
	_validation.hide()
	_empty_state.show()
	_used_by.clear()
	_duplicate_button.disabled = true
	_delete_button.disabled = true
	_identity.text = "No matching Extra Action Point"
	_descriptor.clear()
	_door_id.value = 0
	_post_level.value = 0
	_post_x.value = 0
	_post_y.value = 0
	_chance.value = 0
	_actions.clear()
	for child in _attachment_panel.get_children():
		child.queue_free()
	_source.text = "Import a certified Data ED3 source to edit Extra Action Points."
	_validation.text = "No Extra Action Point selected"
	_commit.disabled = true


func _show_delete_confirmation() -> void:
	var impacts: Array[String] = []
	for value in _used_by:
		var use := value as Dictionary
		impacts.append("%s · %s" % [str(use.get("source", "Unknown caller")), str(use.get("field", "unknown field"))])
	var uses_text := "No existing callers." if impacts.is_empty() else "• %s" % "\n• ".join(impacts)
	_delete_confirmation.dialog_text = "Delete this Extra Action Point?\n\nExisting callers that will become unresolved:\n%s\n\nNo caller is silently retargeted. Undo remains available." % uses_text
	_delete_confirmation.popup_centered()
	_delete_confirmation.get_cancel_button().grab_focus.call_deferred()
