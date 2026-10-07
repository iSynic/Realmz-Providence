class_name ProvidenceActionStepWorkbench
extends HBoxContainer

const StepPresentation = preload("res://src/action_step_presentation.gd")

const DraftProjection = preload("res://src/action_step_draft_projection.gd")
var _field_renderer := ProvidenceActionFieldRenderer.new()

signal form_describe_requested(query: Dictionary, request_id: int, draft_slot: int)
signal target_search_requested(query: Dictionary)
signal peek_requested(kind: String, native_id: int, identity: String, context: Dictionary)
signal preview_requested(kind: String, native_id: int, identity: String, status: String)
signal help_requested(code: int, origin: Control)
signal validation_changed

var _identity := ""
var _definitions: Array = []
var _definitions_by_identity := {}
var _forms := {}
var _draft_steps := {}
var _settings_origins := {}
var _baseline_steps: Array = []
var _selected_slot := 0
var _context := {}
var _field_controls := {}
var _form_description := {}
var _target_field := ""
var _updating := false
var _gosub_applicable := false
var _describe_generation := 0
var _target_generation := 0
var _picker_generation := 0
var _picker_origin := {}
var _picker_callback: Callable

@onready var _step_list: ProvidenceActionStepList = %SemanticStepList
@onready var _summary: Label = %SemanticStepSummary
@onready var _editor_panel: PanelContainer = $EditorPanel
@onready var _editor_scroll: ScrollContainer = $EditorPanel/Layout/Scroll
@onready var _action_name: Label = %CurrentActionName
@onready var _action_button: Button = %ChooseAction
@onready var _action_picker: ProvidenceDivinityCodeHelper = %StepActionPicker
@onready var _description: Label = %SemanticActionDescription
@onready var _heading: Label = %SemanticStepHeading
@onready var _gosub: CheckBox = %SemanticGosub
@onready var _settings_heading: Label = %SemanticSettingsHeading
@onready var _target_field_box: VBoxContainer = %SemanticTargetField
@onready var _target_label: Label = %SemanticTargetLabel
@onready var _target_value: SpinBox = %SemanticTargetValue
@onready var _find_target: Button = %SemanticFindTarget
@onready var _peek_target: Button = %SemanticPeekTarget
@onready var _form: GridContainer = %SemanticForm
@onready var _target_search: LineEdit = %SemanticTargetSearch
@onready var _target_results: ItemList = %SemanticTargetResults
@onready var _target_panel: VBoxContainer = %SemanticTargetPanel
@onready var _technical_toggle: Button = %SemanticTechnicalToggle
@onready var _technical: Label = %SemanticTechnicalDetails
@onready var _imported_context: Button = %SemanticImportedContext
@onready var _preview: Label = %SemanticPreview
@onready var _default: Label = %SemanticDefault
@onready var _impact_dialog: ProvidenceSettingsImpactDialog = %SemanticSharedImpactDialog
@onready var _move_up: Button = %SemanticMoveUp
@onready var _move_down: Button = %SemanticMoveDown
@onready var _duplicate: Button = %SemanticDuplicate
@onready var _clear: Button = %SemanticClear


func _ready() -> void:
	_field_renderer.changed.connect(_on_field_changed)
	_field_renderer.search_requested.connect(_request_field_targets)
	_field_renderer.open_requested.connect(func(kind, value, identity, context): peek_requested.emit(kind, value, identity, context))
	_field_renderer.preview_requested.connect(func(kind, value, identity, status): preview_requested.emit(kind, value, identity, status))
	var spacious := get_viewport_rect().size.y > 900.0
	_description.visible = spacious
	_step_list.item_selected.connect(_select_slot)
	_action_button.pressed.connect(_open_action_picker)
	_action_picker.selection_cancelled.connect(invalidate_action_picker)
	visibility_changed.connect(func():
		if not is_visible_in_tree(): invalidate_action_picker())
	_gosub.toggled.connect(func(_pressed): _store_selected_controls())
	_find_target.pressed.connect(_request_direct_targets)
	_peek_target.pressed.connect(_peek_direct_target)
	_target_value.value_changed.connect(func(_value): _store_selected_controls())
	_target_search.text_submitted.connect(func(_text): _request_targets())
	_target_results.item_activated.connect(_accept_target)
	_technical_toggle.toggled.connect(func(pressed): _technical.visible = pressed)
	%SemanticCodeHelp.pressed.connect(_open_code_help)
	_move_up.pressed.connect(func(): _move_selected(-1))
	_move_down.pressed.connect(func(): _move_selected(1))
	_duplicate.pressed.connect(_duplicate_step)
	_clear.pressed.connect(_clear_step)
	_render_steps()


