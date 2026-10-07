class_name ProvidenceComplexEncounterEditor
extends HSplitContainer

signal discovery_requested(direction: String)

const DraftProjection = preload("res://src/action_step_draft_projection.gd")
const TEXT_BYTES := 39
const RESULT_COUNT := 4
const STEPS_PER_RESULT := 8

signal encounter_open_requested(identity: String)
signal encounter_apply_draft_requested(draft: Dictionary)
signal create_requested
signal copy_source_requested(source: String)
signal prompt_search_requested(query: String)
signal response_search_requested(kind: String, query: String)
signal rogue_search_requested(query: String)
signal message_open_requested(native_id: int)
signal compile_requested
signal selection_changed(encounter: Dictionary, references: Array)
signal action_form_describe_requested(query: Dictionary, request_id: int, draft_slot: int)
signal action_target_search_requested(query: Dictionary)
signal semantic_target_open_requested(kind: String, native_id: int, identity: String, context: Dictionary)
signal sound_preview_requested(native_id: int, identity: String, status: String)
signal code_help_requested(code: int, origin: Control)
signal manual_requested(page: int, origin: Control)

var _summaries: Array = []
var _document: Dictionary = {}
var _baseline_fields: Dictionary = {}
var _references: Array = []
var _projection_steps: Array = []
var _draft_steps := {}
var _baseline_steps: Array = []
var _definitions := {}
var _forms := {}
var _revision := 0
var _updating := false
var _selected_result := 0
var _selected_step := 0
var _physical: Array = []
var _magic: Array = []
var _items: Array = []
var _result_panels: Array = []
var _step_buttons: Array = []
var _prompt_items: Array = []
var _response_items: Array = []
var _picker_kind := ""
var _picker_slot := -1
var commit_handler: Callable

@onready var _list: ItemList = %EncounterCollection
@onready var _search: LineEdit = %EncounterSearch
@onready var _identity: Label = %EncounterIdentity
@onready var _prompt: LineEdit = %PromptMessage
@onready var _back_out: CheckBox = %CanBackOut
@onready var _attempts: SpinBox = %MaximumTimes
@onready var _technical: Label = %TechnicalText
@onready var _physical_result: OptionButton = %PhysicalResult
@onready var _typed: LineEdit = %TypedReply
@onready var _typed_count: Label = %TypedCount
@onready var _typed_result: OptionButton = %TypedResult
@onready var _rogue_enabled: CheckBox = %RogueEnabled
@onready var _rogue_choice: Button = %RogueChoice
@onready var _rogue_preview: Label = %RoguePreview
@onready var _rogue_reset: CheckBox = %RogueReset
@onready var _open_rogue_button: Button = %OpenRogue
@onready var _flow_text: Label = %FlowText
@onready var _validation: Label = %EncounterDraftValidation
@onready var _commit: Button = %ApplyEncounter
@onready var _compile: Button = %CompileEncounterSlice
@onready var _prompt_picker: PopupPanel = %PromptPicker
@onready var _prompt_search: LineEdit = %Search
@onready var _prompt_results: ItemList = %Results
@onready var _response_picker: PopupPanel = %ResponsePicker
@onready var _response_search: LineEdit = %ResponsePickerSearch
@onready var _response_results: ItemList = %ResponsePickerResults
@onready var _step_dialog: ProvidenceSimpleEncounterStepDialog = %SimpleEncounterStepDialog
@onready var _copy_dialog: Window = %SimpleEncounterCopyDialog

func route_identity() -> String: return "encounters.complex"


func select_result(index: int) -> void:
	if index < 0 or index >= RESULT_COUNT: return
	_selected_result = index
	_highlight_result(index)
func trusted_applied_native_id(draft_active := false) -> int:
	return -1 if draft_active or _document.is_empty() else int(_document.get("nativeId", -1))
func current_encounter() -> Dictionary: return _document.duplicate(true)
func list_query() -> Dictionary: return {"offset": 0, "limit": 128}
func selected_identity() -> String:
	var selected := _list.get_selected_items()
	return "" if selected.is_empty() else str((_summaries[int(_list.get_item_metadata(selected[0]))] as Dictionary).get("identity", ""))

