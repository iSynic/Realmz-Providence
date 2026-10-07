class_name ProvidenceEncounterRecordEditor
extends HBoxContainer

signal discovery_requested(direction: String)

signal selection_changed(encounter: Dictionary, references: Array)
signal reference_open_requested(kind: String, native_id: int, identity: String, context: Dictionary)
signal sound_preview_requested(native_id: int, identity: String, status: String)

var kind := ""
var baseline: Dictionary = {}
var draft: Dictionary = {}
var targets: Dictionary = {}
var references: Array = []
var diagnostics: Array = []
var summaries: Array = []
var revision := 0
var offset := 0
var total := 0
var updating := false
var uncertain := false
var conflicting := false
var open_handler: Callable
var commit_handler: Callable
var create_handler: Callable
var copy_handler: Callable
var copy_catalog_handler: Callable
var target_handler: Callable
var message_handler: Callable
var reconcile_handler: Callable
var reference_refresh_handler: Callable
var reference_preview_handler: Callable
var catalog_handler: Callable
var session_available := false
var operation_busy := false
var _copy_source: Dictionary = {}
var _picker_field: ProvidenceEncounterReferenceField
var _picker_items: Array = []
var _picker_generation := 0
var _reference_preview_generation := 0
var _picker_next := ""
var _focus_origin: Control
var _source_field := ""
var _failure_origin: Window
var _failure_control: Control
var comparison_pending := false


func _ready() -> void:
	%EncounterSearch.text_changed.connect(func(_v): offset = 0; if catalog_handler.is_valid(): await catalog_handler.call())
	%PreviousPage.pressed.connect(func(): offset = maxi(0, offset - 128); await catalog_handler.call())
	%NextPage.pressed.connect(func(): offset += 128; await catalog_handler.call())
	%EncounterCollection.item_selected.connect(_selected)
	%NewEncounter.pressed.connect(func(): if create_handler.is_valid(): await create_handler.call(""))
	%CopyEncounter.pressed.connect(func(): if create_handler.is_valid(): await create_handler.call(str(draft.get("identity", ""))))
	%CopyFrom.pressed.connect(_open_copy)
	%ApplyEncounter.pressed.connect(commit_selected)
	%RevertEncounter.pressed.connect(discard_draft)
	%CopySource.item_selected.connect(_load_copy)
	%AcceptCopy.pressed.connect(_accept_copy)
	%CancelCopy.pressed.connect(func(): _close_modal(%CopyDialog))
	%ReferenceSearch.text_changed.connect(func(_v): _request_targets(""))
	%ReferenceResults.item_activated.connect(func(_i): _use_reference())
	%ReferenceResults.item_selected.connect(_preview_reference)
	%UseReference.pressed.connect(_use_reference)
	%NoneReference.pressed.connect(func(): _set_reference(_picker_field.none_value, {}))
	%CancelReference.pressed.connect(func(): _close_modal(%ReferenceDialog))
	%MoreReferences.pressed.connect(func(): _request_targets(_picker_next))
	%NewString.pressed.connect(_new_string)
	%CreateString.pressed.connect(_create_string)
	%CancelString.pressed.connect(func(): _close_modal(%StringDialog))
	%CheckCurrent.pressed.connect(func(): if reconcile_handler.is_valid(): await reconcile_handler.call())
	%ReloadLatest.pressed.connect(func(): if reconcile_handler.is_valid(): await reconcile_handler.call())
	for dialog in [%ReferenceDialog, %CopyDialog, %StringDialog, %FailureDialog]:
		dialog.close_requested.connect(_close_modal.bind(dialog))
		dialog.window_input.connect(func(event):
			if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE: _close_modal(dialog))
	%KeepComparedDraft.pressed.connect(func(): finish_comparison(true))
	%UseAppliedValues.pressed.connect(func(): finish_comparison(false))
	%ComparisonDialog.close_requested.connect(func(): finish_comparison(true))
	_clear_form()
	_set_form_available(false)


func route_identity() -> String: return "encounters." + kind
func current_encounter() -> Dictionary: return baseline.duplicate(true)
func current_applied_native_id() -> int: return int(baseline.get("nativeId", -1))
func open_native_id(native_id: int) -> Dictionary:
	return await open_handler.call("%s-encounter:%d" % [kind, native_id])
func refresh_state() -> void: _update_state()
func set_busy(next: bool, _label: String) -> void:
	operation_busy = next
	_update_commands()
func set_authoritative_baseline(document: Dictionary) -> void:
	baseline = (document.get("encounter", {}) as Dictionary).duplicate(true)
	_update_state()