func set_catalog(page: Dictionary) -> void:
	_definitions = (page.get("items", []) as Array).duplicate(true)
	invalidate_action_picker()
	_definitions_by_identity.clear()
	for value in _definitions:
		var definition := value as Dictionary
		_definitions_by_identity[str(definition.get("identity", ""))] = definition
	_forms.clear()
	for value in page.get("forms", []) as Array:
		var form := value as Dictionary
		_forms[str(form.get("identity", ""))] = form
	_render_action_picker()
	_render_steps()


func set_document(identity: String, steps: Array, context: Dictionary = {}) -> void:
	invalidate_action_picker()
	_updating = true
	var kept_slot := _selected_slot if identity == _identity else 0
	_identity = identity
	_context = context.duplicate(true)
	_imported_context.visible = str(_context.get("scriptKind", "")) == "extra-action-point"
	_settings_origins.clear()
	_target_field_box.hide()
	_clear_form()
	_draft_steps = _drafts_from_projection(steps)
	_baseline_steps = _ordered_drafts()
	_selected_slot = clampi(kept_slot, 0, 7)
	_form_description.clear()
	_updating = false
	_render_steps()
	_select_slot(_selected_slot, false, false)
	call_deferred("_request_document_description", _identity, _selected_slot, _describe_generation)


func _request_document_description(identity: String, slot: int, generation: int) -> void:
	if identity != _identity or slot != _selected_slot or generation != _describe_generation: return
	_request_description()


func clear_document() -> void:
	invalidate_action_picker()
	_identity = ""
	_imported_context.hide()
	_draft_steps.clear()
	_settings_origins.clear()
	_baseline_steps.clear()
	_selected_slot = 0
	_form_description.clear()
	_render_steps()
	_render_editor()


func set_form_description(description: Dictionary, request_id: int) -> void:
	var slot := _description_slot(request_id)
	if slot < 0: return
	var action := description.get("action", {}) as Dictionary
	if str(action.get("identity", "")) != str(_draft_steps[slot].actionIdentity): return
	_draft_steps[slot]["authoringProjection"] = description.get("authoring", {}).duplicate(true)
	_draft_steps[slot]["descriptionPending"] = false
	if slot != _selected_slot:
		validation_changed.emit(); return
	var focused_field := _focused_field_key()
	_form_description = description.duplicate(true)
	_description.text = str((description.get("action", {}) as Dictionary).get("description", ""))
	if not bool(description.get("available", true)):
		_description.text += "\n" + str(description.get("availabilityReason", "Unavailable in this script."))
	_action_button.tooltip_text = _description.text
	_render_semantic_form()
	_render_outcome_summary()
	_render_technical()
	if not focused_field.is_empty(): call_deferred("_restore_field_focus", focused_field)
	validation_changed.emit()


func _description_slot(request_id: int) -> int:
	for slot in _draft_steps:
		if int(_draft_steps[slot].get("descriptionRequest", -1)) == request_id: return int(slot)
	return -1


func _focused_field_key() -> String:
	var owner := get_viewport().gui_get_focus_owner()
	for key in _field_controls:
		var control := (_field_controls[key] as Dictionary).control as Control
		if owner == control or (control is SpinBox and owner == (control as SpinBox).get_line_edit()):
			return str(key)
	return ""


func _restore_field_focus(key: String) -> void:
	if not _field_controls.has(key): return
	var control := (_field_controls[key] as Dictionary).control as Control
	if not control.is_visible_in_tree(): return
	if control is SpinBox: (control as SpinBox).get_line_edit().grab_focus()
	else: control.grab_focus()


func review_settings_change(impact: Dictionary) -> String:
	return await _impact_dialog.review(impact)


