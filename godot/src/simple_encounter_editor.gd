class_name ProvidenceSimpleEncounterEditor
extends HSplitContainer

signal discovery_requested(direction: String)

const DraftProjection = preload("res://src/action_step_draft_projection.gd")
const RESPONSE_BYTES := 79
const RESULT_COUNT := 4
const STEPS_PER_RESULT := 8

signal encounter_open_requested(identity: String)
signal encounter_apply_draft_requested(draft: Dictionary)
signal create_requested
signal copy_source_requested(source: String)
signal prompt_search_requested(query: String)
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
var _saved_prompt_id := 0
var _saved_prompt_preview := ""
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
var _response_controls: Array = []
var _result_panels: Array = []
var _step_buttons: Array = []
var _prompt_items: Array = []
var commit_handler: Callable

@onready var _list: ItemList = %EncounterCollection
@onready var _search: LineEdit = %EncounterSearch
@onready var _identity: Label = %EncounterIdentity
@onready var _prompt: LineEdit = %PromptMessage
@onready var _can_back_out: CheckBox = %CanBackOut
@onready var _max_times: SpinBox = %MaximumTimes
@onready var _caste_success: SpinBox = %CasteSuccess
@onready var _technical_text: Label = %TechnicalText
@onready var _responses: VBoxContainer = %ResponseRows
@onready var _columns: HBoxContainer = %ResultColumns
@onready var _flow_text: Label = %FlowText
@onready var _validation: Label = %EncounterDraftValidation
@onready var _commit: Button = %ApplyEncounter
@onready var _compile: Button = %CompileEncounterSlice
@onready var _picker: PopupPanel = %PromptPicker
@onready var _picker_search: LineEdit = %Search
@onready var _picker_results: ItemList = %Results
@onready var _step_dialog: ProvidenceSimpleEncounterStepDialog = %SimpleEncounterStepDialog
@onready var _copy_dialog: Window = %SimpleEncounterCopyDialog


func route_identity() -> String: return "encounters.simple"


func _ready() -> void:
	_response_controls = [
		{"text": %Response1Text, "count": %Response1Count, "result": %Response1Result},
		{"text": %Response2Text, "count": %Response2Count, "result": %Response2Result},
		{"text": %Response3Text, "count": %Response3Count, "result": %Response3Result},
		{"text": %Response4Text, "count": %Response4Count, "result": %Response4Result},
	]
	_result_panels = [%Result1, %Result2Column, %Result3Column, %Result4Column]
	for result_index in range(RESULT_COUNT):
		var panel := _result_panels[result_index] as PanelContainer
		(panel.get_node("Steps/Heading") as Label).text = "RESULT %d" % (result_index + 1)
		for step_index in range(STEPS_PER_RESULT):
			var button := panel.get_node("Steps/Step%d" % (step_index + 1)) as Button
			button.pressed.connect(_open_step.bind(result_index * STEPS_PER_RESULT + step_index))
			_step_buttons.append(button)
	for slot in range(RESULT_COUNT):
		var controls := _response_controls[slot] as Dictionary
		(controls.text as TextEdit).text_changed.connect(_response_changed.bind(slot))
		(controls.result as OptionButton).item_selected.connect(_result_choice_changed.bind(slot))
	_picker_search.text_changed.connect(func(value): prompt_search_requested.emit(value))
	_picker_results.item_activated.connect(_accept_prompt)
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
	_can_back_out.toggled.connect(func(_value): _update_validation())
	_max_times.value_changed.connect(func(_value): _update_validation())
	_caste_success.value_changed.connect(func(_value): _update_validation())


func selected_identity() -> String:
	var selected := _list.get_selected_items()
	if selected.is_empty(): return ""
	return str((_summaries[int(_list.get_item_metadata(selected[0]))] as Dictionary).get("identity", ""))


func current_encounter() -> Dictionary:
	return _document.duplicate(true)


func list_query() -> Dictionary: return {"offset": 0, "limit": 128}


func set_summaries(result: Dictionary, revision: int, preferred_identity: String = "") -> void:
	var preferred := preferred_identity if not preferred_identity.is_empty() else str(_document.get("identity", ""))
	_summaries = (result.get("items", []) as Array).duplicate(true)
	_revision = revision
	_render_list(preferred)


func set_action_catalog(page: Dictionary) -> void:
	_definitions.clear()
	for value in page.get("items", []) as Array:
		var definition := value as Dictionary
		_definitions[str(definition.get("identity", ""))] = definition
	_forms.clear()
	for value in page.get("forms", []) as Array:
		var form := value as Dictionary
		_forms[str(form.get("identity", ""))] = form
	_step_dialog.set_catalog(page)
	_rebuild_drafts()