func trusted_applied_native_id(has_draft: bool = false) -> int:
	return -1 if has_draft or has_unapplied_changes() or uncertain else current_applied_native_id()
func selected_identity() -> String: return str(draft.get("identity", ""))
func list_query() -> Dictionary: return {"offset": offset, "limit": 128, "query": %EncounterSearch.text}
func read_state() -> Dictionary: return {"identity": selected_identity(), "draft": draft.duplicate(true), "query": %EncounterSearch.text, "offset": offset}
func read_navigation_state() -> Dictionary:
	var state := read_state()
	state["listScroll"] = %EncounterCollection.get_v_scroll_bar().value
	state["formScroll"] = %BodyScroll.scroll_vertical
	state["focusField"] = _source_field
	return state


func restore_navigation_state(state: Dictionary) -> bool:
	offset = int(state.get("offset", 0))
	%EncounterSearch.set_block_signals(true)
	%EncounterSearch.text = str(state.get("query", "")); %EncounterSearch.set_block_signals(false)
	if catalog_handler.is_valid(): await catalog_handler.call()
	var identity := str(state.get("identity", ""))
	if identity.is_empty(): return true
	var response: Dictionary = await open_handler.call(identity)
	if response.get("ok", false):
		%EncounterCollection.get_v_scroll_bar().value = float(state.get("listScroll", 0))
		%BodyScroll.scroll_vertical = int(state.get("formScroll", 0))
		if not str(state.get("focusField", "")).is_empty(): focus_source(identity, -1, str(state.focusField))
	return bool(response.get("ok", false))

func focus_source(identity: String, _slot: int, field: String) -> bool:
	if identity != selected_identity(): return false
	for control in find_children("*", "", true, false):
		if control is ProvidenceEncounterReferenceField and control.field_key == field:
			_source_field = field
			%BodyScroll.ensure_control_visible(control)
			control.get_node("Choose").grab_focus()
			return true
	return false


func set_summaries(page: Dictionary, next_revision: int, _preferred := "") -> void:
	summaries = (page.get("items", []) as Array).duplicate(true)
	total = int(page.get("total", summaries.size()))
	revision = next_revision
	_render_list()


func set_document(result: Dictionary) -> void:
	baseline = (result.get("encounter", {}) as Dictionary).duplicate(true)
	draft = baseline.duplicate(true)
	references = (result.get("references", []) as Array).duplicate(true)
	diagnostics = (result.get("diagnostics", []) as Array).duplicate(true)
	revision = int(result.get("revision", revision))
	uncertain = false; conflicting = false; comparison_pending = false; targets.clear()
	session_available = true
	_set_form_available(not draft.is_empty())
	updating = true
	_present_form()
	updating = false
	_render_list()
	_update_state()


func accept_saved_document(submitted: Dictionary) -> void:
	baseline = submitted.duplicate(true)
	baseline["authored"] = true
	draft["authored"] = true
	_update_state()


func has_unapplied_changes() -> bool:
	return uncertain or (not baseline.is_empty() and not preload("res://src/document_value_equality.gd").equal(draft, baseline))


func discard_draft() -> void:
	if uncertain: return
	draft = baseline.duplicate(true); conflicting = false; targets.clear()
	updating = true; _present_form(); updating = false
	_update_state()
	if reference_refresh_handler.is_valid(): reference_refresh_handler.call_deferred()


func commit_selected() -> void:
	if draft.is_empty() or not commit_handler.is_valid(): return
	var problem := draft_error()
	if not problem.is_empty():
		%EncounterStatus.text = problem.error; focus_problem(problem); return
	await commit_handler.call(draft.duplicate(true))


func draft_error() -> Dictionary:
	if uncertain or conflicting or comparison_pending: return {"ok": false, "error": "Check the current applied encounter before retrying. Your draft is kept."}
	return {}


func change(key: String, value: Variant) -> void:
	if updating or draft.is_empty(): return
	draft[key] = value
	_update_state()


func change_array(key: String, slot: int, value: Variant) -> void:
	if updating or draft.is_empty(): return
	draft[key][slot] = value
	_update_state()


func bind_reference(field: ProvidenceEncounterReferenceField) -> void:
	field.choose_requested.connect(_choose_reference)
	field.value_requested.connect(_reference_value_requested)
	field.open_requested.connect(func(f):
		var context: Dictionary = target_context(f)
		context["targetStatus"] = f.target.get("status", "resolved")
		reference_open_requested.emit(f.target_kind, f.value, f.identity(), context))
	field.preview_requested.connect(func(f): sound_preview_requested.emit(absi(f.value), f.identity(), str(f.target.get("status", ""))))


