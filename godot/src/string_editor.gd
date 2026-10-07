class_name ProvidenceStringEditor
extends VBoxContainer
const StringCatalog = preload("res://src/string_catalog.gd")

signal selection_changed(message: Dictionary)
signal projection_applied(projection: Dictionary)
signal source_requested(reference: Dictionary)
signal route_requested(identity: String)
signal failed(message: String)
signal discovery_requested(direction: String)
signal apply_state_changed

var controller := preload("res://src/string_controller.gd").new()
var _interchange: Window
var _navigation := preload("res://src/string_navigation.gd").new()
var _selected_message: Dictionary = {}
var _messages: Array = []
var _selected_identity := ""
var _mode := "message"
var _new := false
var _new_origin := ""
var _busy := false
var _unknown := false
var _feedback: Dictionary = {}
var _feedback_generation := 0
var _sound_refs: Array = []
var _uses: Array = []
var _uses_total := 0
var _uses_offset := 0
var _message_page_offset := 0
var _message_total := 0
var _message_editor: TextEdit
var _message_meta: Label
var _message_search: LineEdit
var _message_list: StringCatalog
var _navigation_guard: Callable
var _search_timer: Timer
var _search_generation := 0
var _loaded_query := ""
var _feedback_timer: Timer
var _find_ready := false
var _find_current := false
var _catalog_loaded := false

func _ready() -> void:
	_message_editor = %MessageText
	_message_meta = %MessageMeta
	_message_search = %MessageSearch
	_message_list = %MessageCollection
	controller.initialize(self)
	_navigation.initialize(self,controller)
	_interchange = %StringImportDialog
	_interchange.initialize(self,controller)
	%ImportText.pressed.connect(func(): request_navigation(_interchange.choose_import,"reviewing imported text"))
	%ExportText.pressed.connect(func(): request_navigation(_interchange.choose_export,"exporting saved strings"))
	_message_editor.text_changed.connect(_text_changed)
	_message_search.text_changed.connect(search)
	_message_list.item_selected.connect(_select_requested)
	%StringEditorTab.pressed.connect(_request_family.bind("message"))
	%OptionLabelsTab.pressed.connect(_request_family.bind("option-label"))
	%ExportCheckTab.pressed.connect(func(): route_requested.emit("text.spell-check"))
	%PreviousMessagePage.pressed.connect(request_navigation.bind(_load_offset.bind(-128),"loading the previous page"))
	%NextMessagePage.pressed.connect(request_navigation.bind(_load_offset.bind(128),"loading the next page"))
	%NewString.pressed.connect(request_navigation.bind(controller.allocate.bind(false),"creating a string"))
	%DuplicateString.pressed.connect(request_navigation.bind(controller.allocate.bind(true),"duplicating this string"))
	%ClearString.pressed.connect(func(): _message_editor.text = ""; _text_changed())
	%ApplyString.pressed.connect(commit_selected)
	%DiscardString.pressed.connect(discard_draft)
	%RetryRead.pressed.connect(reload)
	%MessageUsedBy.item_activated.connect(open_use)
	%LinkedSounds.item_activated.connect(open_sound_owner)
	%OpenSoundOwner.pressed.connect(_open_selected_sound)
	%MessageUsedBy.item_selected.connect(func(_index): _render_controls())
	%OpenSelectedUse.pressed.connect(_open_selected_use)
	%AllCallers.pressed.connect(func(): request_navigation(func(): discovery_requested.emit("incoming"),"viewing all callers"))
	%TraceCallers.pressed.connect(func(): request_navigation(func(): discovery_requested.emit("trace"),"tracing callers"))
	%SelectCharacter.pressed.connect(_select_encoding_issue)
	%PreviousUses.pressed.connect(func(): await controller.inspect_uses(maxi(0,_uses_offset - 128)))
	%NextUses.pressed.connect(func(): await controller.inspect_uses(_uses_offset + 128))
	_feedback_timer = %FeedbackTimer
	_feedback_timer.timeout.connect(func(): await controller.inspect_draft(draft_text(),_mode,_feedback_generation))
	_search_timer = %SearchTimer
	_search_timer.timeout.connect(_search_when_ready)
	reset_document()