func set_document(result: Dictionary) -> void:
	_step_dialog.invalidate_document()
	_document = (result.get("encounter", {}) as Dictionary).duplicate(true)
	_references = (result.get("references", []) as Array).duplicate(true)
	_projection_steps = (result.get("steps", []) as Array).duplicate(true)
	_document["promptPreview"] = str(result.get("promptPreview", ""))
	_saved_prompt_id = int(_document.get("promptMessageNativeId",0))
	_saved_prompt_preview = str(_document.promptPreview)
	_revision = int(result.get("revision", _revision))
	_rebuild_drafts()
	_populate_document()
	restore_catalog_selection()
	selection_changed.emit(_draft_encounter(), _references.duplicate(true))


func set_prompt_page(page: Dictionary) -> void:
	_prompt_items = (page.get("items", []) as Array).duplicate(true)
	_picker_results.clear()
	for value in _prompt_items:
		var item := value as Dictionary
		_picker_results.add_item("%d  ·  %s" % [int(item.get("nativeId", 0)), str(item.get("preview", ""))])
	if not _prompt_items.is_empty(): _picker_results.select(0)


func set_action_target_page(page: Dictionary) -> void: _step_dialog.set_action_target_page(page)
func set_action_form_description(description: Dictionary, request_id: int) -> void: _step_dialog.set_action_form_description(description, request_id)
func review_settings_change(impact: Dictionary) -> String: return await _step_dialog.review_settings_change(impact)
func set_copy_source_document(result: Dictionary) -> void: _copy_dialog.set_source_document(result)


func read_state() -> Dictionary:
	return {"identity": str(_document.get("identity", "")), "draft": _draft_encounter(), "query": _search.text,
		"result": _selected_result, "step": _selected_step}


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
	return preload("res://src/record_navigation.gd").catalog_identity(items, _search.text,
		preferred if not preferred.is_empty() else str(_document.get("identity", "")), "nativeId")


func restore_catalog_selection() -> void:
	var scroll := _list.get_v_scroll_bar().value
	preload("res://src/record_navigation.gd").select_summary(_list, _summaries, str(_document.get("identity", "")))
	_list.get_v_scroll_bar().value = scroll


func accept_saved_document(draft: Dictionary) -> void:
	_step_dialog.accept_saved_document(draft)
	for key in ["promptMessageNativeId", "canBackOut", "maxTimes", "casteSuccess", "texts", "choiceResults"]:
		_document[key] = draft.get(key)
	_saved_prompt_id = int(_document.get("promptMessageNativeId",0))
	_saved_prompt_preview = str(_document.get("promptPreview",""))
	_baseline_steps = (draft.get("steps", []) as Array).duplicate(true)
	_update_validation()


func has_unapplied_changes() -> bool:
	return _step_dialog.has_unapplied_changes() or (not _document.is_empty() and not preload("res://src/document_value_equality.gd").equal(_draft_encounter(), _baseline_draft()))


func discard_draft() -> void:
	_step_dialog.cancel()
	_document["promptMessageNativeId"] = _saved_prompt_id
	_document["promptPreview"] = _saved_prompt_preview
	_rebuild_drafts()
	_populate_document()


func commit_selected() -> void:
	if _document.is_empty(): return
	if _step_dialog.has_unapplied_changes() and not _step_dialog.accept_local_draft(): return
	var error := draft_error()
	if not error.is_empty():
		_validation.text = str(error.get("error", "Complete the encounter draft."))
		return
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
	if field == "promptMessage":
		_prompt.grab_focus()
		return true
	if field.begins_with("choiceResults["):
		var index := int(field.get_slice("[", 1).get_slice("]", 0))
		if index >= _response_controls.size(): return false
		var control: Control = _response_controls[index].result
		$EncounterDetailScroll.ensure_control_visible(control)
		control.grab_focus()
		return true
	return false


func _render_list(preferred_identity: String) -> void:
	var query := _search.text.strip_edges().to_lower(); _list.clear()
	for index in range(_summaries.size()):
		var summary := _summaries[index] as Dictionary
		if not query.is_empty() and not ("%s %s" % [summary.get("nativeId", ""), summary.get("label", "")]).to_lower().contains(query): continue
		_list.add_item("%03d  %s" % [int(summary.get("nativeId", 0)), str(summary.get("label", "Unnamed encounter"))])
		_list.set_item_metadata(_list.item_count - 1, index)
	if _list.item_count == 0: _clear_document(); return
	var selected := 0
	for visible in range(_list.item_count):
		if str((_summaries[int(_list.get_item_metadata(visible))] as Dictionary).get("identity", "")) == preferred_identity: selected = visible; break
	_list.select(selected); _select_summary(selected)