func _ready() -> void:
	_build_physical_rows()
	_build_test_rows(%MagicRows, _magic, "magic", 10)
	_build_test_rows(%ItemRows, _items, "item", 5)
	_result_panels = [%Result1, %Result2Column, %Result3Column, %Result4Column]
	for result_index in range(RESULT_COUNT):
		var panel := _result_panels[result_index] as PanelContainer
		(panel.get_node("Steps/Heading") as Label).text = "RESULT %d" % (result_index + 1)
		for step_index in range(STEPS_PER_RESULT):
			var button := panel.get_node("Steps/Step%d" % (step_index + 1)) as Button
			button.clip_text = true
			button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
			button.pressed.connect(_open_step.bind(result_index * STEPS_PER_RESULT + step_index))
			_step_buttons.append(button)
	_prompt_search.text_changed.connect(func(value): prompt_search_requested.emit(value))
	_prompt_results.item_activated.connect(_accept_prompt)
	_response_search.text_changed.connect(_response_query_changed)
	_response_results.item_activated.connect(_accept_response)
	_step_dialog.done.connect(_accept_step_dialog)
	_step_dialog.form_describe_requested.connect(func(query, request_id, slot): action_form_describe_requested.emit(query, request_id, slot))
	_step_dialog.target_search_requested.connect(func(query): action_target_search_requested.emit(query))
	_step_dialog.peek_requested.connect(func(kind, id, identity, context): semantic_target_open_requested.emit(kind, id, identity, context))
	_step_dialog.preview_requested.connect(func(kind, id, identity, status):
		if kind == "sound": sound_preview_requested.emit(id, identity, status)
		else: semantic_target_open_requested.emit(kind, id, identity, {}))
	_step_dialog.help_requested.connect(func(code, origin): code_help_requested.emit(code, origin))
	_copy_dialog.source_requested.connect(func(identity): copy_source_requested.emit(identity))
	_copy_dialog.accepted.connect(_accept_copy_source)
	_typed.text_changed.connect(_changed)
	_physical_result.item_selected.connect(func(_i): _changed())
	_typed_result.item_selected.connect(func(_i): _changed())
	_back_out.toggled.connect(func(_v): _changed())
	_attempts.value_changed.connect(func(_v): _changed())
	_rogue_enabled.toggled.connect(_rogue_toggled)
	_rogue_reset.toggled.connect(func(_v): _changed())

func _build_physical_rows() -> void:
	for slot in range(8):
		var row := HBoxContainer.new()
		var required := CheckBox.new()
		var field := LineEdit.new()
		var count := Label.new()
		required.text = str(slot + 1)
		required.tooltip_text = "Success requires exactly the checked physical actions."
		field.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		field.placeholder_text = "Physical action label"
		count.custom_minimum_size.x = 42
		count.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		row.add_child(required); row.add_child(field); row.add_child(count); %PhysicalRows.add_child(row)
		_physical.append({"required": required, "text": field, "count": count})
		field.text_changed.connect(_physical_changed.bind(slot))
		required.toggled.connect(func(_value): _changed())

func _build_test_rows(parent: VBoxContainer, store: Array, kind: String, count: int) -> void:
	for slot in range(count):
		var row := HBoxContainer.new()
		var index := Label.new()
		var mode := OptionButton.new()
		var choose := Button.new()
		var result := OptionButton.new()
		index.text = str(slot + 1); index.custom_minimum_size.x = 18
		mode.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		choose.text = "Choose…"; result.custom_minimum_size.x = 92
		_populate_result_picker(result, 0)
		row.add_child(index); row.add_child(mode); row.add_child(choose); row.add_child(result); parent.add_child(row)
		store.append({"mode": mode, "choose": choose, "result": result, "value": 0})
		choose.pressed.connect(_open_response_picker.bind(kind, slot))
		mode.item_selected.connect(_test_mode_changed.bind(kind, slot))
		result.item_selected.connect(func(_i): _changed())

func set_summaries(result: Dictionary, revision: int, preferred_identity: String = "") -> void:
	var preferred := preferred_identity if not preferred_identity.is_empty() else str(_document.get("identity", ""))
	_summaries = (result.get("items", []) as Array).duplicate(true)
	_revision = revision
	_render_list(preferred)

func set_action_catalog(page: Dictionary) -> void:
	_definitions.clear(); _forms.clear()
	for value in page.get("items", []) as Array:
		var item := value as Dictionary
		_definitions[str(item.get("identity", ""))] = item
	for value in page.get("forms", []) as Array:
		var form := value as Dictionary
		_forms[str(form.get("identity", ""))] = form
	_step_dialog.set_catalog(page)
	_rebuild_drafts()

func set_document(result: Dictionary) -> void:
	_step_dialog.invalidate_document()
	_document = (result.get("encounter", {}) as Dictionary).duplicate(true); _baseline_fields = _document.duplicate(true)
	_references = (result.get("references", []) as Array).duplicate(true)
	_projection_steps = (result.get("steps", []) as Array).duplicate(true)
	_document["promptPreview"] = str(result.get("promptPreview", ""))
	_document["responseControls"] = result.get("responseControls", {})
	_document["roguePreview"] = result.get("roguePreview", {})
	_revision = int(result.get("revision", _revision))
	_rebuild_drafts(); _populate_document(); restore_catalog_selection()
	selection_changed.emit(_draft_encounter(), _references.duplicate(true))