func configure_navigation(select_route: Callable, open_source: Callable, guard: Callable) -> void:
	route_requested.connect(select_route)
	source_requested.connect(open_source)
	_navigation_guard = guard

func request_navigation(action: Callable, destination: String) -> void:
	if _unknown or _busy: return
	if _navigation_guard.is_valid(): _navigation_guard.call(action,destination)
	elif not has_unapplied_changes(): await action.call()
	else: show_failure({"error":"Apply or discard this draft before " + destination + "."})

func attach_session(bridge: RefCounted, context: Callable, accept_read: Callable, accept_mutation: Callable, _total: int, operations: ProvidenceEditorOperation) -> void:
	controller.attach(bridge,context,accept_read,accept_mutation,operations)

func _exit_tree() -> void:
	controller.dispose()

func teardown() -> void:
	controller.teardown()

func reset_document() -> void:
	_catalog_loaded = false
	_navigation.invalidate()
	if _interchange != null: _interchange.cancel(false)
	_mode = "message"
	%OptionLabelsTab.visible = false
	set_query("")
	_clear_record()
	_messages.clear()
	_message_list.clear()
	_message_page_offset = 0
	_message_total = 0
	%DocumentStatus.text = "Open a project to author Strings."
	_render_controls()

func _clear_record() -> void:
	_navigation.invalidate()
	_selected_message.clear()
	_selected_identity = ""
	_new = false
	_message_editor.text = ""
	_message_editor.editable = false
	%MessageIdentity.text = "No string selected"
	%MessageMeta.text = "0 characters · 0 uses"
	_feedback = {}
	_sound_refs.clear()
	%LinkedSounds.clear()
	%SoundLink.hide()
	%ByteStatus.text = ""
	receive_uses({"items":[],"total":0})

func receive_page(page: Dictionary, opened: Dictionary, focus_editor: bool) -> void:
	_catalog_loaded = true
	_loaded_query = query()
	var scroll := _message_list.get_v_scroll_bar().value
	_messages = page.get("items",[])
	_message_page_offset = int(page.get("offset",0))
	_message_total = int(page.get("total",0))
	%OptionLabelsTab.visible = bool(page.get("optionLabelsPresent",_mode == "option-label"))
	_message_list.clear()
	for row in _messages:
		_message_list.add_item(_catalog_text(row))
		_message_list.set_item_tooltip(_message_list.item_count-1,str(row.text))
	if opened.has("record"): receive_record(opened,focus_editor)
	else:
		_clear_record()
		_navigation.selection_changed()
	restore_list_selection()
	if focus_editor: _message_list.ensure_current_is_visible()
	else: _message_list.get_v_scroll_bar().value = scroll
	%DocumentStatus.text = "No matching strings." if _messages.is_empty() else "Saved strings"
	%RetryRead.hide()
	_render_controls()

func receive_record(opened: Dictionary, focus_editor: bool) -> void:
	var record: Dictionary = opened.record
	var same := _selected_identity == str(record.identity)
	if not same: _navigation.selection_changed()
	var caret := Vector2i(_message_editor.get_caret_column(),_message_editor.get_caret_line())
	var scroll := Vector2(_message_editor.scroll_horizontal,_message_editor.scroll_vertical)
	_selected_message = record.duplicate(true)
	_selected_identity = str(record.identity)
	_new = false
	_message_editor.text = str(record.text)
	_message_editor.editable = true
	%MessageIdentity.text = "%s %03d" % ["OPTION LABEL" if _mode == "option-label" else "STRING",int(record.nativeId)]
	%GoToString.value = int(record.nativeId)
	_feedback = opened.get("feedback",{})
	receive_uses(opened.get("uses",{}))
	receive_linked_sounds(opened.get("linkedSounds",{}))
	if same:
		_message_editor.set_caret_line(caret.y)
		_message_editor.set_caret_column(caret.x)
		_message_editor.scroll_horizontal = int(scroll.x)
		_message_editor.scroll_vertical = scroll.y
	if _feedback.is_empty(): _text_changed()
	else: _render_feedback()
	selection_changed.emit(record)
	if focus_editor: _message_editor.grab_focus()

