extends Window

signal applied(projection: Dictionary, identity: String)

var _body_font: SystemFont
var _bridge
var _identity := ""
var _revision := 0
var _original := ""
var _original_label := ""
var _base_text_blob: Variant
var _base_style_blob: Variant
var _current_result: Dictionary = {}
var _preview_valid := true
var _return_focus: WeakRef
var _source_opener: Callable
var _preview_opener: Callable
var _resource_id := 0
var _uses: Array = []
var _uses_offset := 0
var _uses_total := 0

var editor: TextEdit:
	get: return %StyleWorkbench.editor
var _current_revision := 0
var _conflicted := false
var _error_index := -1
var _pending_navigation: Callable
var _draft_scroll := 0.0
var _operations: ProvidenceEditorOperation
var _busy := false
var _generation := 0
var _uncertain := false


func configure_operations(operations: ProvidenceEditorOperation) -> void:
	_operations = operations


func configure_link_actions(source_opener: Callable, preview_opener: Callable) -> void:
	_source_opener = source_opener
	_preview_opener = preview_opener


func discard_draft() -> void:
	_generation += 1
	_bridge = null
	_current_result.clear()
	hide()
	%Discard.hide()
	%UsesWindow.hide()
	%ReplaceDraft.hide()
	_pending_navigation = Callable()


func _request(method: String, params: Dictionary = {}) -> Dictionary:
	if _busy: return {"ok": false, "busy": true, "error": "Wait for the current text operation."}
	var generation := _generation
	_busy = true
	%StyleWorkbench.set_locked(true)
	%TextName.editable = false
	%Cancel.disabled = true
	var response: Dictionary
	if _operations == null:
		response = _bridge.request(method, params)
	else:
		response = await _operations.run_workflow(_bridge, "Update text" if method == "text-resource.apply-styles" else "Read text", func(operation): return await operation.request(method, params))
	_busy = false
	%StyleWorkbench.set_locked(_uncertain)
	%TextName.editable = not _uncertain
	%Cancel.disabled = _uncertain
	if generation != _generation: return {"ok": false, "discarded": true}
	return response


func _ready() -> void:
	apply_theme()
	visibility_changed.connect(func():
		if not visible:
			_generation += 1
			%StyleWorkbench.cancel_pending())
	close_requested.connect(request_cancel)
	%Cancel.pressed.connect(request_cancel)
	%Apply.pressed.connect(apply_text)
	%UsedBy.pressed.connect(_open_uses.bind(0))
	%RebuiltPreview.pressed.connect(func(): request_navigation(_preview_opener.bind(_resource_id)))
	%UsePrevious.pressed.connect(func(): _open_uses(maxi(0,_uses_offset-128)))
	%UseNext.pressed.connect(func(): _open_uses(_uses_offset+128))
	%CloseUses.pressed.connect(func(): %UsesWindow.hide(); %UsedBy.grab_focus())
	%UsesWindow.close_requested.connect(func(): %UsesWindow.hide(); %UsedBy.grab_focus())
	%UseList.item_activated.connect(_open_use)
	%OpenUse.pressed.connect(func():
		var selected: PackedInt32Array = %UseList.get_selected_items()
		if not selected.is_empty(): _open_use(selected[0]))
	editor.gui_input.connect(_draft_input)
	%StyleWorkbench.draft_changed.connect(_draft_changed)
	%StyleWorkbench.validation_changed.connect(_validation_changed)
	%StyleWorkbench.inspect_handler = _inspect_styles
	%TextName.text_changed.connect(func(_text): _draft_changed())
	%ReviewCurrent.pressed.connect(review_current)
	%KeepEditing.pressed.connect(_return_to_draft)
	%UseCurrent.pressed.connect(accept_current)
	%LoadSaved.pressed.connect(func(): %ReplaceDraft.popup_centered(Vector2i(520,180)))
	%ReplaceDraft.confirmed.connect(_load_saved_version)
	%SelectCharacter.pressed.connect(_select_error)
	%Discard.confirmed.connect(func():
		hide()
		_restore_focus()
		var action := _pending_navigation
		_pending_navigation = Callable()
		if action.is_valid(): action.call())
	%Discard.canceled.connect(func():
		_pending_navigation = Callable()
		editor.grab_focus())
	%Discard.add_button("Apply and Continue",false,"apply")
	%Discard.custom_action.connect(func(action): if action=="apply": _apply_and_continue())
	%Discard.get_cancel_button().text = "Keep Editing"
	%Discard.get_ok_button().text = "Discard Draft"
	%Discard.get_ok_button().focus_neighbor_left = %Discard.get_cancel_button().get_path()
	%Discard.get_cancel_button().focus_neighbor_right = %Discard.get_ok_button().get_path()
	editor.focus_next = %Cancel.get_path()
	%Cancel.focus_next = %Apply.get_path()
	%Apply.focus_next = editor.get_path()