func set_target_page(page: Dictionary) -> void:
	if int(page.get("requestGeneration", -1)) != _target_generation: return
	_target_results.clear()
	var atlas := page.get("mapTileAtlas", {}) as Dictionary
	for value in page.get("items", []) as Array:
		var item := value as Dictionary
		var preview := str(item.get("detail", ""))
		var label := str(item.get("label", "Unnamed"))
		var index := _target_results.add_item(label if preview.is_empty() else "%s  —  %s" % [label, preview])
		_target_results.set_item_metadata(index, item)
		_target_results.set_item_tooltip(index, preview)
		var icon := _map_tile_target_icon(str(item.get("preview", "")), atlas)
		if icon != null: _target_results.set_item_icon(index, icon)
	_target_panel.visible = true
	_target_search.grab_focus()


func _map_tile_target_icon(preview: String, atlas: Dictionary) -> Texture2D:
	if preview.begins_with("cicn:"):
		var resource_id := int(preview.trim_prefix("cicn:"))
		for candidate in atlas.get("overlays", []) as Array:
			var overlay := candidate as Dictionary
			if int(overlay.get("resourceId", 0)) == resource_id:
				return _texture_from_png_base64(str(overlay.get("base64", "")))
		return null
	if not preview.begins_with("terrain:") or not bool(atlas.get("available", false)): return null
	var tile := int(preview.trim_prefix("terrain:"))
	var columns := int(atlas.get("columns", 0))
	var width := int(atlas.get("tileWidth", 0))
	var height := int(atlas.get("tileHeight", 0))
	if tile <= 0 or columns <= 0 or width <= 0 or height <= 0: return null
	var texture := _texture_from_png_base64(str(atlas.get("base64", "")))
	if texture == null: return null
	var image := texture.get_image()
	var cell := Image.create(width, height, false, Image.FORMAT_RGBA8)
	var source := Vector2i((tile - 1) % columns * width, (tile - 1) / columns * height)
	if source.x + width > image.get_width() or source.y + height > image.get_height(): return null
	cell.blit_rect(image, Rect2i(source, Vector2i(width, height)), Vector2i.ZERO)
	return ImageTexture.create_from_image(cell)


func _texture_from_png_base64(encoded: String) -> ImageTexture:
	if encoded.is_empty(): return null
	var image := Image.new()
	if image.load_png_from_buffer(Marshalls.base64_to_raw(encoded)) != OK: return null
	return ImageTexture.create_from_image(image)


func focus_slot(slot: int) -> bool:
	if slot < 0 or slot > 7: return false
	_select_slot(slot)
	_step_list.select(_selected_slot)
	return _selected_slot == slot


func focus_source_target(slot: int, field := "") -> bool:
	if not focus_slot(slot): return false
	var deadline := Time.get_ticks_msec() + 10000
	while _form_description.is_empty() and _selected_slot == slot:
		if Time.get_ticks_msec() >= deadline: return false
		await Engine.get_main_loop().process_frame
	if _selected_slot != slot: return false
	var key := field.get_slice(".", field.get_slice_count(".") - 1)
	if _field_controls.has(key): _restore_field_focus(key); return true
	return focus_target()


func focus_target() -> bool:
	var control := draft_focus_control()
	if control != null:
		control.grab_focus()
		return true
	return false


func draft_focus_control() -> Control:
	if _target_value.is_visible_in_tree(): return _target_value.get_line_edit()
	var direct := _field_controls.get("targetNativeId", {}) as Dictionary
	if not direct.is_empty() and direct.control is SpinBox:
		return (direct.control as SpinBox).get_line_edit()
	for descriptor in _field_controls.values():
		var control := (descriptor as Dictionary).control as Control
		if control is SpinBox: return (control as SpinBox).get_line_edit()
		if control is Button: return control
	return null


func draft_steps() -> Array:
	_store_selected_controls()
	return _ordered_drafts()


func _ordered_drafts() -> Array:
	return DraftProjection.ordered(_draft_steps)


func read_state() -> Dictionary:
	return {"identity": _identity, "selectedSlot": _selected_slot, "steps": draft_steps()}


func read_navigation_state() -> Dictionary:
	var state := read_state()
	state["scroll"] = _editor_scroll.scroll_vertical
	return state


func restore_navigation_state(state: Dictionary) -> void:
	_select_slot(int(state.get("selectedSlot", _selected_slot)))
	_editor_scroll.scroll_vertical = int(state.get("scroll", 0))


func has_unapplied_changes() -> bool:
	var incomplete := false
	for draft in _draft_steps.values():
		if draft.has("authoringInput") and not draft_error_for_authoring().is_empty(): incomplete = true
	return incomplete or not preload("res://src/document_value_equality.gd").equal(draft_steps(), _baseline_steps)


