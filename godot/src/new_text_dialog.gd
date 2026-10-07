extends Window

signal created(projection: Dictionary, identity: String)

var _bridge
var _revision := 0
var _version := 0
var _busy := false
var _checking := false
var _stale := false
var _uncertain := false
var _available := false
var _valid := false
var _style_identity := ""
var _error_index := -1
var _pending_navigation: Callable
var _body_font := SystemFont.new()
var _operations: ProvidenceEditorOperation
var _generation := 0
var _style_valid := true

var editor: TextEdit:
	get: return %StyleWorkbench.editor


func configure_operations(operations: ProvidenceEditorOperation) -> void:
	_operations = operations
	if not operations.completed.is_connected(_operation_completed): operations.completed.connect(_operation_completed)


func _operation_completed(_response: Dictionary) -> void:
	if visible and not _busy and not _checking and not _valid: %ValidationTimer.start()


func discard_draft() -> void:
	_generation += 1
	_bridge = null
	hide()
	%ValidationTimer.stop()
	for dialog: Window in [%Discard, %ReplaceDraft, %FilePicker]: dialog.hide()
	_pending_navigation = Callable()


func _run(label: String, workflow: Callable) -> Dictionary:
	var generation := _generation
	var response: Dictionary
	if _operations == null:
		response = await workflow.call(_bridge.request)
	else:
		response = await _operations.run_workflow(_bridge, label, func(operation): return await workflow.call(operation.request))
	if generation != _generation: return {"ok": false, "discarded": true}
	return response


func _ready() -> void:
	apply_theme()
	visibility_changed.connect(func():
		if not visible: %StyleWorkbench.cancel_pending())
	close_requested.connect(request_cancel)
	%Cancel.pressed.connect(request_cancel)
	%Create.pressed.connect(create_text)
	%LoadFile.pressed.connect(request_load)
	%FilePicker.file_selected.connect(load_file)
	%FilePicker.canceled.connect(func(): editor.grab_focus())
	%TextName.text_changed.connect(func(_value): draft_changed())
	%Number.text_changed.connect(func(_value): draft_changed())
	%StyleWorkbench.draft_changed.connect(draft_changed)
	%StyleWorkbench.inspect_handler = _inspect_styles
	%StyleWorkbench.validation_changed.connect(func(valid, message): _style_valid = valid; %Outcome.text = message; _update_actions())
	%PreserveStyle.toggled.connect(func(_pressed): _update_actions())
	%ValidationTimer.timeout.connect(validate_now)
	%SelectCharacter.pressed.connect(_select_error)
	%CheckAgain.pressed.connect(recheck)
	%Discard.confirmed.connect(_discard)
	%Discard.canceled.connect(func(): _pending_navigation = Callable(); editor.grab_focus())
	%ReplaceDraft.confirmed.connect(_open_picker)
	%ReplaceDraft.canceled.connect(func(): editor.grab_focus())
	%Discard.get_cancel_button().text = "Keep Editing"
	%Discard.get_ok_button().text = "Discard Draft"
	%ReplaceDraft.get_cancel_button().text = "Keep Draft"
	%ReplaceDraft.get_ok_button().text = "Load File…"


func apply_theme(mode := "dark", density := "balanced") -> void:
	var controls = preload("res://theme/scenario_control_theme.gd").new()
	controls.mode = mode
	controls.density = density
	theme = controls
	$Background.add_theme_stylebox_override("panel", controls.get_stylebox("panel", "PanelContainer"))
	_body_font.font_names = PackedStringArray(["Source Sans 3", "Segoe UI"])
	%StyleWorkbench.get_node("%AuthorPreview").add_theme_font_override("normal_font", _body_font)
	for control: Control in [editor, %DraftStatus, %NameError, %Availability, %FileStatus, %Outcome, %PreserveStyle]:
		control.add_theme_font_override("font", _body_font)
	for side in ["margin_left", "margin_top", "margin_right", "margin_bottom"]:
		$Inset.add_theme_constant_override(side, 20 if density == "compact" else 24)
	%Editor.add_theme_constant_override("separation", 6 if density == "compact" else 8)
	%Create.add_theme_stylebox_override("normal", controls.get_stylebox("pressed", "Button"))