func apply_theme(mode := "dark", density := "balanced") -> void:
	var controls = preload("res://theme/scenario_control_theme.gd").new()
	controls.mode = mode
	controls.density = density
	var story_controls = preload("res://src/story_text_theme.gd").new()
	story_controls.mode = mode
	story_controls.density = density
	theme = story_controls
	$Background.add_theme_stylebox_override("panel", controls.get_stylebox("panel", "PanelContainer"))
	if _body_font == null:
		_body_font = SystemFont.new()
		_body_font.font_names = PackedStringArray(["Source Sans 3", "Segoe UI"])
	%StyleWorkbench.get_node("%AuthorPreview").add_theme_font_override("normal_font", _body_font)
	for control: Control in [editor, %CurrentText, %RetainedText, %DraftStatus, %Outcome]:
		control.add_theme_font_override("font", _body_font)
	for side in ["margin_left", "margin_top", "margin_right", "margin_bottom"]:
		$Inset.add_theme_constant_override(side, 20 if density == "compact" else 24)
	%Editor.add_theme_constant_override("separation", 12 if density == "compact" else 16)
	%Apply.add_theme_stylebox_override("normal", controls.get_stylebox("pressed", "Button"))


func open_text(bridge, identity: String) -> Dictionary:
	if visible or _busy:
		return {"ok": false, "error": "Finish the current text draft before opening another."}
	_bridge = bridge
	var response := await _request("text-resource.open", {"identity": identity})
	if not response.get("ok", false):
		return response
	var result: Dictionary = response.get("result", {})
	if str(result.get("resource", {}).get("identity", "")) != identity or not result.get("text") is String:
		return {"ok": false, "error": "The selected text could not be opened. Reselect it and try again."}
	_bridge = bridge
	_identity = identity
	_revision = int(result.revision)
	_resource_id = int(result.resource.get("resourceId",0))
	_original = str(result.text)
	_original_label = str(result.resource.get("label", ""))
	_current_result.clear()
	_base_text_blob = result.get("textBlob")
	_base_style_blob = result.get("styleBlob")
	_preview_valid = bool(result.get("feedback", {}).get("valid", true))
	%TextName.text = _original_label
	_conflicted = false
	_uncertain = false
	_error_index = -1
	_pending_navigation = Callable()
	%Title.text = "Edit Text %d" % int(result.resource.get("resourceId", 0))
	%StyleWorkbench.reset_document(_original,result)
	editor.scroll_vertical = 0
	editor.set_caret_line(0)
	editor.set_caret_column(0)
	%Editor.show()
	%Comparison.hide()
	%ReviewCurrent.hide()
	%SelectCharacter.hide()
	%Outcome.text = "Apply updates this open project. Save keeps the change on disk."
	%Outcome.theme_type_variation = "ScenarioSecondary"
	%DraftStatus.text = "No unapplied draft · text and formatting apply together"
	%Apply.disabled = true
	%UsedBy.disabled = not _source_opener.is_valid()
	%RebuiltPreview.disabled = not _preview_opener.is_valid()
	_update_focus_order()
	_return_focus = weakref(get_viewport().gui_get_focus_owner()) if get_viewport().gui_get_focus_owner() != null else null
	popup_centered(Vector2i(1240, 760))
	editor.grab_focus()
	var issues: Array = result.get("feedback",{}).get("issues",[])
	if not issues.is_empty(): _show_encoding_issue(issues[0])
	return {"ok": true}