func set_prompt_page(page: Dictionary) -> void:
	_prompt_items = (page.get("items", []) as Array).duplicate(true)
	_prompt_results.clear()
	for value in _prompt_items:
		var item := value as Dictionary
		_prompt_results.add_item("%d  ·  %s" % [int(item.get("nativeId", 0)), str(item.get("preview", ""))])
	if not _prompt_items.is_empty(): _prompt_results.select(0)

func set_response_page(page: Dictionary) -> void:
	_response_items = (page.get("items", []) as Array).duplicate(true)
	_response_results.clear()
	for value in _response_items:
		var item := value as Dictionary
		_response_results.add_item("%d  ·  %s" % [int(item.get("nativeId", 0)), str(item.get("label", item.get("preview", "")))])
	if not _response_items.is_empty(): _response_results.select(0)

func set_rogue_page(page: Dictionary) -> void:
	_response_items = (page.get("items", []) as Array).duplicate(true)
	_response_results.clear()
	for value in _response_items:
		var item := value as Dictionary
		var returned := item.get("returnedResults", []) as Array
		var labels: Array[String] = []
		for result in returned: labels.append(str(result))
		_response_results.add_item("%03d · %s · %d actions · returns %s" % [
			int(item.get("nativeId", 0)), str(item.get("label", "Rogue Encounter")),
			int(item.get("enabledActions", 0)), ", ".join(labels) if not labels.is_empty() else "unknown"])
	if not _response_items.is_empty(): _response_results.select(0)
func set_action_target_page(page: Dictionary) -> void: _step_dialog.set_action_target_page(page)
func set_action_form_description(description: Dictionary, request_id: int) -> void: _step_dialog.set_action_form_description(description, request_id)
func review_settings_change(impact: Dictionary) -> String: return await _step_dialog.review_settings_change(impact)
func set_copy_source_document(result: Dictionary) -> void: _copy_dialog.set_source_document(result)

func read_state() -> Dictionary:
	return {"identity": str(_document.get("identity", "")), "draft": _draft_encounter(), "query": _search.text, "result": _selected_result, "step": _selected_step}

func read_navigation_state() -> Dictionary:
	return preload("res://src/encounter_navigation_state.gd").capture(read_state(), _list, _step_dialog)

func prime_navigation_state(state: Dictionary) -> void:
	_search.set_block_signals(true)
	_search.text = str(state.get("query", ""))
	_search.set_block_signals(false)

func restore_navigation_state(state: Dictionary) -> void:
	_selected_result = clampi(int(state.get("result", 0)), 0, RESULT_COUNT - 1)
	_selected_step = clampi(int(state.get("step", 0)), 0, STEPS_PER_RESULT - 1)
	_highlight_result(_selected_result)
	_list.get_v_scroll_bar().value = float(state.get("listScroll", 0))
	var dialog: Dictionary = state.get("dialog", {})
	if dialog.get("visible", false):
		_open_step(_selected_result * STEPS_PER_RESULT + _selected_step)
		_step_dialog.restore_navigation_state(dialog)

func catalog_identity(items: Array, preferred: String = "") -> String:
	return preload("res://src/record_navigation.gd").catalog_identity(items, _search.text, preferred if not preferred.is_empty() else str(_document.get("identity", "")), "nativeId")

func restore_catalog_selection() -> void:
	var scroll := _list.get_v_scroll_bar().value
	preload("res://src/record_navigation.gd").select_summary(_list, _summaries, str(_document.get("identity", "")))
	_list.get_v_scroll_bar().value = scroll

func accept_saved_document(draft: Dictionary) -> void:
	_step_dialog.accept_saved_document(draft)
	for key in ["promptMessageNativeId", "canBackOut", "maxTimes", "actionResult", "wordResult", "groups", "spellIds", "spellResults", "itemIds", "itemResults", "thief", "casteSuccess", "thiefSuccess", "thiefFail", "texts"]:
		_document[key] = draft.get(key); _baseline_fields[key] = draft.get(key)
	_baseline_steps = (draft.get("steps", []) as Array).duplicate(true)
	_update_validation()

func has_unapplied_changes() -> bool:
	return _step_dialog.has_unapplied_changes() or (not _document.is_empty() and not preload("res://src/document_value_equality.gd").equal(_draft_encounter(), _baseline_draft()))

func discard_draft() -> void: _step_dialog.cancel(); _document.merge(_baseline_fields, true); _rebuild_drafts(); _populate_document()