func set_target(field_key: String, target: Dictionary) -> void:
	targets[field_key] = target.duplicate(true)
	updating = true; _present_form(); updating = false


func show_failure(response: Dictionary) -> void:
	focus_problem(failure_problem(response))
	uncertain = bool(response.get("outcomeUnknown", false))
	conflicting = str(response.get("error", "")).to_lower().contains("revision")
	%FailureText.text = str(response.get("error", "The encounter could not be applied.")) + "\nYour draft is retained."
	if uncertain: %FailureText.text += "\nThe command may have applied. Check Current reads the project session before any retry."
	%CheckCurrent.visible = uncertain or conflicting
	%ReloadLatest.visible = conflicting
	for modal in [%ReferenceDialog, %StringDialog, %CopyDialog]:
		if modal.visible: _failure_origin = modal; modal.hide()
	%FailureDialog.popup_centered()
	_update_state()


func clear_selection() -> void:
	_picker_generation += 1
	for modal in [%ReferenceDialog, %StringDialog, %CopyDialog, %FailureDialog, %ComparisonDialog]: modal.hide()
	baseline.clear(); draft.clear(); summaries.clear(); targets.clear(); references.clear(); diagnostics.clear()
	total = 0; offset = 0; comparison_pending = false
	uncertain = false; conflicting = false; session_available = false
	_clear_form(); _render_list(); _update_state()
	_set_form_available(false)


func _set_form_available(available: bool) -> void:
	%Body.visible = available
	var pending: Array[Node] = [%Body]
	while not pending.is_empty():
		var node: Node = pending.pop_back()
		for child in node.get_children(): pending.append(child)
		if node is BaseButton: node.disabled = not available
		elif node is SpinBox: node.editable = available


func _render_list() -> void:
	%EncounterCollection.clear()
	for item: Dictionary in summaries:
		var label := str(item.get("label", ""))
		if kind == "rogue": label = "%d · %d actions%s" % [int(item.nativeId), int(item.get("enabledActions", 0)), " · trapped" if item.get("trapSet", false) else ""]
		else: label = "%d · day %d · %d%%" % [int(item.nativeId), int(item.get("day", 0)), int(item.get("percent", 0))]
		%EncounterCollection.add_item(label)
		%EncounterCollection.set_item_metadata(%EncounterCollection.item_count - 1, str(item.identity))
		if str(item.identity) == selected_identity(): %EncounterCollection.select(%EncounterCollection.item_count - 1)
	%CollectionCount.text = "%d matches" % total if summaries.is_empty() else "%d matches · %d–%d" % [total, mini(offset + 1, total), mini(offset + summaries.size(), total)]
	%PreviousPage.disabled = offset == 0; %NextPage.disabled = offset + summaries.size() >= total


func _selected(index: int) -> void:
	if open_handler.is_valid(): await open_handler.call(str(%EncounterCollection.get_item_metadata(index)))


func _update_state() -> void:
	%EncounterIdentity.text = ("Rogue" if kind == "rogue" else "Timed") + " Encounter " + (str(int(draft.nativeId)) if not draft.is_empty() else "—")
	%DraftState.text = "Select or create an encounter." if draft.is_empty() else ("Unapplied changes" if has_unapplied_changes() else "No unapplied changes")
	_update_commands()
	var problem := draft_error()
	%EncounterStatus.text = str(problem.get("error", ""))
	_update_summary()
	selection_changed.emit(draft.duplicate(true), references.duplicate(true))


func _update_commands() -> void:
	%Callers.disabled = operation_busy or draft.is_empty() or uncertain
	%ApplyEncounter.disabled = operation_busy or draft.is_empty() or not has_unapplied_changes() or not draft_error().is_empty()
	%RevertEncounter.disabled = operation_busy or draft.is_empty() or not has_unapplied_changes() or uncertain
	%CopyEncounter.disabled = operation_busy or draft.is_empty() or uncertain
	%CopyFrom.disabled = operation_busy or draft.is_empty() or uncertain
	%NewEncounter.disabled = operation_busy or not session_available or uncertain


func _choose_reference(field: ProvidenceEncounterReferenceField) -> void:
	_picker_field = field; _focus_origin = field.get_node("Choose")
	%ReferenceDialog.title = "Choose " + field.target_kind.replace("-", " ")
	%ReferenceContext.text = _reference_destination()
	%ReferencePreview.visible = field.target_kind == "message"
	%ReferenceResults.custom_minimum_size.y = 140 if field.target_kind == "message" else 230
	%NewString.visible = field.target_kind == "message"
	%ReferenceSearch.text = ""; %ReferenceDialog.popup_centered()
	%ReferenceSearch.grab_focus(); _request_targets("")