func has_unapplied_changes() -> bool:
	return visible and (editor.text != _original or %TextName.text != _original_label or %StyleWorkbench.has_formatting_changes())


func request_cancel() -> void:
	request_navigation(Callable())


func request_navigation(action: Callable) -> void:
	if _busy or _uncertain: return
	_pending_navigation = action
	if has_unapplied_changes():
		%Discard.popup_centered(Vector2i(480, 160))
		%Discard.get_cancel_button().grab_focus()
	else:
		hide()
		_restore_focus()
		_pending_navigation = Callable()
		if action.is_valid(): action.call()


func _draft_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_ENTER and event.ctrl_pressed:
			get_viewport().set_input_as_handled()
			apply_text()
		elif event.keycode == KEY_ESCAPE:
			get_viewport().set_input_as_handled()
			request_cancel()


func _input(event: InputEvent) -> void:
	if visible and not %Discard.visible and event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_ESCAPE:
		get_viewport().set_input_as_handled()
		request_cancel()


func _update_focus_order() -> void:
	var controls: Array[Control] = [editor]
	for recovery: Button in [%SelectCharacter, %ReviewCurrent]:
		if recovery.visible: controls.append(recovery)
	controls.append(%Cancel)
	if not %Apply.disabled: controls.append(%Apply)
	for index in controls.size():
		controls[index].focus_next = controls[(index + 1) % controls.size()].get_path()
		controls[index].focus_previous = controls[(index - 1 + controls.size()) % controls.size()].get_path()


func _draft_changed() -> void:
	%Apply.disabled = _busy or _conflicted or _uncertain or not _preview_valid or not has_unapplied_changes()
	%UsedBy.disabled = _busy or _uncertain or not _source_opener.is_valid()
	%RebuiltPreview.disabled = _busy or _uncertain or not _preview_opener.is_valid()
	%DraftStatus.text = "Unapplied draft · text and formatting apply together" if has_unapplied_changes() else "No unapplied draft · project save state unchanged"
	if _error_index >= 0:
		_error_index = -1
		%SelectCharacter.hide()
		%Outcome.text = "Draft changed. Apply again to check and update the project."
	_update_focus_order()


func apply_text() -> void:
	if %Apply.disabled or _bridge == null or _busy:
		return
	%DraftStatus.text = "Applying text…"
	var response := await _request("text-resource.apply-styles", {"identity": _identity, "expectedRevision": _revision, "edits": %StyleWorkbench.edits(), "label": %TextName.text})
	if response.get("discarded", false): return
	if response.get("ok", false):
		_original = editor.text
		hide()
		_restore_focus()
		applied.emit(response.get("result", {}), _identity)
		return
	var error := str(response.get("error", "The text could not be applied."))
	_conflicted = error.begins_with("revision conflict:")
	_uncertain = bool(response.get("outcomeUnknown", false))
	%StyleWorkbench.set_locked(_uncertain)
	%TextName.editable = not _uncertain
	%Cancel.disabled = _uncertain
	%Apply.disabled = _conflicted or _uncertain
	%ReviewCurrent.visible = _conflicted
	%DraftStatus.text = "Could not apply · your complete draft is still here"
	%Outcome.theme_type_variation = "ScenarioDiagnostic"
	%Outcome.text = "This text changed while you were editing. Review the current version before applying." if _conflicted else error + "\nNothing was applied. Your draft is unchanged."
	if _uncertain:
		%Outcome.text = "The update outcome could not be confirmed. Your complete draft is kept. Reopen the project before making further changes."
	var matcher := RegEx.new()
	matcher.compile("at character index ([0-9]+) is not representable")
	var matched := matcher.search(error)
	_error_index = int(matched.get_string(1)) if matched else -1
	%SelectCharacter.visible = _error_index >= 0
	if _error_index >= 0:
		var prefix: String = editor.text.left(_error_index)
		var lines := prefix.split("\n")
		%Outcome.text = "Line %d, column %d: %s cannot be stored in Classic text. Replace it with supported text, then Apply again. Nothing was applied." % [lines.size(), lines[-1].length() + 1, editor.text.substr(_error_index, 1)]
	_update_focus_order()