func commit_selected() -> void:
	if _document.is_empty(): return
	if _step_dialog.has_unapplied_changes() and not _step_dialog.accept_local_draft(): return
	var error := draft_error()
	if not error.is_empty(): _validation.text = str(error.get("error", "Complete the encounter draft.")); return
	var draft := _draft_encounter()
	if commit_handler.is_valid(): await commit_handler.call(draft)
	else: encounter_apply_draft_requested.emit(draft)

func set_compile_available(available: bool, reason: String = "") -> void:
	_compile.disabled = not available
	_compile.tooltip_text = reason if not available else "Compile the certified Classic encounter slice."

func focus_source(identity: String, slot: int, field: String) -> bool:
	preload("res://src/record_navigation.gd").select_summary(_list, _summaries, identity)
	if slot >= 0:
		_open_step(slot)
		return await _step_dialog.focus_source_target(slot % STEPS_PER_RESULT, field)
	return preload("res://src/encounter_reference_navigation.gd").focus(field, {"promptMessage":_prompt, "thiefSuccess":_rogue_choice, "actionResult":_physical_result, "wordResult":_typed_result}, _magic, _items, $EncounterDetailScroll)

func _render_list(preferred_identity: String) -> void:
	var query := _search.text.strip_edges().to_lower()
	_list.clear()
	for index in range(_summaries.size()):
		var summary := _summaries[index] as Dictionary
		if not query.is_empty() and not ("%s %s" % [summary.get("nativeId", ""), summary.get("label", "")]).to_lower().contains(query): continue
		_list.add_item("%03d  %s" % [int(summary.get("nativeId", 0)), str(summary.get("label", "Unnamed encounter"))])
		_list.set_item_metadata(_list.item_count - 1, index)
	if _list.item_count == 0: _clear_document(); return
	var selected := 0
	for visible in range(_list.item_count):
		if str((_summaries[int(_list.get_item_metadata(visible))] as Dictionary).get("identity", "")) == preferred_identity: selected = visible; break
	_list.select(selected)
	_select_summary(selected)

func _select_summary(visible_index: int) -> void:
	if visible_index >= 0 and visible_index < _list.item_count:
		encounter_open_requested.emit(str((_summaries[int(_list.get_item_metadata(visible_index))] as Dictionary).get("identity", "")))

func _populate_document() -> void:
	if _document.is_empty(): _clear_document(); return
	_updating = true
	_identity.text = "COMPLEX ENCOUNTER %03d  ·  %s" % [int(_document.get("nativeId", 0)), str(_document.get("identity", ""))]
	_prompt.text = "%d  ·  %s" % [int(_document.get("promptMessageNativeId", 0)), str(_document.get("promptPreview", "No readable preview"))]
	_back_out.button_pressed = bool(_document.get("canBackOut", false))
	_attempts.value = int(_document.get("maxTimes", 0))
	_populate_result_picker(_physical_result, int(_document.get("actionResult", 0)))
	var texts := _document.get("texts", []) as Array
	var groups := _document.get("groups", []) as Array
	for slot in range(8):
		var row := _physical[slot] as Dictionary
		(row.text as LineEdit).text = str(texts[slot]) if slot < texts.size() else ""
		(row.required as CheckBox).button_pressed = slot < groups.size() and int(groups[slot]) != 0
		_update_physical_count(slot)
	_typed.text = str(texts[8]) if texts.size() > 8 else ""
	_populate_result_picker(_typed_result, int(_document.get("wordResult", 0)))
	_populate_tests(_magic, _document.get("spellIds", []) as Array, _document.get("spellResults", []) as Array, "magic")
	_populate_tests(_items, _document.get("itemIds", []) as Array, _document.get("itemResults", []) as Array, "item")
	_rogue_enabled.button_pressed = bool(_document.get("thief", false))
	_rogue_reset.button_pressed = int(_document.get("thiefFail", 0)) != 0
	_render_rogue()
	_typed_count.text = "%d / %d bytes" % [_typed.text.to_ascii_buffer().size(), TEXT_BYTES]
	_technical.text = "Data ED2 record %d · preserved casteSuccess %d · alignment byte and unknown encodings retained · revision %d" % [int(_document.get("nativeId", 0)), int(_document.get("casteSuccess", 0)), _revision]
	_updating = false
	_render_steps(); _update_flow(); _update_validation()

func _populate_result_picker(picker: OptionButton, value: int) -> void:
	picker.clear()
	var selected := -1
	for number in range(5):
		picker.add_item("Unavailable" if number == 0 else "Result %d" % number)
		picker.set_item_metadata(number, number)
		if number == value: selected = number
	if selected < 0:
		picker.add_item("Imported value %d" % value)
		picker.set_item_metadata(picker.item_count - 1, value)
		selected = picker.item_count - 1
	picker.select(selected)