func _select_summary(visible_index: int) -> void:
	if visible_index < 0 or visible_index >= _list.item_count: return
	encounter_open_requested.emit(str((_summaries[int(_list.get_item_metadata(visible_index))] as Dictionary).get("identity", "")))


func _populate_document() -> void:
	if _document.is_empty(): _clear_document(); return
	_updating = true
	var native_id := int(_document.get("nativeId", 0))
	_identity.text = "SIMPLE ENCOUNTER %03d  ·  %s" % [native_id, str(_document.get("identity", ""))]
	_prompt.text = "%d  ·  %s" % [int(_document.get("promptMessageNativeId", 0)), str(_document.get("promptPreview", "No readable preview"))]
	_can_back_out.button_pressed = bool(_document.get("canBackOut", false)); _max_times.value = int(_document.get("maxTimes", 0)); _caste_success.value = int(_document.get("casteSuccess", 0))
	var texts := _document.get("texts", []) as Array; var results := _document.get("choiceResults", []) as Array
	for slot in range(RESULT_COUNT):
		var controls := _response_controls[slot] as Dictionary
		(controls.text as TextEdit).text = str(texts[slot]) if slot < texts.size() else ""
		_populate_result_picker(controls.result as OptionButton, slot, int(results[slot]) if slot < results.size() else 0)
		_update_response_count(slot)
	_technical_text.text = "Data ED record %d · preserved byte 102: %d · revision %d" % [native_id, int(_caste_success.value), _revision]
	_updating = false
	_render_steps(); _update_flow(); _update_validation()


func _populate_result_picker(picker: OptionButton, slot: int, value: int) -> void:
	picker.clear(); var choices := [[0, "No result / unavailable"], [1, "Result 1"], [2, "Result 2"], [3, "Result 3"], [4, "Result 4"]]
	if slot == 0: choices.append([-4, "Auto-run Result 4 (skip prompt)"])
	var selected := -1
	for choice in choices:
		picker.add_item(str(choice[1])); picker.set_item_metadata(picker.item_count - 1, int(choice[0]))
		if int(choice[0]) == value: selected = picker.item_count - 1
	if selected < 0: picker.add_item("Unsupported imported value %d" % value); picker.set_item_metadata(picker.item_count - 1, value); selected = picker.item_count - 1
	picker.select(selected); picker.tooltip_text = picker.get_item_text(selected)


func _render_steps() -> void:
	for slot in range(RESULT_COUNT * STEPS_PER_RESULT):
		var button := _step_buttons[slot] as Button; var draft := _draft_steps.get(slot, {}) as Dictionary
		if draft.is_empty(): button.text = "%d  Empty · Choose action" % (slot % STEPS_PER_RESULT + 1); button.remove_theme_color_override("font_color"); continue
		var definition := _definitions.get(str(draft.get("actionIdentity", "")), {}) as Dictionary
		button.text = "%d  %s\n    %s" % [slot % STEPS_PER_RESULT + 1, preload("res://src/action_step_presentation.gd").action_label(definition, "Classic action"), _draft_summary(draft, definition)]; button.tooltip_text = button.text; button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		button.add_theme_color_override("font_color", _category_color(str(definition.get("category", ""))))
	_highlight_result(_selected_result)


func _draft_summary(draft: Dictionary, definition: Dictionary) -> String:
	if draft.has("settings"):
		var values := (draft.settings as Dictionary).get("values", {}) as Dictionary; var parts: Array[String] = []
		for key in values.keys().slice(0, 2): parts.append("%s %s" % [str(key).replace("_", " "), str(values[key])])
		if not parts.is_empty(): return " · ".join(parts)
	var family := str(definition.get("targetFamily", ""))
	return ("%s %d" % [family.replace("-", " ").capitalize(), int(draft.get("targetNativeId", 0))]) if not family.is_empty() else "Configured"


func _open_step(global_slot: int) -> void:
	if _document.is_empty(): return
	_selected_result = global_slot / STEPS_PER_RESULT; _selected_step = global_slot % STEPS_PER_RESULT; _highlight_result(_selected_result)
	_step_dialog.open_step(str(_document.get("identity", "")), _selected_result, _selected_step, _projections_for_result(_selected_result), _step_buttons[global_slot])