func begin_new(native_id: int, text: String) -> void:
	_new_origin = _selected_identity
	_message_list.deselect_all()
	_navigation.selection_changed()
	receive_linked_sounds({"items":[]})
	_selected_identity = "%s:%d" % [_mode,native_id]
	_selected_message = {"identity":_selected_identity,"nativeId":native_id,"text":"","authored":true}
	_new = true
	_message_editor.text = text
	_message_editor.editable = true
	%MessageIdentity.text = "NEW %s %03d" % ["OPTION LABEL" if _mode == "option-label" else "STRING",native_id]
	receive_uses({"items":[],"total":0})
	%DocumentStatus.text = "Local draft · Apply creates this record; Discard cancels it."
	_text_changed()
	_message_editor.grab_focus()

func submitted_draft() -> Dictionary:
	return {"family":_mode,"nativeId":int(_selected_message.nativeId),"expectedText":null if _new else str(_selected_message.text),"text":draft_text()}

func acknowledge(draft: Dictionary) -> void:
	if _selected_identity != "%s:%d" % [draft.family,int(draft.nativeId)]: return
	_new = false
	_navigation.document_changed()
	apply_visible_text(_selected_identity,str(draft.text),false)
	%MessageIdentity.text = "%s %03d" % ["OPTION LABEL" if _mode == "option-label" else "STRING",int(draft.nativeId)]
	%DocumentStatus.text = "Applied · Save persists this project to disk."
	_render_controls()

func apply_visible_text(identity: String, text: String, replace_editor := true) -> void:
	for index in _messages.size():
		if str(_messages[index].identity) == identity:
			_messages[index].text = text
			_message_list.set_item_text(index,_catalog_text(_messages[index]))
	if identity == _selected_identity:
		_selected_message.text = text
		if replace_editor: _message_editor.text = text
		selection_changed.emit(_selected_message)
		_render_controls()

func receive_uses(page: Dictionary) -> void:
	_uses = page.get("items",[])
	_uses_total = int(page.get("total",_uses.size()))
	_uses_offset = int(page.get("offset",0))
	%MessageUsedBy.clear()
	for row in _uses: %MessageUsedBy.add_item(preload("res://src/story_reference_label.gd").describe(row))
	%UsesStatus.text = "%d callers · %d–%d shown" % [_uses_total,0 if _uses.is_empty() else _uses_offset+1,_uses_offset+_uses.size()]
	%PreviousUses.disabled = _uses_offset <= 0
	%NextUses.disabled = _uses_offset + 128 >= _uses_total
	%SoundContext.text = "Sound: calling script" if _mode == "message" else "Outcomes: calling script"
	%SoundContext.visible = _uses_total > 0
	_render_controls()

func _text_changed() -> void:
	_feedback_generation += 1
	_feedback = {}
	%ByteStatus.text = "Checking Classic encoding…" if not _selected_message.is_empty() else ""
	if _feedback_timer != null and not _selected_message.is_empty(): _feedback_timer.start()
	_render_controls()

func feedback_current(text: String, kind: String, generation: int) -> bool:
	return generation == _feedback_generation and text == draft_text() and kind == _mode

func receive_feedback(response: Dictionary) -> void:
	if response.get("ok",false): _feedback = response.result.feedback; _render_feedback()
	else: %ByteStatus.text = "Encoding could not be checked. " + str(response.get("error","Retry when ready."))
	_render_controls()

func _render_feedback() -> void:
	var count := int(_feedback.get("encodedBytes",0))
	var limit := 24 if _mode == "option-label" else 255
	%ByteStatus.text = "%d / %d Classic bytes · %s" % [count,limit,"Representable in MacRoman" if _feedback.get("valid",false) else "Correct encoding or length before Apply"]
	var issues: Array = _feedback.get("issues",[])
	%SelectCharacter.visible = not issues.is_empty()
	if not issues.is_empty():
		%ByteStatus.text += " · %s at line %d, column %d" % [str(issues[0].character),int(issues[0].line),int(issues[0].column)]
	_render_controls()