func accept_saved_draft(record_draft: Dictionary) -> void:
	invalidate_action_picker()
	_baseline_steps = (record_draft.get("steps", []) as Array).duplicate(true)


func discard_draft() -> void:
	invalidate_action_picker()
	_draft_steps.clear()
	for value in _baseline_steps:
		var step := (value as Dictionary).duplicate(true)
		_draft_steps[int(step.get("slot", 0))] = step
	_form_description.clear()
	_render_steps()
	_select_slot(_selected_slot, true, false)


func draft_error() -> Dictionary:
	if _identity.is_empty():
		return preload("res://src/editor_draft_apply.gd").failure("Choose a script record before editing steps.", _step_list)
	var authoring_error := draft_error_for_authoring()
	if not authoring_error.is_empty(): return authoring_error
	for step in draft_steps():
		var draft := step as Dictionary
		var target := int(draft.get("targetNativeId", 0))
		if target < -32768 or target > 32767:
			var target_control := draft_focus_control() if int(draft.slot) == _selected_slot else _step_list as Control
			return preload("res://src/editor_draft_apply.gd").failure("Target must be between -32768 and 32767.", target_control)
		var definition := _definitions_by_identity.get(str(draft.get("actionIdentity", "")), {}) as Dictionary
		if definition.is_empty():
			return preload("res://src/editor_draft_apply.gd").failure("A selected action is no longer in the authoring catalog.", _action_button)
		if not _optional_text(definition.get("formId")).is_empty() and not draft.has("settings"):
			return preload("res://src/editor_draft_apply.gd").failure("Complete the settings for step %d." % (int(draft.slot) + 1), _form)
	if int(_form_description.get("unresolvedFieldCount", 0)) > 0:
		return preload("res://src/editor_draft_apply.gd").failure("This action has unresolved field meaning and is read-only.", _form)
	if not _form_description.is_empty() and not bool(_form_description.get("available", true)):
		return preload("res://src/editor_draft_apply.gd").failure(
			str(_form_description.get("availabilityReason", "This action is unavailable in the current script.")), _action_button)
	return {}


func draft_error_for_authoring() -> Dictionary:
	for slot in _draft_steps:
		var draft := _draft_steps[slot] as Dictionary
		if bool(draft.get("descriptionPending", false)):
			return preload("res://src/editor_draft_apply.gd").failure("Wait for the updated action choices before applying.", _form)
		var errors := (draft.get("authoringProjection", {}) as Dictionary).get("errors", []) as Array
		if not errors.is_empty():
			return preload("res://src/editor_draft_apply.gd").failure("Step %d: %s" % [int(slot) + 1, str(errors[0])], _form)
	return {}


func _drafts_from_projection(steps: Array) -> Dictionary:
	var projection := DraftProjection.from_steps(steps, _forms)
	_settings_origins = projection.settingsOrigins
	return projection.drafts


func _select_slot(index: int, describe := true, store_current := true) -> void:
	if _updating: return
	invalidate_action_picker()
	if store_current: _store_selected_controls()
	_selected_slot = clampi(index, 0, 7)
	_form_description.clear()
	_render_action_picker()
	_render_editor()
	if describe: _request_description()


func _select_action(identity: String) -> void:
	if _updating or identity == _selected_action_identity(): return
	_store_selected_controls()
	if identity == "realmz.action.0":
		_draft_steps.erase(_selected_slot)
	else:
		var previous := _current_draft()
		var draft := {"slot": _selected_slot, "actionIdentity": identity, "gosub": false,
			"targetNativeId": int(previous.get("targetNativeId", 0))}
		var form_id := _optional_text((_definitions_by_identity.get(identity, {}) as Dictionary).get("formId"))
		if not form_id.is_empty():
			draft["settings"] = DraftProjection.new_settings(form_id, _forms)
		_draft_steps[_selected_slot] = draft
	_form_description.clear()
	_render_steps()
	_render_editor()
	_request_description()