func _request_targets(cursor: String) -> void:
	if _picker_field == null or not target_handler.is_valid(): return
	_picker_generation += 1
	await target_handler.call(_picker_field, %ReferenceSearch.text, cursor, _picker_generation)


func set_reference_page(page: Dictionary, generation: int) -> void:
	if generation != _picker_generation or not %ReferenceDialog.visible: return
	_picker_items = page.get("items", [])
	_picker_next = str(page.get("nextCursor", "")) if page.get("nextCursor") != null else ""
	%ReferenceResults.clear()
	for item: Dictionary in _picker_items:
		var detail := str(item.get("detail", item.get("label", "")))
		var label := detail.replace("\n", " ").strip_edges() if _picker_field.target_kind == "message" else str(item.label)
		%ReferenceResults.add_item("%d · %s" % [int(item.value), "(Empty string)" if label.is_empty() else label.left(160)])
		%ReferenceResults.set_item_tooltip(%ReferenceResults.item_count - 1, detail if not detail.is_empty() else "Empty string")
	%ReferenceCount.text = "%d matching records · %d on this page" % [int(page.get("total", 0)), _picker_items.size()]
	%MoreReferences.disabled = _picker_next.is_empty()
	%UseReference.disabled = _picker_items.is_empty()
	if not _picker_items.is_empty():
		var selected := 0
		for index in range(_picker_items.size()):
			if int(_picker_items[index].value) == _picker_field.resolved_value(): selected = index; break
		%ReferenceResults.select(selected); _preview_reference(selected)
	else: %ReferencePreview.text = "No matching strings. Search again or create a new string."


func _preview_reference(index: int) -> void:
	_reference_preview_generation += 1
	var target := _picker_items[index] as Dictionary
	var detail := str(target.get("detail", target.get("label", "")))
	%ReferencePreview.text = "String %d · %s\n%s" % [int(target.value), "Empty string" if detail.is_empty() else "Selected text", detail]
	if _picker_field.target_kind == "message" and reference_preview_handler.is_valid(): await reference_preview_handler.call(target, _reference_preview_generation)


func reference_preview_is_current(generation: int) -> bool:
	return generation == _reference_preview_generation and %ReferenceDialog.visible


func set_reference_text(generation: int, text: String) -> void:
	if not reference_preview_is_current(generation): return
	var selected: PackedInt32Array = %ReferenceResults.get_selected_items()
	if selected.is_empty(): return
	var target := _picker_items[selected[0]] as Dictionary
	%ReferencePreview.text = "String %d · %s\n%s" % [int(target.value), "Empty string" if text.is_empty() else "Selected text", text]
	%ReferenceResults.set_item_tooltip(selected[0], text if not text.is_empty() else "Empty string")


func _reference_destination() -> String:
	return ("Rogue" if kind == "rogue" else "Timed") + " Encounter %d · %s" % [int(draft.nativeId), _picker_field.author_label if not _picker_field.author_label.is_empty() else _picker_field.field_key.capitalize()]


func _reference_value_requested(field: ProvidenceEncounterReferenceField, next: int) -> void:
	_picker_field = field
	_set_reference(next, field.target)


func focus_problem(problem: Dictionary) -> void:
	_failure_control = problem.get("control") as Control
	if is_instance_valid(_failure_control):
		if _failure_control is SpinBox: _failure_control.get_line_edit().grab_focus()
		else: _failure_control.grab_focus()


func _use_reference() -> void:
	var selected: PackedInt32Array = %ReferenceResults.get_selected_items()
	if selected.is_empty(): return
	var target := _picker_items[selected[0]] as Dictionary
	_set_reference(_picker_field.selected_value(int(target.value)), target)


func _set_reference(value: int, target: Dictionary) -> void:
	if _picker_field == null: return
	var field := _picker_field.field_key
	if field.contains("["): change_array(field.get_slice("[", 0), field.get_slice("[", 1).trim_suffix("]").to_int(), value)
	else: change(field, value)
	targets[field] = target.duplicate(true)
	_picker_field.set_value(value, target)
	_reference_changed(field)
	_close_modal(%ReferenceDialog)
	_update_summary()


func _new_string() -> void:
	%ReferenceDialog.hide()
	%StringText.text = ""; %StringStatus.text = _reference_destination() + "\nCreate and Use creates one scenario string, then selects its ID in this draft. Apply and Save remain separate."
	%StringDialog.popup_centered(); %StringText.grab_focus()


func _create_string() -> void:
	if message_handler.is_valid(): await message_handler.call(%StringText.text)