func open_new(bridge) -> Dictionary:
	if visible or _busy or bridge == null or not bridge.is_project_backed():
		return {"ok": false, "error": "Open a scenario project and finish the current draft first."}
	_bridge = bridge
	_busy = true
	var response := await _run("Open new text draft", func(request): return await request.call("session.describe"))
	_busy = false
	if not response.get("ok", false): return response
	_bridge = bridge
	_revision = int(response.get("result", {}).get("revision", 0))
	_stale = false
	_uncertain = false
	_busy = false
	_checking = false
	_pending_navigation = Callable()
	%TextName.text = "New scrolling text"
	%Number.text = ""
	%StyleWorkbench.reset_document("")
	_style_valid = true
	%FileStatus.text = "Or type directly below. File limit: 1 MiB."
	%FileStatus.theme_type_variation = "ScenarioSecondary"
	%Create.text = "Create Text"
	%DraftStatus.text = "Unapplied draft"
	draft_changed()
	popup_centered(Vector2i(1240, 780))
	%Number.grab_focus()
	return {"ok": true}


func has_unapplied_changes() -> bool:
	return visible and (not editor.text.is_empty() or not %Number.text.is_empty() or %TextName.text != "New scrolling text")


func draft_changed() -> void:
	_version += 1
	_valid = false
	_available = false
	_style_identity = ""
	%PreserveStyle.set_pressed_no_signal(false)
	%PreserveStyle.hide()
	%NameError.hide()
	_error_index = -1
	%SelectCharacter.hide()
	%Create.text = "Create Text"
	if not _stale and not _uncertain:
		%Availability.text = "Checking draft…"
		%Availability.theme_type_variation = "ScenarioSecondary"
		%Outcome.text = ""
		%Outcome.theme_type_variation = "ScenarioSecondary"
		%ValidationTimer.start()
	_update_actions()


func validate_now() -> void:
	%ValidationTimer.stop()
	if _bridge == null or not visible or _busy or _checking or _stale or _uncertain: return
	if _operations != null and _operations.busy:
		%ValidationTimer.start()
		return
	_checking = true
	var version := _version
	var params := {"expectedRevision": _revision, "label": %TextName.text, "text": editor.text}
	var number: String = %Number.text.strip_edges()
	_update_actions()
	var response := await _run("Check text draft", func(request): return await _validate_draft(request, params, number))
	_checking = false
	if response.get("discarded", false) or not visible: return
	if version != _version:
		%ValidationTimer.start()
		return
	if not response.get("ok", false):
		_handle_error(response)
		return
	var result: Dictionary = response.get("result", {})
	_valid = bool(result.get("valid", false))
	%NameError.text = str(result.nameError) if result.get("nameError") != null else ""
	%NameError.visible = not %NameError.text.is_empty()
	_show_text_error(str(result.textError) if result.get("textError") != null else "")
	_show_number(number, response.get("number", {}))
	_update_actions()


func _validate_draft(request: Callable, params: Dictionary, number: String) -> Dictionary:
	var response: Dictionary = await request.call("text-resource.validate-draft", params)
	if not response.get("ok", false) or not _valid_number(number): return response
	var checked: Dictionary = await request.call("text-resource.check-number", {"expectedRevision": params.expectedRevision, "resourceId": int(number)})
	if not checked.get("ok", false): return checked
	response["number"] = checked.get("result", {})
	return response


func _valid_number(value: String) -> bool:
	return value.is_valid_int() and int(value) != 0 and int(value) >= -32768 and int(value) <= 32767


func _show_number(value: String, result: Dictionary) -> void:
	_available = false
	if not _valid_number(value):
		%Availability.text = "Unused number required: −32768 to 32767, excluding 0."
		%Availability.theme_type_variation = "ScenarioSecondary"
		return
	_available = bool(result.get("available", false))
	%Availability.theme_type_variation = "ScenarioSecondary" if _available else "ScenarioDiagnostic"
	%Availability.text = "Number %d is available — no existing formatting" % int(value) if _available else str(result.get("reason", "Choose another text number."))
	var style: Variant = result.get("styleCompanion")
	_style_identity = str(style.identity) if style is Dictionary else ""
	%PreserveStyle.visible = not _style_identity.is_empty()
	if not _style_identity.is_empty():
		%Availability.text = "Number %d has formatting but no text." % int(value)
		%PreserveStyle.text = "Keep existing formatting for Text %d" % int(value)
		if _valid: %Outcome.text = "Creating this text will pair it with that formatting, unchanged.\nCreate does not Save. Undo can remove the new text."