func show_loading() -> void:
	%DocumentStatus.text = "Loading Strings…"
	%RetryRead.hide()

func show_failure(response: Dictionary) -> void:
	%DocumentStatus.text = ("Write outcome uncertain · reopen this project before further edits. Your draft is retained. " if _unknown else "") + str(response.get("error","The operation failed. Your draft is kept."))

func clear_failed_projection(response: Dictionary) -> void:
	_catalog_loaded = false
	_messages.clear()
	_message_list.clear()
	_message_total = 0
	_message_page_offset = 0
	_clear_record()
	show_failure(response)
	%RetryRead.show()
	_render_controls()

func set_operation_state(busy: bool, unknown: bool) -> void:
	_busy = busy
	_unknown = unknown
	if unknown: %DocumentStatus.text = "Write outcome uncertain · reopen this project. Your draft is retained."
	_render_controls()

func _render_controls() -> void:
	if not is_node_ready(): return
	_message_editor.editable = not _unknown and not _selected_message.is_empty()
	for button in [%AllCallers,%TraceCallers,%SelectCharacter]: button.disabled = _busy or _unknown or _selected_message.is_empty()
	for button in [%AllCallers,%TraceCallers]:
		button.disabled = button.disabled or _new
		button.tooltip_text = "Apply this record before tracing its callers." if _new else ""
	%SelectCharacter.visible = not _feedback.get("issues",[]).is_empty()
	_message_meta.text = "%d characters · %d use%s" % [draft_text().length(),_uses_total,"" if _uses_total == 1 else "s"]
	%MessagePageStatus.text = "%d–%d of %d" % [0 if _message_total == 0 else _message_page_offset+1,mini(_message_page_offset+128,_message_total),_message_total]
	%PreviousMessagePage.disabled = _busy or _unknown or _message_page_offset <= 0
	%NextMessagePage.disabled = _busy or _unknown or _message_page_offset+128 >= _message_total
	for button in [%NewString,%ImportText,%ExportText,%Go,%FindLong]: button.disabled = _busy or _unknown
	for button in [%NewString,%ImportText]: button.disabled = _busy or _unknown or not _catalog_loaded
	%FindFirst.disabled = _busy or _unknown or not _find_ready
	%FindNext.disabled = _busy or _unknown or not _find_current
	%DuplicateString.disabled = _busy or _unknown or _selected_message.is_empty()
	%ClearString.disabled = _busy or _unknown or _selected_message.is_empty()
	%ApplyString.disabled = _busy or _unknown or not has_unapplied_changes() or not _feedback.get("valid",false)
	%DiscardString.disabled = _busy or _unknown or not has_unapplied_changes()
	%OpenSoundOwner.disabled = _busy or _unknown or _sound_refs.is_empty()
	%OpenSelectedUse.disabled = _busy or _unknown or %MessageUsedBy.get_selected_items().is_empty()
	%NewString.text = "+ New Label" if _mode == "option-label" else "+ New String"
	%ApplyString.text = "Apply Label" if _mode == "option-label" else "Apply String"
	%ImportText.visible = _mode == "message"
	%ExportText.visible = _mode == "message"
	%OptionLabelsTab.disabled = _mode == "option-label"
	%StringEditorTab.disabled = _mode == "message"
	apply_state_changed.emit()

func _select_requested(index: int) -> void:
	restore_list_selection()
	request_navigation(controller.select_row.bind(index,true),"opening another string")

func _request_family(kind: String) -> void:
	request_navigation(_switch_family.bind(kind),"switching text catalogs")

func _switch_family(kind: String) -> void:
	if kind == _mode: return
	_mode = kind
	_navigation.invalidate()
	_clear_record()
	set_query("")
	await reload("",0,false)

func set_family(kind: String) -> void:
	if _mode != kind:
		_mode = kind
		_navigation.invalidate()
		_clear_record()

func _load_offset(delta: int) -> void:
	await reload("",maxi(0,_message_page_offset+delta),false)

func search(_query: String) -> void:
	_search_generation += 1
	_search_timer.start()