func _render_steps() -> void:
	if _step_list == null: return
	_step_list.clear()
	for slot in range(8):
		var draft := _draft_for_slot(slot)
		var definition := _definition_for_draft(draft)
		var occupied := not draft.is_empty()
		var label := StepPresentation.action_label(definition) if occupied else "Empty step"
		var detail := _step_detail(draft, definition) if occupied else "Choose an action"
		_step_list.add_item("%d  %s\n    %s" % [slot + 1, label, detail])
		_step_list.set_item_metadata(slot, {"slot": slot, "category": definition.get("category", "Empty")})
		_step_list.set_item_semantic_color(slot, ProvidenceActionStepList.semantic_color(definition))
	_summary.text = "%d OF 8 USED  ·  ORDERED STEPS" % _draft_steps.size()
	if _step_list.item_count > _selected_slot: _step_list.select(_selected_slot)


func _render_action_picker() -> void:
	if _action_name == null: return
	_action_name.text = StepPresentation.action_label(_definition_for_draft(_current_draft()), "Empty Step")
	_action_button.disabled = _identity.is_empty() or _definitions.is_empty()


func _render_editor() -> void:
	if _description == null: return
	_target_generation += 1
	var draft := _current_draft()
	var definition := _definition_for_draft(draft)
	_gosub_applicable = bool(definition.get("gosubApplicable", false)) and not draft.is_empty()
	StepPresentation.apply_semantic_style(_editor_panel, _gosub, _settings_heading, definition, not draft.is_empty(), _gosub_applicable)
	_heading.text = "STEP %d  |  %s" % [_selected_slot + 1, StepPresentation.action_label(definition)]
	_action_button.tooltip_text = str(definition.get("description", "Choose an action for this step."))
	_description.visible = not _form_description.is_empty() and not bool(_form_description.get("available", true))
	_description.text = str(_form_description.get("availabilityReason", "Unavailable in this script.")) if _description.visible else ""
	_render_action_picker()
	_updating = true
	_gosub.disabled = true
	_gosub.button_pressed = bool(draft.get("gosub", false)) if _gosub_applicable else false
	_target_value.value = int(draft.get("targetNativeId", 0))
	_updating = false
	_target_field_box.hide()
	_clear_form()
	_target_panel.hide()
	_render_technical()
	_move_up.disabled = _selected_slot == 0 or draft.is_empty()
	_move_down.disabled = _selected_slot == 7 or draft.is_empty()
	_duplicate.disabled = draft.is_empty() or _first_empty_slot() < 0
	_clear.disabled = draft.is_empty()
	validation_changed.emit()


func _request_description() -> void:
	_target_generation += 1
	_target_results.clear()
	_target_panel.hide()
	var draft := _current_draft()
	if draft.is_empty() or _definitions_by_identity.is_empty(): return
	var target := int(draft.get("targetNativeId", 0))
	if target < -32768 or target > 32767: return
	_describe_generation += 1
	var settings := _dictionary(draft.get("settings"))
	_draft_steps[_selected_slot]["descriptionPending"] = true
	_draft_steps[_selected_slot]["descriptionRequest"] = _describe_generation
	validation_changed.emit()
	form_describe_requested.emit({"actionIdentity": str(draft.actionIdentity),
		"targetNativeId": target,
		"values": _dictionary(settings.get("values")),
		"secondaryValues": _dictionary(settings.get("secondaryValues")),
		"context": {"targetContext": {"mapIdentity": _context.get("mapIdentity"), "levelType": _context.get("levelType")},
			"scriptKind": _context.get("scriptKind"), "authoring": draft.get("authoringInput", {})}}, _describe_generation, _selected_slot)


func _render_semantic_form() -> void:
	_clear_form()
	_field_renderer.render(_form, _form_description)
	_field_controls = _field_renderer.controls
	StepPresentation.configure_gosub(_gosub, _gosub_applicable, _form_description)
	_settings_heading.visible = _form.get_child_count() > 0
	_store_selected_controls()


func _render_outcome_summary() -> void:
	var draft := _current_draft()
	var definition := _definition_for_draft(draft)
	var summary := StepPresentation.outcome_summary(draft, definition, _form_description)
	_preview.text = str(summary.get("preview", ""))
	_default.text = str(summary.get("default", ""))
	_preview.visible = not _preview.text.is_empty()
	_default.visible = not _default.text.is_empty()


func _on_semantic_value_changed() -> void:
	if _updating: return
	_store_selected_controls()
	_request_description()