func accept_created_string(target: Dictionary) -> void:
	_close_modal(%StringDialog)
	_set_reference(_picker_field.selected_value(int(target.value)), target)


func _open_copy() -> void:
	_focus_origin = %CopyFrom
	%CopySource.clear(); _copy_source.clear()
	%AcceptCopy.disabled = true
	%CopyDialog.popup_centered()
	if copy_catalog_handler.is_valid(): await copy_catalog_handler.call()


func set_copy_catalog(items: Array) -> void:
	if not %CopyDialog.visible: return
	%CopySource.clear()
	for item: Dictionary in items:
		%CopySource.add_item(str(item.label)); %CopySource.set_item_metadata(%CopySource.item_count - 1, item.identity)
	%Scope1.text = "Action tests and outcome feedback" if kind == "rogue" else "Schedule and Extra Action Point"
	%Scope2.text = "Trap and lock settings" if kind == "rogue" else "Item and quest prerequisites"
	%Scope3.text = "Opening sound" if kind == "rogue" else "Position requirements"
	if %CopySource.item_count > 0: _load_copy(0)


func _load_copy(index: int) -> void:
	%AcceptCopy.disabled = true
	if copy_handler.is_valid(): await copy_handler.call(str(%CopySource.get_item_metadata(index)))


func set_copy_source(result: Dictionary) -> void:
	if not %CopyDialog.visible: return
	_copy_source = (result.get("encounter", {}) as Dictionary).duplicate(true)
	%CopySummary.text = "Copy selected sections from encounter %d. Its identity and caller links stay unchanged. Cancel changes nothing." % int(_copy_source.get("nativeId", -1))
	%AcceptCopy.disabled = _copy_source.is_empty()


func _accept_copy() -> void:
	if _copy_source.is_empty(): return
	var groups: Array = copy_groups()
	for index in range(3):
		if not get_node("CopyDialog/Body/Scope%d" % (index + 1)).button_pressed: continue
		for key: String in groups[index]: draft[key] = _copy_source[key].duplicate(true) if _copy_source[key] is Array else _copy_source[key]
	updating = true; _present_form(); updating = false
	_close_modal(%CopyDialog); _update_state()
	if kind != "rogue": refresh_copied_references()


func _close_modal(dialog: Window) -> void:
	if dialog == %FailureDialog: close_failure(); return
	dialog.hide()
	if dialog == %StringDialog and is_instance_valid(_picker_field): %ReferenceDialog.popup_centered()
	if is_instance_valid(_focus_origin): _focus_origin.grab_focus()


func _present_form() -> void: pass
func _clear_form() -> void: pass
func _update_summary() -> void: pass
func copy_groups() -> Array: return []


func reference_value(key: String) -> int:
	if key.contains("["): return int(draft[key.get_slice("[", 0)][key.get_slice("[", 1).trim_suffix("]").to_int()])
	return int(draft.get(key, 0))


func reference_context(key: String) -> Dictionary:
	for child in find_children("*", "HBoxContainer", true, false):
		if child is ProvidenceEncounterReferenceField and child.field_key == key: return target_context(child)
	return {}


func target_context(_field: ProvidenceEncounterReferenceField) -> Dictionary: return {}


func close_failure() -> void:
	%FailureDialog.hide()
	if is_instance_valid(_failure_origin): _failure_origin.popup_centered()
	_failure_origin = null
	if is_instance_valid(_failure_control): focus_problem({"control": _failure_control})


func _reference_changed(_key: String) -> void: pass


func refresh_copied_references() -> void:
	targets.clear()
	updating = true; _present_form(); updating = false
	if reference_refresh_handler.is_valid(): await reference_refresh_handler.call()


func show_comparison(document: Dictionary, retained: Dictionary) -> void:
	set_document(document)
	draft = retained.duplicate(true); comparison_pending = true
	updating = true; _present_form(); updating = false; _update_state()
	preload("res://src/encounter_draft_comparison.gd").populate(%ComparisonRows, baseline, draft)
	%ComparisonDialog.popup_centered()
	%KeepComparedDraft.grab_focus()


func finish_comparison(keep: bool) -> void:
	comparison_pending = false
	%ComparisonDialog.hide()
	if not keep: discard_draft()
	else: _update_state()
	refresh_copied_references()


func failure_problem(_response: Dictionary) -> Dictionary: return draft_error()


func set_current_diagnostics(items: Array) -> void:
	diagnostics = items.duplicate(true)
	_update_summary()

func supports_source_field(field: String) -> bool:
	for control in find_children("*","",true,false):
		if control is ProvidenceEncounterReferenceField and control.field_key==field: return true
	return false