func _show_text_error(error: String) -> void:
	_error_index = -1
	%SelectCharacter.hide()
	if error.is_empty(): return
	%Outcome.text = error
	%Outcome.theme_type_variation = "ScenarioDiagnostic"
	var matcher := RegEx.new()
	matcher.compile("at character index ([0-9]+) is not representable")
	var matched := matcher.search(error)
	if matched:
		_error_index = int(matched.get_string(1))
		var lines: PackedStringArray = editor.text.left(_error_index).split("\n")
		%Outcome.text = "Line %d, column %d: %s cannot be stored in Classic text.\nReplace it to create this resource; your draft is kept." % [lines.size(), lines[-1].length() + 1, editor.text.substr(_error_index, 1)]
		%SelectCharacter.show()


func _update_actions() -> void:
	%Create.disabled = _busy or _checking or not _available or not _valid or not _style_valid or _stale or _uncertain or (not _style_identity.is_empty() and not %PreserveStyle.button_pressed)
	%TextName.editable = not _busy and not _uncertain
	%Number.editable = not _busy and not _uncertain
	%StyleWorkbench.set_locked(_busy or _uncertain)
	for button: Button in [%LoadFile, %Cancel, %PreserveStyle, %SelectCharacter, %CheckAgain]:
		button.disabled = _busy or _uncertain
	%CheckAgain.visible = _stale or _uncertain
	%CheckAgain.text = "Reopen project required" if _uncertain else "Check Again"
	%CheckAgain.tooltip_text = "Reopen this project to read the durable outcome. This draft is retained; creation is never retried automatically." if _uncertain else "Check the current revision without creating text."
	var controls: Array[Control] = [%TextName, %Number, %LoadFile, editor]
	for control: Control in [%SelectCharacter, %PreserveStyle, %CheckAgain, %Cancel, %Create]:
		if control.visible and not control.disabled: controls.append(control)
	for index in controls.size():
		controls[index].focus_next = controls[(index + 1) % controls.size()].get_path()
		controls[index].focus_previous = controls[(index - 1 + controls.size()) % controls.size()].get_path()


func request_load() -> void:
	if _busy or _uncertain: return
	if not editor.text.is_empty():
		%ReplaceDraft.popup_centered(Vector2i(540, 180))
		%ReplaceDraft.get_cancel_button().grab_focus()
	else:
		_open_picker()


func _open_picker() -> void:
	%FilePicker.popup_centered(Vector2i(800, 600))


func load_file(path: String) -> void:
	if _busy or _checking or _uncertain: return
	_busy = true
	%FileStatus.text = "Loading UTF-8 file…"
	_update_actions()
	var params := {"expectedRevision": _revision, "path": path}
	var response := await _run("Load text file", func(request): return await request.call("text-resource.prepare-import", params))
	_busy = false
	if response.get("discarded", false): return
	if not response.get("ok", false):
		%FileStatus.text = str(response.get("error", "The file could not be loaded.")) + " Current draft unchanged."
		%FileStatus.theme_type_variation = "ScenarioDiagnostic"
		if str(response.get("error", "")).begins_with("revision conflict:"): _handle_error(response)
		_update_actions()
		return
	var result: Dictionary = response.get("result", {})
	editor.text = str(result.get("text", ""))
	editor.text_changed.emit()
	editor.scroll_vertical = 0
	editor.set_caret_line(0)
	editor.set_caret_column(0)
	%FileStatus.text = path.get_file() + " · UTF-8 loaded"
	if result.get("lineEndingsNormalized", false): %FileStatus.text += "\nLine endings normalized"
	if result.get("bomRemoved", false): %FileStatus.text += " · initial BOM removed"
	%FileStatus.theme_type_variation = "ScenarioSecondary"
	draft_changed()
	await validate_now()
	editor.grab_focus()