func _populate_tests(rows: Array, ids: Array, results: Array, kind: String) -> void:
	for slot in range(rows.size()):
		var row := rows[slot] as Dictionary
		var value := int(ids[slot]) if slot < ids.size() else 0
		row.value = value
		var mode := row.mode as OptionButton
		mode.clear(); mode.add_item("Disabled"); mode.set_item_metadata(0, 0)
		if kind == "magic":
			mode.add_item("Blank but enabled"); mode.set_item_metadata(1, 1100)
			for klass in range(1, 7):
				mode.add_item("Spell class %d" % klass); mode.set_item_metadata(mode.item_count - 1, klass)
		else:
			mode.add_item("Blank but enabled"); mode.set_item_metadata(1, 9999)
		mode.add_item("Specific %s…" % kind); mode.set_item_metadata(mode.item_count - 1, -1)
		var selected := -1
		for index in range(mode.item_count):
			if int(mode.get_item_metadata(index)) == value: selected = index
		if selected < 0:
			mode.add_item("%s %d" % [kind.capitalize(), value]); mode.set_item_metadata(mode.item_count - 1, value); selected = mode.item_count - 1
		mode.select(selected)
		(row.choose as Button).visible = value > (6 if kind == "magic" else 0) and value not in [1100, 9999]
		_populate_result_picker(row.result as OptionButton, int(results[slot]) if slot < results.size() else 0)

func _render_rogue() -> void:
	preload("res://src/complex_rogue_response.gd").render(_document, _rogue_enabled, _rogue_choice, _open_rogue_button, _rogue_preview)

func _render_steps() -> void:
	for slot in range(RESULT_COUNT * STEPS_PER_RESULT):
		var button := _step_buttons[slot] as Button
		var draft := _draft_steps.get(slot, {}) as Dictionary
		if draft.is_empty():
			button.text = "%d  Empty · Choose action" % (slot % STEPS_PER_RESULT + 1)
			button.remove_theme_color_override("font_color")
			continue
		var definition := _definitions.get(str(draft.get("actionIdentity", "")), {}) as Dictionary
		button.text = "%d  %s\n    %s" % [slot % STEPS_PER_RESULT + 1, preload("res://src/action_step_presentation.gd").action_label(definition, "Classic action"), _draft_summary(draft, definition)]; button.tooltip_text = button.text; button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		button.add_theme_color_override("font_color", _category_color(str(definition.get("category", ""))))
	_highlight_result(_selected_result)

func _draft_summary(draft: Dictionary, definition: Dictionary) -> String:
	if draft.has("settings"):
		var values := (draft.settings as Dictionary).get("values", {}) as Dictionary
		var parts: Array[String] = []
		for key in values.keys().slice(0, 2): parts.append("%s %s" % [str(key).replace("_", " "), str(values[key])])
		if not parts.is_empty(): return " · ".join(parts)
	var family := str(definition.get("targetFamily", ""))
	return ("%s %d" % [family.replace("-", " ").capitalize(), int(draft.get("targetNativeId", 0))]) if not family.is_empty() else "Configured"

func _open_step(global_slot: int) -> void:
	if _document.is_empty(): return
	_selected_result = global_slot / STEPS_PER_RESULT
	_selected_step = global_slot % STEPS_PER_RESULT
	_highlight_result(_selected_result)
	_step_dialog.open_step_for_kind(str(_document.get("identity", "")), "complex-encounter", "Complex Encounter", _selected_result, _selected_step, _projections_for_result(_selected_result), _step_buttons[global_slot])

func _accept_step_dialog(result_index: int, local_steps: Array) -> void:
	for slot in range(result_index * STEPS_PER_RESULT, (result_index + 1) * STEPS_PER_RESULT): _draft_steps.erase(slot)
	for value in local_steps:
		var draft := (value as Dictionary).duplicate(true)
		draft["slot"] = result_index * STEPS_PER_RESULT + int(draft.get("slot", 0))
		_draft_steps[int(draft.slot)] = draft
	_render_steps(); _update_flow(); _update_validation()

func _projections_for_result(result_index: int) -> Array:
	return preload("res://src/encounter_step_projection.gd").for_result(result_index, _draft_steps, _definitions)

func _rebuild_drafts() -> void:
	_draft_steps = _draft_steps_from_projections(_projection_steps)
	_baseline_steps = _ordered_global_drafts()