func _search_when_ready() -> void:
	var generation := _search_generation
	var selected_query := query()
	while _busy and is_inside_tree():
		await get_tree().process_frame
		if generation != _search_generation: return
	if not is_inside_tree() or generation != _search_generation: return
	if has_unapplied_changes(): set_query(_loaded_query)
	request_navigation(_apply_search.bind(selected_query),"filtering Strings")

func _apply_search(text: String) -> void:
	set_query(text)
	await reload("",0,false)

func reload(identity := "", offset := -1, focus_editor := true) -> bool:
	return controller.accept_read(await controller.reload(identity,offset,focus_editor))

func refresh_workbench(operation: ProvidenceEditorOperation = null) -> Dictionary:
	return await controller.reload("",-1,false,operation)

func open_native(native_id: int) -> void:
	if has_unapplied_changes(): controller.accept_read({"ok":false,"draftKept":true,"error":"Apply or discard your draft before opening another string."}); return
	set_family("message")
	controller.accept_read(await controller.open_id(native_id))

func open_option_label(native_id: int) -> Dictionary:
	if has_unapplied_changes(): return {"ok":false,"draftKept":true}
	set_family("option-label")
	var response: Dictionary = await controller.open_id(native_id)
	controller.accept_read(response)
	return response

func select_message(index: int, focus_editor := true) -> bool:
	return await controller.select_row(index,focus_editor)

func commit_selected() -> void:
	await controller.commit()

func discard_draft() -> void:
	if _unknown: return
	if _new: _clear_record(); controller.reload.call_deferred(_new_origin,-1,false)
	else: _message_editor.text = str(_selected_message.get("text","")); _text_changed()

func has_unapplied_changes() -> bool:
	return _new or not _selected_message.is_empty() and draft_text() != str(_selected_message.text)

func read_state() -> Dictionary:
	return {"identity":_selected_identity,"text":draft_text(),"query":query(),"family":_mode,"new":_new}

func read_navigation_state() -> Dictionary:
	return _navigation.read_state()

func restore_navigation_state(state: Dictionary) -> bool:
	return await _navigation.restore(state)

func apply_theme(mode := "dark", density := "balanced") -> void:
	var controls := preload("res://src/story_text_theme.gd").new()
	controls.mode = mode; controls.density = density; theme = controls
	_interchange.theme = controls
func focus_search() -> void: _message_search.grab_focus()
func focus_source(_identity: String, _slot: int, field: String) -> bool:
	if field not in ["text", "message", "label", ""]: return false
	_message_editor.grab_focus()
	return true
func activate() -> void:
	if not _selected_message.is_empty(): selection_changed.emit(_selected_message)
func family() -> String: return _mode
func query() -> String: return _message_search.text
func page_offset() -> int: return _message_page_offset
func total_messages() -> int: return _message_total
func selected_identity() -> String: return _selected_identity
func current_selection() -> String: return _selected_identity
func discovery_selection() -> Dictionary:
	return {"kind":_mode,"nativeId":str(_selected_message.get("nativeId","")),"identity":_selected_identity,"scope":"scenario"}
func apply_label() -> String: return "Apply Label" if _mode == "option-label" else "Apply String"
func can_apply_draft() -> bool:
	return not _busy and not _unknown and has_unapplied_changes() and _feedback.get("valid",false)
func _select_encoding_issue() -> void:
	var issues: Array = _feedback.get("issues",[])
	if issues.is_empty() or _unknown or _busy: return
	highlight_occurrence({"characterIndex":int(issues[0].characterIndex),"characterLength":1})
func editor_position() -> Dictionary:
	return {"caretLine":_message_editor.get_caret_line(),"caretColumn":_message_editor.get_caret_column(),"editorScroll":_message_editor.scroll_vertical,"listScroll":_message_list.get_v_scroll_bar().value,"selectionFromLine":_message_editor.get_selection_from_line(),"selectionFromColumn":_message_editor.get_selection_from_column(),"selectionToLine":_message_editor.get_selection_to_line(),"selectionToColumn":_message_editor.get_selection_to_column(),"focus":str(get_viewport().gui_get_focus_owner().name) if get_viewport().gui_get_focus_owner() != null else "MessageText"}