func review_current() -> void:
	if _busy or _uncertain: return
	var response := await _request("text-resource.open", {"identity": _identity})
	if response.get("discarded", false): return
	var result: Dictionary = response.get("result", {})
	if not response.get("ok", false) or str(result.get("resource", {}).get("identity", "")) != _identity or not result.get("text") is String:
		%Outcome.text = "Could not read the current text. Your draft remains open. " + str(response.get("error", "Reselecting another resource is not allowed during conflict review."))
		return
	_current_result = result
	_current_revision = int(result.revision)
	%UseCurrent.disabled = %StyleWorkbench.has_formatting_changes() and (result.get("textBlob") != _base_text_blob or result.get("styleBlob") != _base_style_blob)
	%ComparisonExplanation.text = "The saved text or formatting changed. Your full draft is retained. Keep Editing or copy it before loading the saved version." if %UseCurrent.disabled else "Use Draft with Current Version rebases your plain text against the saved formatting, or retains a formatting draft whose source is unchanged. Apply remains explicit."
	%CurrentText.text = str(result.text)
	%RetainedText.text = editor.text
	_draft_scroll = editor.scroll_vertical
	%Editor.hide()
	%Comparison.show()
	%KeepEditing.grab_focus()


func accept_current() -> void:
	if _busy or _uncertain or %UseCurrent.disabled: return
	var retained: String = editor.text
	var retained_label: String = %TextName.text
	var caret := Vector2i(editor.get_caret_column(),editor.get_caret_line())
	var selection := Vector4i(editor.get_selection_from_line(),editor.get_selection_from_column(),editor.get_selection_to_line(),editor.get_selection_to_column()) if editor.has_selection() else Vector4i(-1,-1,-1,-1)
	if not %StyleWorkbench.has_formatting_changes():
		%StyleWorkbench.reset_document(str(_current_result.text),_current_result)
		editor.text = retained
		editor.text_changed.emit()
	_revision = _current_revision
	_original = str(_current_result.text)
	_base_text_blob = _current_result.get("textBlob")
	_base_style_blob = _current_result.get("styleBlob")
	%TextName.text = retained_label if retained_label != _original_label else str(_current_result.resource.get("label",""))
	_original_label = str(_current_result.resource.get("label",""))
	_conflicted = false
	%ReviewCurrent.hide()
	_return_to_draft()
	%StyleWorkbench.request_validation()
	editor.set_caret_line(caret.y)
	editor.set_caret_column(caret.x)
	if selection.x >= 0: editor.select(selection.x,selection.y,selection.z,selection.w)
	_restore_draft_scroll.call_deferred(_generation)
	%Outcome.text = "Current version reviewed. Your complete draft is retained; Apply remains explicit."
	_draft_changed()

func _restore_draft_scroll(generation: int) -> void:
	if generation == _generation and visible: editor.scroll_vertical = _draft_scroll


func _load_saved_version() -> void:
	if _current_result.is_empty() or _busy or _uncertain: return
	_revision = _current_revision
	_original = str(_current_result.text)
	_original_label = str(_current_result.resource.get("label",""))
	_base_text_blob = _current_result.get("textBlob")
	_base_style_blob = _current_result.get("styleBlob")
	%TextName.text = _original_label
	%StyleWorkbench.reset_document(_original,_current_result)
	_preview_valid = bool(_current_result.get("feedback",{}).get("valid",true))
	_conflicted = false
	%ReviewCurrent.hide()
	_return_to_draft()
	%Outcome.text = "Saved text and formatting loaded. Nothing was changed in the project."
	_draft_changed()


func _return_to_draft() -> void:
	%Comparison.hide()
	%Editor.show()
	editor.grab_focus()
	editor.scroll_vertical = _draft_scroll


func _select_error() -> void:
	if _error_index < 0 or _error_index >= editor.text.length():
		return
	var lines: PackedStringArray = editor.text.left(_error_index).split("\n")
	var line := lines.size() - 1
	var column := lines[-1].length()
	editor.grab_focus()
	editor.set_caret_line(line)
	editor.set_caret_column(column)
	editor.select(line, column, line, column + 1)