func _accept_step_dialog(result_index: int, local_steps: Array) -> void:
	for slot in range(result_index * STEPS_PER_RESULT, (result_index + 1) * STEPS_PER_RESULT): _draft_steps.erase(slot)
	for value in local_steps:
		var draft := (value as Dictionary).duplicate(true); draft["slot"] = result_index * STEPS_PER_RESULT + int(draft.get("slot", 0)); _draft_steps[int(draft.slot)] = draft
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
			var projection := value as Dictionary; var slot := int(projection.get("slot", 0))
			if slot / STEPS_PER_RESULT != result_index: continue
			var local := projection.duplicate(true); local["slot"] = slot % STEPS_PER_RESULT; local_projections.append(local)
		var local_drafts := (DraftProjection.from_steps(local_projections, _forms).drafts as Dictionary)
		for local_slot in local_drafts:
			var draft := (local_drafts[local_slot] as Dictionary).duplicate(true); draft["slot"] = result_index * STEPS_PER_RESULT + int(local_slot)
			result[int(draft.slot)] = draft
	return result


func _ordered_global_drafts() -> Array:
	var result: Array = []
	for result_index in range(RESULT_COUNT):
		var local := {}
		for local_slot in range(STEPS_PER_RESULT):
			var global_slot := result_index * STEPS_PER_RESULT + local_slot
			if _draft_steps.has(global_slot): var draft := (_draft_steps[global_slot] as Dictionary).duplicate(true); draft["slot"] = local_slot; local[local_slot] = draft
		for value in DraftProjection.ordered(local): var draft := (value as Dictionary).duplicate(true); draft["slot"] = result_index * STEPS_PER_RESULT + int(draft.get("slot", 0)); result.append(draft)
	return result


func _draft_encounter() -> Dictionary:
	if _document.is_empty(): return {}
	var texts: Array = []; var results: Array = []
	for slot in range(RESULT_COUNT):
		var controls := _response_controls[slot] as Dictionary; var picker := controls.result as OptionButton
		texts.append((controls.text as TextEdit).text); results.append(int(picker.get_item_metadata(picker.selected)))
	return {"source": str(_document.get("identity", "")), "nativeId": int(_document.get("nativeId", 0)), "promptMessageNativeId": int(_document.get("promptMessageNativeId", 0)),
		"canBackOut": _can_back_out.button_pressed, "maxTimes": int(_max_times.value), "casteSuccess": int(_caste_success.value), "texts": texts, "choiceResults": results, "steps": _ordered_global_drafts()}


func _baseline_draft() -> Dictionary:
	if _document.is_empty(): return {}
	return {"source": str(_document.get("identity", "")), "nativeId": int(_document.get("nativeId", 0)), "promptMessageNativeId": _saved_prompt_id,
		"canBackOut": bool(_document.get("canBackOut", false)), "maxTimes": int(_document.get("maxTimes", 0)), "casteSuccess": int(_document.get("casteSuccess", 0)),
		"texts": (_document.get("texts", []) as Array).duplicate(true), "choiceResults": (_document.get("choiceResults", []) as Array).duplicate(true), "steps": _baseline_steps.duplicate(true)}


func draft_error() -> Dictionary:
	for slot in range(RESULT_COUNT):
		var text := ((_response_controls[slot] as Dictionary).text as TextEdit).text
		if not _is_ascii(text): return preload("res://src/editor_draft_apply.gd").failure("Option %d contains unsupported characters." % (slot + 1), (_response_controls[slot] as Dictionary).text)
		if text.to_ascii_buffer().size() > RESPONSE_BYTES: return preload("res://src/editor_draft_apply.gd").failure("Option %d exceeds the 79-byte Classic limit." % (slot + 1), (_response_controls[slot] as Dictionary).text)
	return {}


func _update_validation() -> void:
	if _updating: return
	%Callers.disabled = _document.is_empty()
	var error := draft_error(); _commit.disabled = _document.is_empty() or not error.is_empty()
	_validation.text = str(error.get("error", ""))
	_validation.add_theme_color_override("font_color", Color("f09a82") if not error.is_empty() else Color("7dcaa2"))
	selection_changed.emit(_draft_encounter(), _references.duplicate(true))


func _update_response_count(slot: int) -> void:
	var controls := _response_controls[slot] as Dictionary; var count := (controls.text as TextEdit).text.to_ascii_buffer().size()
	(controls.count as Label).text = "%d/%d" % [count, RESPONSE_BYTES]; (controls.count as Label).add_theme_color_override("font_color", Color("f09a82") if count > RESPONSE_BYTES else Color("8fa5b9"))


func _response_changed(slot: int) -> void:
	if not _updating: _update_response_count(slot); _update_validation()