func restore_editor_position(state: Dictionary) -> void:
	_message_editor.set_caret_line(int(state.get("caretLine",0)))
	_message_editor.set_caret_column(int(state.get("caretColumn",0)))
	if int(state.get("selectionFromLine",-1)) >= 0: _message_editor.select(int(state.selectionFromLine),int(state.selectionFromColumn),int(state.selectionToLine),int(state.selectionToColumn))
	_message_editor.scroll_vertical = float(state.get("editorScroll",0))
	_message_list.get_v_scroll_bar().value = float(state.get("listScroll",0))
	var focus := find_child(str(state.get("focus","MessageText")),true,false) as Control
	if focus != null: focus.grab_focus()
func highlight_occurrence(hit: Dictionary) -> void:
	var start := _character_position(int(hit.characterIndex))
	var end := _character_position(int(hit.characterIndex)+int(hit.characterLength))
	_message_editor.set_caret_line(start.y)
	_message_editor.set_caret_column(start.x)
	_message_editor.select(start.y,start.x,end.y,end.x)
	_message_editor.grab_focus()
func _character_position(index: int) -> Vector2i:
	var before := draft_text().left(index)
	return Vector2i(before.length() - before.rfind("\n") - 1,before.count("\n"))
func selected_record() -> Dictionary: return _selected_message.duplicate(true)
func draft_text() -> String: return _message_editor.text
func is_new() -> bool: return _new
func used_by() -> Array: return _uses.duplicate(true)
func row_at(index: int) -> Dictionary: return _messages[index].duplicate(true) if index >= 0 and index < _messages.size() else {}
func use_reference(index: int) -> Dictionary: return _uses[index].duplicate(true) if index >= 0 and index < _uses.size() else {}
func command_state(command: String) -> String:
	return "working" if command in ["message.list","message.open","message.update","message.create","text.apply-draft","text.find","text.find-long","text.import-review","text.import-apply","text.export-file","option-label.update","option-label.create","option-label.duplicate","reference.used-by"] else "visible-disabled"
func route_identity() -> String: return "text.messages"
func set_query(text: String) -> void:
	_search_generation += 1
	_message_search.set_block_signals(true); _message_search.text = text; _message_search.set_block_signals(false)
func restore_list_selection() -> void:
	_message_list.deselect_all()
	for index in _messages.size():
		if str(_messages[index].identity) == _selected_identity: _message_list.select(index); return
func open_use(index: int) -> void:
	var reference := use_reference(index)
	if not reference.is_empty(): source_requested.emit(reference)
func _open_selected_use() -> void:
	var indices: PackedInt32Array = %MessageUsedBy.get_selected_items()
	if not indices.is_empty(): open_use(indices[0])

func receive_linked_sounds(page: Dictionary) -> void:
	_sound_refs = page.get("items",[])
	%LinkedSounds.clear()
	for row in _sound_refs:
		%LinkedSounds.add_item("Sound %s · %s" % [str(row.targetId),preload("res://src/story_reference_label.gd").describe(row)])
	%SoundLink.visible = not _sound_refs.is_empty()
	if not _sound_refs.is_empty(): %LinkedSounds.select(0)
	%SoundHeading.text = "SOUND STEPS IN MESSAGE CALLERS · %d" % int(page.get("total",_sound_refs.size()))
	_render_controls()

func open_sound_owner(index: int) -> void:
	if index >= 0 and index < _sound_refs.size(): source_requested.emit(_sound_refs[index].duplicate(true))

func _open_selected_sound() -> void:
	var selected: PackedInt32Array = %LinkedSounds.get_selected_items()
	if not selected.is_empty(): open_sound_owner(selected[0])

func set_find_state(ready: bool, current: bool) -> void:
	_find_ready = ready
	_find_current = current
	_render_controls()
func operation_busy() -> bool: return _busy
func _catalog_text(row: Dictionary) -> String:
	return "%03d  %s\n     %d characters · %s" % [int(row.nativeId),str(row.text).replace("\n"," "),str(row.text).length(),"Scenario string" if row.get("authored",false) else "Imported string"]