func _on_field_changed(key: String, value: int, binding: String) -> void:
	if _updating or not _draft_steps.has(_selected_slot): return
	if binding in ["authoring-mode", "authoring-selection"]:
		var draft := _draft_steps[_selected_slot] as Dictionary
		var input := (draft.get("authoringInput", {}) as Dictionary).duplicate(true)
		var category := "modes" if binding == "authoring-mode" else "selections"
		var entries := (input.get(category, {}) as Dictionary).duplicate(true)
		entries[key] = value
		input[category] = entries
		draft["authoringInput"] = input
	_on_semantic_value_changed()


func _store_selected_controls() -> void:
	if _updating or not _draft_steps.has(_selected_slot): return
	var draft := (_draft_steps[_selected_slot] as Dictionary).duplicate(true)
	if _gosub_applicable:
		draft["gosub"] = _gosub.button_pressed
	if _target_field_box.visible: draft["targetNativeId"] = int(_target_value.value)
	for key in _field_controls:
		var descriptor := _field_controls[key] as Dictionary
		if descriptor.row == "action":
			draft["targetNativeId"] = _control_value(descriptor.control)
	if draft.has("settings"):
		var settings := _dictionary(draft.get("settings")).duplicate(true)
		var primary := _dictionary(settings.get("values")).duplicate(true)
		var secondary := _dictionary(settings.get("secondaryValues")).duplicate(true)
		for key in _field_controls:
			var descriptor := _field_controls[key] as Dictionary
			if descriptor.row == "primary":
				primary[key] = _control_value(descriptor.control)
			elif descriptor.row == "secondary":
				secondary[key] = _control_value(descriptor.control)
		settings["values"] = primary
		if not secondary.is_empty() or settings.has("secondaryValues"): settings["secondaryValues"] = secondary
		draft["settings"] = settings
	_draft_steps[_selected_slot] = draft
	_render_steps()


func _request_direct_targets() -> void:
	_target_field = ""
	_target_panel.set_meta("target_kind", _optional_text(_target_field_box.get_meta("target_kind", "")))
	_target_search.text = ""
	_request_targets()


func _request_field_targets(key: String, kind: String) -> void:
	_target_field = key
	_target_panel.set_meta("target_kind", kind)
	_target_search.text = ""
	_request_targets()


func _request_targets() -> void:
	var kind := _optional_text(_target_panel.get_meta("target_kind", ""))
	if kind.is_empty(): return
	_target_generation += 1
	var context: Dictionary = _field_controls.get(_target_field, {}).get("field", {}).get("targetContext", _context)
	target_search_requested.emit({"kind": kind, "search": _target_search.text, "limit": 40, "context": context, "requestGeneration": _target_generation})


func _accept_target(index: int) -> void:
	if index < 0: return
	var item := _target_results.get_item_metadata(index) as Dictionary
	var value := int(item.get("value", 0))
	if _target_field.is_empty():
		_target_value.value = value
	elif _field_controls.has(_target_field):
		_field_renderer.accept_target(_target_field, value)
	_target_panel.hide()


func _peek_direct_target() -> void:
	var kind := _optional_text(_target_field_box.get_meta("target_kind", ""))
	if not kind.is_empty(): peek_requested.emit(kind, int(_target_value.value), "", _context)


func _move_selected(direction: int) -> void:
	invalidate_action_picker()
	_store_selected_controls()
	var destination := _selected_slot + direction
	if destination < 0 or destination > 7 or not _draft_steps.has(_selected_slot): return
	var moving := (_draft_steps[_selected_slot] as Dictionary).duplicate(true)
	var displaced := (_draft_steps[destination] as Dictionary).duplicate(true) if _draft_steps.has(destination) else {}
	_draft_steps.erase(_selected_slot)
	_draft_steps.erase(destination)
	moving["slot"] = destination
	_draft_steps[destination] = moving
	if not displaced.is_empty():
		displaced["slot"] = _selected_slot
		_draft_steps[_selected_slot] = displaced
	_selected_slot = destination
	_form_description.clear()
	_render_steps()
	_render_editor()
	_request_description()