func create_text() -> void:
	if %Create.disabled or _busy: return
	_busy = true
	%DraftStatus.text = "Creating text…"
	_update_actions()
	await get_tree().process_frame
	if not visible or _bridge == null:
		_busy = false
		return
	var params := {"expectedRevision": _revision, "resourceId": int(%Number.text), "label": %TextName.text, "text": editor.text, "edits": %StyleWorkbench.edits()}
	if not _style_identity.is_empty(): params["preserveStyleIdentity"] = _style_identity
	var response := await _run("Create text", func(request): return await request.call("text-resource.create", params))
	_busy = false
	if response.get("discarded", false): return
	if response.get("ok", false):
		hide()
		created.emit(response.get("result", {}), str(response.get("result", {}).get("identity", "")))
	else:
		_handle_error(response, true)


func _handle_error(response: Dictionary, attempted_create := false) -> void:
	var error := str(response.get("error", "The request could not be completed."))
	_stale = error.begins_with("revision conflict:")
	_uncertain = bool(response.get("outcomeUnknown", false))
	%Outcome.theme_type_variation = "ScenarioDiagnostic"
	%Outcome.text = error + "\nYour complete draft is kept."
	%DraftStatus.text = "Could not create · your draft is still here" if attempted_create else "Draft needs rechecking · your text is kept"
	if _uncertain: %DraftStatus.text = "Creation outcome unconfirmed · your draft is kept" if attempted_create else "Request outcome unconfirmed · your draft is kept"
	%Create.text = "Retry Create" if attempted_create else "Create Text"
	if _stale or _uncertain:
		_available = false
		%PreserveStyle.set_pressed_no_signal(false)
		%Availability.text = "The outcome is not confirmed. Reopen this project before making further changes." if _uncertain else "The project changed. Check this number again before creating."
		%Availability.theme_type_variation = "ScenarioDiagnostic"
		%Outcome.text = "Your complete draft is kept. Reopen this project to read the durable outcome; creation will not be retried automatically." if _uncertain else "Your draft is kept. Rechecking does not create or replace text.\nAny formatting acknowledgement must be reviewed again."
	_update_actions()


func recheck() -> void:
	if _busy or _checking or _uncertain: return
	_busy = true
	_update_actions()
	var response := await _run("Recheck text draft", func(request): return await request.call("session.describe"))
	_busy = false
	if response.get("discarded", false): return
	_update_actions()
	if not response.get("ok", false):
		%Outcome.text = "Could not recheck the project. Keep this draft open. " + str(response.get("error", ""))
		return
	_revision = int(response.get("result", {}).get("revision", 0))
	_stale = false
	_uncertain = false
	draft_changed()
	%StyleWorkbench.request_validation()
	await validate_now()


func request_cancel() -> void:
	request_navigation(Callable())


func request_navigation(action: Callable) -> void:
	if _busy or _uncertain: return
	_pending_navigation = action
	if has_unapplied_changes():
		%Discard.popup_centered(Vector2i(500, 170))
		%Discard.get_cancel_button().grab_focus()
	else:
		_discard()


func _discard() -> void:
	if _busy or _uncertain: return
	_generation += 1
	hide()
	%ValidationTimer.stop()
	var action := _pending_navigation
	_pending_navigation = Callable()
	if action.is_valid(): action.call()


func _input(event: InputEvent) -> void:
	if visible and not %Discard.visible and not %ReplaceDraft.visible and not %FilePicker.visible and event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_ESCAPE:
		get_viewport().set_input_as_handled()
		request_cancel()


func _select_error() -> void:
	if _error_index < 0 or _error_index >= editor.text.length(): return
	var lines: PackedStringArray = editor.text.left(_error_index).split("\n")
	var line := lines.size() - 1
	var column := lines[-1].length()
	editor.grab_focus()
	editor.set_caret_line(line)
	editor.set_caret_column(column)
	editor.select(line, column, line, column + 1)


func _inspect_styles(edits: Array) -> Dictionary:
	var generation := _generation
	while _busy or _checking or (_operations != null and _operations.busy):
		await get_tree().process_frame
		if generation != _generation or not visible: return {"ok":false,"discarded":true}
	if _bridge == null or _uncertain: return {"ok":false,"error":"Recheck the project before editing formatting."}
	return await _run("Check new text formatting",func(request): return await request.call("text-resource.inspect-new-styles",{"expectedRevision":_revision,"edits":edits}))