func _draft_steps_from_projections(projections: Array) -> Dictionary:
	var result := {}
	if _forms.is_empty(): return result
	for result_index in range(RESULT_COUNT):
		var local_projections: Array = []
		for value in projections:
			var projection := value as Dictionary
			var slot := int(projection.get("slot", 0))
			if slot / STEPS_PER_RESULT != result_index: continue
			var local := projection.duplicate(true)
			local["slot"] = slot % STEPS_PER_RESULT
			local_projections.append(local)
		var local_drafts := (DraftProjection.from_steps(local_projections, _forms).drafts as Dictionary)
		for local_slot in local_drafts:
			var draft := (local_drafts[local_slot] as Dictionary).duplicate(true)
			draft["slot"] = result_index * STEPS_PER_RESULT + int(local_slot)
			result[int(draft.slot)] = draft
	return result

func _ordered_global_drafts() -> Array:
	var result: Array = []
	for result_index in range(RESULT_COUNT):
		var local := {}
		for local_slot in range(STEPS_PER_RESULT):
			var global_slot := result_index * STEPS_PER_RESULT + local_slot
			if _draft_steps.has(global_slot):
				var draft := (_draft_steps[global_slot] as Dictionary).duplicate(true)
				draft["slot"] = local_slot
				local[local_slot] = draft
		for value in DraftProjection.ordered(local):
			var draft := (value as Dictionary).duplicate(true)
			draft["slot"] = result_index * STEPS_PER_RESULT + int(draft.get("slot", 0))
			result.append(draft)
	return result

func _draft_encounter() -> Dictionary:
	if _document.is_empty(): return {}
	var texts: Array = []
	var groups: Array = []
	for row in _physical:
		texts.append((row.text as LineEdit).text)
		groups.append(1 if (row.required as CheckBox).button_pressed else 0)
	texts.append(_typed.text)
	return {
		"source": str(_document.get("identity", "")), "nativeId": int(_document.get("nativeId", 0)),
		"promptMessageNativeId": int(_document.get("promptMessageNativeId", 0)), "canBackOut": _back_out.button_pressed,
		"maxTimes": int(_attempts.value), "actionResult": _selected_value(_physical_result), "wordResult": _selected_value(_typed_result),
		"groups": groups, "spellIds": _test_values(_magic), "spellResults": _test_results(_magic),
		"itemIds": _test_values(_items), "itemResults": _test_results(_items), "thief": _rogue_enabled.button_pressed,
		"casteSuccess": int(_document.get("casteSuccess", 0)), "thiefSuccess": int(_document.get("thiefSuccess", 0)),
		"thiefFail": 1 if _rogue_reset.button_pressed else 0, "texts": texts, "steps": _ordered_global_drafts(),
	}

func _baseline_draft() -> Dictionary:
	if _document.is_empty(): return {}
	var result := _draft_encounter()
	for key in ["promptMessageNativeId", "canBackOut", "maxTimes", "actionResult", "wordResult", "groups", "spellIds", "spellResults", "itemIds", "itemResults", "thief", "casteSuccess", "thiefSuccess", "thiefFail", "texts"]:
		result[key] = _baseline_fields.get(key)
	result["steps"] = _baseline_steps.duplicate(true)
	return result

func _test_values(rows: Array) -> Array:
	var result: Array = []
	for row in rows: result.append(int((row as Dictionary).value))
	return result

func _test_results(rows: Array) -> Array:
	var result: Array = []
	for row in rows: result.append(_selected_value((row as Dictionary).result as OptionButton))
	return result

func _selected_value(picker: OptionButton) -> int:
	return int(picker.get_item_metadata(picker.selected)) if picker.selected >= 0 else 0

func draft_error() -> Dictionary:
	for slot in range(_physical.size()):
		var error := _text_error(((_physical[slot] as Dictionary).text as LineEdit).text, "Physical action %d" % (slot + 1))
		if not error.is_empty(): return error
	var typed_error := _text_error(_typed.text, "Typed reply")
	if not typed_error.is_empty(): return typed_error
	if _rogue_enabled.button_pressed and int(_document.get("thiefSuccess", 0)) < 0:
		return preload("res://src/editor_draft_apply.gd").failure("Choose a Rogue Encounter before enabling the Rogue response.", _rogue_choice)
	return {}

func _text_error(value: String, label: String) -> Dictionary:
	for index in range(value.length()):
		if value.unicode_at(index) > 127: return preload("res://src/editor_draft_apply.gd").failure("%s contains unsupported characters." % label, self)
	if value.to_ascii_buffer().size() > TEXT_BYTES: return preload("res://src/editor_draft_apply.gd").failure("%s exceeds the 39-byte Classic limit." % label, self)
	return {}