func _duplicate_step() -> void:
	invalidate_action_picker()
	_store_selected_controls()
	var destination := _first_empty_slot()
	if destination < 0 or not _draft_steps.has(_selected_slot): return
	var duplicate := (_draft_steps[_selected_slot] as Dictionary).duplicate(true)
	duplicate["slot"] = destination
	if duplicate.has("settings"):
		var settings := _dictionary(duplicate.settings).duplicate(true)
		settings["scope"] = {"mode": "preserve-references"}
		duplicate["settings"] = settings
	_draft_steps[destination] = duplicate
	_selected_slot = destination
	_form_description.clear()
	_render_steps()
	_render_editor()
	_request_description()


func _clear_step() -> void:
	invalidate_action_picker()
	_draft_steps.erase(_selected_slot)
	_form_description.clear()
	_render_steps()
	_render_action_picker()
	_render_editor()


func _clear_form() -> void:
	for child in _form.get_children():
		_form.remove_child(child)
		child.queue_free()
	_field_controls.clear()
	_settings_heading.hide()
	if _preview != null: _preview.hide()
	if _default != null: _default.hide()


func _render_technical() -> void:
	var draft := _current_draft()
	_technical.text = StepPresentation.technical_text(draft, _definition_for_draft(draft), _form_description)


func invalidate_action_picker() -> void:
	_picker_generation += 1
	_picker_origin.clear()
	if not is_instance_valid(_action_picker): return
	if _picker_callback.is_valid() and _action_picker.action_selected.is_connected(_picker_callback):
		_action_picker.action_selected.disconnect(_picker_callback)
	_action_picker.close_helper(false)


func _picker_destination() -> Dictionary:
	return {"document": _identity, "slot": _selected_slot, "generation": _picker_generation,
		"kind": _context.get("scriptKind", ""), "result": _context.get("encounterResultIndex", -1)}


func _open_action_picker() -> void:
	if _identity.is_empty() or _definitions.is_empty(): return
	invalidate_action_picker()
	_picker_origin = _picker_destination()
	_picker_callback = _accept_action_selection.bind(_picker_origin.duplicate(true))
	_action_picker.action_selected.connect(_picker_callback, CONNECT_ONE_SHOT)
	var kind := str(_context.get("scriptKind", ""))
	var label: String = {"action-point": "Action Point", "extra-action-point": "Extra Action Point",
		"simple-encounter": "Simple Encounter", "complex-encounter": "Complex Encounter"}.get(kind, "Script")
	var destination := "%s %s" % [label, _identity.get_slice(":", _identity.get_slice_count(":") - 1)]
	if _context.has("encounterResultIndex"): destination += " · Result %d" % (int(_context.encounterResultIndex) + 1)
	destination += " · Step %d" % (_selected_slot + 1)
	_action_picker.open_for_selection(_definitions, kind, _selected_action_identity(), destination, _action_button)


func _accept_action_selection(identity: String, origin: Dictionary) -> void:
	if _picker_origin.is_empty() or origin != _picker_destination(): return
	_picker_origin.clear()
	var definition := _definitions_by_identity.get(identity, {}) as Dictionary
	var available := (definition.get("availabilityByScriptKind", {}) as Dictionary).get(str(_context.get("scriptKind", "")), {}) as Dictionary
	if not bool(available.get("available", false)): return
	_select_action(identity)


func _exit_tree() -> void:
	invalidate_action_picker()

func _open_code_help() -> void:
	var definition := _definition_for_draft(_current_draft())
	help_requested.emit(abs(int(definition.get("opcode", 0))), %SemanticCodeHelp)


func _step_detail(draft: Dictionary, definition: Dictionary) -> String:
	return StepPresentation.step_detail(draft, definition)


func _first_empty_slot() -> int:
	for slot in range(8):
		if not _draft_steps.has(slot): return slot
	return -1


func _current_draft() -> Dictionary:
	return _draft_for_slot(_selected_slot)


func _draft_for_slot(slot: int) -> Dictionary:
	return _draft_steps.get(slot, {}) as Dictionary


func _selected_action_identity() -> String:
	return str(_current_draft().get("actionIdentity", "realmz.action.0"))


func _definition_for_draft(draft: Dictionary) -> Dictionary:
	return _definitions_by_identity.get(str(draft.get("actionIdentity", "realmz.action.0")), {}) as Dictionary


func _control_value(control: Control) -> int:
	return ProvidenceActionFieldRenderer.value_of(control)


func _optional_text(value: Variant) -> String:
	return "" if value == null else str(value)


func _dictionary(value: Variant) -> Dictionary:
	return value as Dictionary if value is Dictionary else {}