func _validation_changed(valid: bool, message: String) -> void:
	_preview_valid = valid
	%Outcome.text = message
	_draft_changed()
	_error_index = -1
	%SelectCharacter.hide()
	if not valid:
		var matcher := RegEx.new()
		matcher.compile("at character index ([0-9]+) is not representable")
		var matched := matcher.search(message)
		_error_index = int(matched.get_string(1)) if matched else -1
		%SelectCharacter.visible = _error_index >= 0
		if _error_index >= 0:
			var prefix: String = editor.text.left(_error_index)
			%Outcome.text = "Line %d, column %d: %s cannot be stored in Classic text. Replace it before Apply." % [prefix.count("\n")+1,prefix.length()-prefix.rfind("\n"),editor.text.substr(_error_index,1)]
		_update_focus_order()

func _show_encoding_issue(issue: Dictionary) -> void:
	_error_index = int(issue.characterIndex)
	%SelectCharacter.show()
	%Outcome.text = "Line %d, column %d: %s cannot be stored in Classic text. Replace it before Apply." % [int(issue.line),int(issue.column),str(issue.character)]
	_update_focus_order()


func _inspect_styles(edits: Array) -> Dictionary:
	var generation := _generation
	while _busy or (_operations != null and _operations.busy):
		await get_tree().process_frame
		if generation != _generation or not visible: return {"ok":false,"discarded":true}
	if _bridge == null or _uncertain: return {"ok":false,"error":"Reopen the project before checking this draft."}
	var params := {"identity":_identity,"expectedRevision":_revision,"edits":edits}
	var response: Dictionary
	if _operations == null: response = _bridge.request("text-resource.inspect-styles",params)
	else: response = await _operations.run_workflow(_bridge,"Check text and formatting",func(operation): return await operation.request("text-resource.inspect-styles",params))
	if generation != _generation: return {"ok":false,"discarded":true}
	return response


func _restore_focus() -> void:
	if _return_focus == null: return
	var control = _return_focus.get_ref()
	if is_instance_valid(control) and control.is_visible_in_tree(): control.grab_focus()


func _open_uses(offset: int) -> void:
	if _busy or _uncertain: return
	%UseList.clear()
	%UsesCount.text = "Loading callers…"
	%OpenUse.disabled = true
	var response := await _request("reference.used-by",{"targetKind":"text-resource","targetId":str(_resource_id),"offset":offset,"limit":128})
	if response.get("discarded",false) or not visible: return
	if not response.get("ok",false):
		%Outcome.text = str(response.get("error","Could not load callers. Your draft is kept."))
		return
	_uses = response.result.get("items",[])
	_uses_offset = int(response.result.get("offset",offset))
	_uses_total = int(response.result.get("total",0))
	for reference in _uses: %UseList.add_item(preload("res://src/story_reference_label.gd").describe(reference))
	%UsesCount.text = "%d shown · %d callers · Text %d" % [_uses.size(),_uses_total,_resource_id]
	%UsePrevious.disabled = _uses_offset==0
	%UseNext.disabled = not bool(response.result.get("truncated",false))
	%OpenUse.disabled = _uses.is_empty()
	if not _uses.is_empty(): %UseList.select(0)
	%UsesWindow.popup_centered(Vector2i(860,500))
	%UseList.grab_focus()


func _open_use(index: int) -> void:
	if index < 0 or index >= _uses.size() or not _source_opener.is_valid(): return
	var reference: Dictionary = _uses[index].duplicate(true)
	%UsesWindow.hide()
	request_navigation(_source_opener.bind(reference))


func _apply_and_continue() -> void:
	if %Apply.disabled: return
	var action := _pending_navigation
	var bridge = _bridge
	var epoch: int = bridge.connection_epoch() if bridge.has_method("connection_epoch") else 0
	await apply_text()
	if visible: return
	%Discard.hide()
	_pending_navigation = Callable()
	while _operations != null and _operations.busy: await get_tree().process_frame
	if bridge.has_method("connection_epoch") and bridge.connection_epoch()!=epoch: return
	if action.is_valid(): action.call()