func _update_validation() -> void:
	if _updating: return
	%Callers.disabled = _document.is_empty()
	var error := draft_error()
	_commit.disabled = _document.is_empty() or not error.is_empty()
	_validation.text = str(error.get("error", ""))
	_validation.add_theme_color_override("font_color", Color("f09a82") if not error.is_empty() else Color("7dcaa2"))
	selection_changed.emit(_draft_encounter(), _references.duplicate(true))

func _changed(_value = null) -> void:
	if _updating: return
	_typed_count.text = "%d / %d bytes" % [_typed.text.to_ascii_buffer().size(), TEXT_BYTES]
	_update_flow(); _update_validation()

func _physical_changed(_value: String, slot: int) -> void:
	_update_physical_count(slot); _changed()

func _update_physical_count(slot: int) -> void:
	var row := _physical[slot] as Dictionary
	var count := (row.text as LineEdit).text.to_ascii_buffer().size()
	(row.count as Label).text = "%d/%d" % [count, TEXT_BYTES]
	(row.count as Label).add_theme_color_override("font_color", Color("f09a82") if count > TEXT_BYTES else Color("8fa5b9"))

func _test_mode_changed(index: int, kind: String, slot: int) -> void:
	if _updating: return
	var row := (_magic if kind == "magic" else _items)[slot] as Dictionary
	var value := int((row.mode as OptionButton).get_item_metadata(index))
	if value == -1: _open_response_picker(kind, slot); return
	row.value = value
	(row.choose as Button).visible = value > (6 if kind == "magic" else 0) and value not in [1100, 9999]
	_changed()

func _open_response_picker(kind: String, slot: int) -> void:
	_picker_kind = kind; _picker_slot = slot
	%ResponsePickerHeading.text = "CHOOSE %s" % kind.to_upper()
	_response_search.text = ""
	response_search_requested.emit(kind, "")
	_response_picker.popup_centered(Vector2i(680, 480)); _response_search.grab_focus()

func _choose_rogue() -> void:
	_picker_kind = "rogue-encounter"; _picker_slot = -1
	%ResponsePickerHeading.text = "CHOOSE ROGUE ENCOUNTER"
	_response_search.text = ""; rogue_search_requested.emit("")
	_response_picker.popup_centered(Vector2i(680, 480)); _response_search.grab_focus()

func _response_query_changed(query: String) -> void:
	if _picker_kind == "rogue-encounter": rogue_search_requested.emit(query)
	elif not _picker_kind.is_empty(): response_search_requested.emit(_picker_kind, query)

func _accept_response(index: int) -> void:
	if index < 0 or index >= _response_items.size(): return
	var item := _response_items[index] as Dictionary
	var id := int(item.get("nativeId", 0))
	if _picker_kind == "rogue-encounter":
		_document["thiefSuccess"] = id
		var returned := item.get("returnedResults", []) as Array
		var result_labels: Array[String] = []
		for value in returned: result_labels.append(str(value))
		_document["roguePreview"] = {"summary": "%s · %d actions · returns Results %s" % [
			str(item.get("label", "Rogue Encounter %d" % id)), int(item.get("enabledActions", 0)),
			", ".join(result_labels) if not result_labels.is_empty() else "unknown",
		]}
	else:
		var row := (_magic if _picker_kind == "magic" else _items)[_picker_slot] as Dictionary
		row.value = id
		(row.choose as Button).visible = true
		(row.choose as Button).text = "%d · %s" % [id, str(item.get("label", "Selected"))]
	_response_picker.hide(); _render_rogue(); _changed()

func _rogue_toggled(_enabled: bool) -> void: _render_rogue(); _changed()

func _open_rogue() -> void:
	var id := int(_document.get("thiefSuccess", 0))
	if id >= 0:
		semantic_target_open_requested.emit("rogue-encounter", id, "rogue-encounter:%d" % id, {"returnIdentity": str(_document.get("identity", "")), "result": _selected_result, "step": _selected_step, "field": "rogue"})

func _update_flow() -> void:
	var lines: Array[String] = []
	lines.append("Physical exact set → %s" % _result_label(_selected_value(_physical_result)))
	lines.append("Magic tests in order → %s" % ("disabled by slot 1" if _magic.is_empty() or int((_magic[0] as Dictionary).value) == 0 else "configured results"))
	lines.append("Item tests in order → %s" % ("disabled by slot 1" if _items.is_empty() or int((_items[0] as Dictionary).value) == 0 else "configured results"))
	lines.append("Typed reply → %s" % _result_label(_selected_value(_typed_result)))
	lines.append("Unmatched attempt → Result 4")
	if int(_attempts.value) > 1: lines.append("Final failed attempt → Result 3")
	if _rogue_enabled.button_pressed: lines.append("Rogue Encounter %d returns → results in this Complex Encounter" % int(_document.get("thiefSuccess", 0)))
	_flow_text.text = "\n".join(lines)