func _result_choice_changed(_choice: int, slot: int) -> void:
	if _updating: return
	var picker := (_response_controls[slot] as Dictionary).result as OptionButton; var value := int(picker.get_item_metadata(picker.selected)); picker.tooltip_text = picker.get_item_text(picker.selected)
	_selected_result = 3 if value == -4 else maxi(value - 1, 0); _highlight_result(_selected_result); _update_flow(); _update_validation()


func _highlight_result(result_index: int) -> void:
	for index in range(_result_panels.size()): (_result_panels[index] as PanelContainer).modulate = Color("fff3c4") if index == result_index else Color.WHITE


func _update_flow() -> void:
	var lines: Array[String] = []
	for slot in range(RESULT_COUNT):
		var picker := (_response_controls[slot] as Dictionary).result as OptionButton; var value := int(picker.get_item_metadata(picker.selected))
		if slot == 0 and value == -4: lines.append("Before choices → Result 4 (automatic)")
		elif value == 0: lines.append("Option %d → unavailable" % (slot + 1))
		else: lines.append("Option %d → Result %d" % [slot + 1, value])
	_flow_text.text = "\n".join(lines)


func _find_prompt() -> void: _picker_search.text = ""; prompt_search_requested.emit(""); _picker.popup_centered(Vector2i(620, 430)); _picker_search.grab_focus()
func _accept_prompt(index: int) -> void:
	if index < 0 or index >= _prompt_items.size(): return
	var item := _prompt_items[index] as Dictionary; _document["promptMessageNativeId"] = int(item.get("nativeId", 0)); _document["promptPreview"] = str(item.get("preview", ""))
	_prompt.text = "%d  ·  %s" % [int(item.get("nativeId", 0)), str(item.get("preview", ""))]; _picker.hide(); _update_validation()
func _preview_prompt() -> void:
	if not _document.is_empty(): message_open_requested.emit(int(_document.get("promptMessageNativeId", 0)))
func _edit_prompt() -> void: _preview_prompt()
func _copy() -> void:
	if not _document.is_empty(): _copy_dialog.open_for(str(_document.get("identity", "")), _summaries, %CopyEncounter)


func _accept_copy_source(source: Dictionary, sections: Dictionary) -> void:
	var encounter := source.get("encounter", {}) as Dictionary
	if encounter.is_empty(): return
	_updating = true
	if bool(sections.get("promptSettings", false)):
		for key in ["promptMessageNativeId", "canBackOut", "maxTimes", "casteSuccess"]: _document[key] = encounter.get(key)
		_document["promptPreview"] = str(source.get("promptPreview", ""))
	if bool(sections.get("responses", false)):
		_document["texts"] = (encounter.get("texts", []) as Array).duplicate(true)
		_document["choiceResults"] = (encounter.get("choiceResults", []) as Array).duplicate(true)
	if bool(sections.get("programs", false)):
		_draft_steps = _draft_steps_from_projections(source.get("steps", []) as Array)
	_updating = false
	_populate_document()
func _create() -> void: create_requested.emit()
func _previous() -> void:
	var selected := _list.get_selected_items()
	if not selected.is_empty() and selected[0] > 0: _list.select(selected[0] - 1); _select_summary(selected[0] - 1)
func _next() -> void:
	var selected := _list.get_selected_items()
	if not selected.is_empty() and selected[0] + 1 < _list.item_count: _list.select(selected[0] + 1); _select_summary(selected[0] + 1)
func _toggle_technical(visible: bool) -> void: _technical_text.visible = visible
func _toggle_flow() -> void: _flow_text.visible = not _flow_text.visible; %FlowSummary.text = ("▾" if _flow_text.visible else "▸") + "  RESULT FLOW SUMMARY"
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
func _open_manual() -> void: manual_requested.emit(16, %OpenManual)
func _on_compile_pressed() -> void: compile_requested.emit()
func _on_search_changed(_text: String) -> void:
	if not has_unapplied_changes(): _render_list(str(_document.get("identity", "")))
func _category_color(category: String) -> Color:
	return ProvidenceActionStepPresentation.encounter_category_color(category)

func _is_ascii(value: String) -> bool:
	for index in range(value.length()):
		if value.unicode_at(index) > 127: return false
	return true
func _clear_document() -> void:
	%Callers.disabled = true
	_step_dialog.invalidate_document()
	_document.clear(); _projection_steps.clear(); _draft_steps.clear(); _baseline_steps.clear(); _identity.text = "No matching simple encounter"; _prompt.text = ""
	for controls in _response_controls: ((controls as Dictionary).text as TextEdit).text = ""
	_render_steps(); _validation.text = "No encounter selected"; _commit.disabled = true