func _result_label(value: int) -> String: return "unavailable" if value == 0 else "Result %d" % value

func _highlight_result(result_index: int) -> void:
	for index in range(_result_panels.size()):
		(_result_panels[index] as PanelContainer).modulate = Color("fff3c4") if index == result_index else Color.WHITE

func _find_prompt() -> void:
	_prompt_search.text = ""; prompt_search_requested.emit("")
	_prompt_picker.popup_centered(Vector2i(620, 430)); _prompt_search.grab_focus()

func _accept_prompt(index: int) -> void:
	if index < 0 or index >= _prompt_items.size(): return
	var item := _prompt_items[index] as Dictionary
	_document["promptMessageNativeId"] = int(item.get("nativeId", 0))
	_document["promptPreview"] = str(item.get("preview", ""))
	_prompt.text = "%d  ·  %s" % [int(item.get("nativeId", 0)), str(item.get("preview", ""))]
	_prompt_picker.hide(); _changed()

func _preview_prompt() -> void:
	if not _document.is_empty(): message_open_requested.emit(int(_document.get("promptMessageNativeId", 0)))


func _copy() -> void:
	if not _document.is_empty(): _copy_dialog.open_for(str(_document.get("identity", "")), _summaries, %CopyEncounter, "Complex")

func _accept_copy_source(source: Dictionary, sections: Dictionary) -> void:
	var encounter := source.get("encounter", {}) as Dictionary
	if encounter.is_empty(): return
	_updating = true
	if bool(sections.get("promptSettings", false)):
		for key in ["promptMessageNativeId", "canBackOut", "maxTimes", "casteSuccess", "thief", "thiefSuccess", "thiefFail"]: _document[key] = encounter.get(key)
		_document["promptPreview"] = str(source.get("promptPreview", ""))
		_document["roguePreview"] = source.get("roguePreview", {})
	if bool(sections.get("responses", false)):
		for key in ["actionResult", "wordResult", "groups", "spellIds", "spellResults", "itemIds", "itemResults", "texts"]:
			_document[key] = (encounter.get(key) as Array).duplicate(true) if encounter.get(key) is Array else encounter.get(key)
	if bool(sections.get("programs", false)): _draft_steps = _draft_steps_from_projections(source.get("steps", []) as Array)
	_updating = false; _populate_document()


func _previous() -> void:
	var selected := _list.get_selected_items()
	if not selected.is_empty() and selected[0] > 0:
		_list.select(selected[0] - 1); _select_summary(selected[0] - 1)

func _next() -> void:
	var selected := _list.get_selected_items()
	if not selected.is_empty() and selected[0] + 1 < _list.item_count:
		_list.select(selected[0] + 1); _select_summary(selected[0] + 1)

func _lowercase_typed() -> void: _typed.text = _typed.text.to_lower(); _changed()
func _toggle_technical(visible: bool) -> void: _technical.visible = visible
func _toggle_flow() -> void:
	_flow_text.visible = not _flow_text.visible
	%FlowSummary.text = ("▾" if _flow_text.visible else "▸") + "  RESULT FLOW SUMMARY"

func _open_code_helper() -> void:
	var draft := _draft_steps.get(_selected_result * STEPS_PER_RESULT + _selected_step, {}) as Dictionary
	code_help_requested.emit(abs(int((_definitions.get(str(draft.get("actionIdentity", "")), {}) as Dictionary).get("opcode", 0))), %OpenCodeHelper)

func _preview_selected_sound() -> void:
	var draft := _draft_steps.get(_selected_result * STEPS_PER_RESULT + _selected_step, {}) as Dictionary
	var definition := _definitions.get(str(draft.get("actionIdentity", "")), {}) as Dictionary
	if str(definition.get("targetFamily", "")) != "sound":
		_validation.text = "Select a Play Sound step to audition it."
		return
	sound_preview_requested.emit(int(draft.get("targetNativeId", 0)), "", "")

func _open_manual() -> void: manual_requested.emit(17, %OpenManual)
func _on_search_changed(_text: String) -> void:
	if not has_unapplied_changes(): _render_list(str(_document.get("identity", "")))

func _category_color(category: String) -> Color:
	return ProvidenceActionStepPresentation.encounter_category_color(category)

func _clear_document() -> void:
	%Callers.disabled = true
	_step_dialog.invalidate_document()
	_document.clear(); _baseline_fields.clear(); _projection_steps.clear(); _draft_steps.clear(); _baseline_steps.clear()
	_identity.text = "No matching complex encounter"; _prompt.text = ""
	_render_steps(); _validation.text = "No encounter selected"; _commit.disabled = true
