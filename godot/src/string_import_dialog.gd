extends Window

var _view: ProvidenceStringEditor
var _controller
var _path := ""
var _token := ""
var _revision := 0
var _session := 0
var _generation := 0
var _offset := 0
var _rows: Array = []
var _busy := false
var _can_apply := false
var _has_next := false
var _focus: WeakRef
var _uncertain := false

func _ready() -> void:
	close_requested.connect(cancel)
	%CancelImport.pressed.connect(cancel)
	%ApplyImport.pressed.connect(_apply)
	%ReviewAgain.pressed.connect(_review_again)
	%ImportPrevious.pressed.connect(_page.bind(-3))
	%ImportNext.pressed.connect(_page.bind(3))
	%ImportChanges.item_selected.connect(_inspect)
	%ImportFile.file_selected.connect(_import_file)
	%ImportFile.canceled.connect(_restore_focus)
	%ExportFile.file_selected.connect(_export_file)
	%ExportFile.canceled.connect(_restore_focus)

func initialize(view: ProvidenceStringEditor, controller) -> void:
	_view = view
	_controller = controller

func _begin() -> void:
	_uncertain = false
	_generation += 1
	_token = ""
	_path = ""
	_offset = 0
	_rows.clear()
	_can_apply = false
	_has_next = false
	_session = _controller.session_generation()
	_revision = _controller.revision()
	var focus := _view.get_viewport().gui_get_focus_owner()
	_focus = weakref(focus) if focus != null else null

func choose_import() -> void:
	_begin()
	%ImportFile.popup_centered(Vector2i(900,600))

func choose_export() -> void:
	_begin()
	%ExportFile.popup_centered(Vector2i(900,600))

func _current(generation: int) -> bool:
	return generation == _generation and _session == _controller.session_generation()

func _import_file(path: String) -> void:
	if _session != _controller.session_generation(): return
	_path = path
	%ImportSummary.text = "Reviewing %s…" % path.get_file()
	%ApplyImport.disabled = true
	%ImportCurrent.text = ""
	%ImportReplacement.text = ""
	popup_centered(Vector2i(1180,720))
	await _review()

func _params() -> Dictionary:
	var params := {"path":_path,"expectedRevision":_revision,"offset":_offset,"limit":3}
	if not _token.is_empty(): params["reviewToken"] = _token
	return params

func _review() -> void:
	var generation := _generation
	_set_busy(true)
	var response: Dictionary = await _controller.request("text.import-review",_params())
	if not _current(generation): return
	_set_busy(false)
	%ImportChanges.clear()
	%ImportCurrent.text = ""
	%ImportReplacement.text = ""
	if not response.get("ok",false): _failure(response); return
	var review: Dictionary = response.result
	_token = str(review.reviewToken)
	_offset = int(review.offset)
	_rows = review.items
	%ImportSummary.text = "%s · %d changed strings of %d · %d need correction" % [_path.get_file(),int(review.total),int(review.strings),int(review.invalid)]
	for row in _rows: %ImportChanges.add_item("String %03d · %s" % [int(row.nativeId),"Ready" if row.feedback.valid else "Needs correction"])
	%ImportPage.text = "%d–%d of %d changes" % [0 if _rows.is_empty() else _offset+1,_offset+_rows.size(),int(review.total)]
	%ImportPrevious.disabled = _offset == 0
	%ImportNext.disabled = not review.truncated
	_can_apply = bool(review.canApply)
	_has_next = bool(review.truncated)
	_set_busy(false)
	%ReviewAgain.hide()
	if not _rows.is_empty(): %ImportChanges.select(0); await _inspect(0)

func _inspect(index: int) -> void:
	if index < 0 or index >= _rows.size() or _busy or _uncertain: return
	var generation := _generation
	var params := _params()
	params["identity"] = str(_rows[index].identity)
	_set_busy(true)
	var response: Dictionary = await _controller.request("text.import-inspect",params)
	if not _current(generation): return
	_set_busy(false)
	if not response.get("ok",false): _failure(response); return
	%ImportCurrent.text = str(response.result.change.expectedText)
	%ImportReplacement.text = str(response.result.change.text)
	var feedback: Dictionary = response.result.feedback
	%ImportFeedback.text = "%d / 255 Classic bytes · %s" % [int(feedback.encodedBytes),"Representable in MacRoman" if feedback.valid else "Correct the file, then prepare a new review"]
	var issues: Array = feedback.issues
	if not issues.is_empty(): %ImportFeedback.text += " · %s at line %d, column %d" % [issues[0].character,int(issues[0].line),int(issues[0].column)]

func _page(delta: int) -> void:
	if _busy or _uncertain: return
	_offset = maxi(0,_offset+delta)
	await _review()

func _review_again() -> void:
	if _busy or _uncertain: return
	_token = ""
	_revision = _controller.revision()
	_offset = 0
	await _review()

func _apply() -> void:
	if _busy or _uncertain or _token.is_empty(): return
	var generation := _generation
	_set_busy(true)
	var response: Dictionary = await _controller.apply_import(_params())
	if not _current(generation): return
	_set_busy(false)
	if not response.get("ok",false):
		_failure(response)
		if response.get("outcomeUnknown",false):
			_uncertain = true
			_set_busy(false)
			%ReviewAgain.hide()
			%ImportSummary.text = "Write outcome uncertain. Reopen this project; your reviewed file is retained. Do not retry Apply."
		return
	_view.show_failure({"error":str(response.get("viewRefreshError","Imported Strings · one Undo reverses every changed row. Save writes this project to disk."))})
	cancel()

func _export_file(path: String) -> void:
	var generation := _generation
	var response: Dictionary = await _controller.request("text.export-file",{"path":path})
	if not _current(generation): return
	_view.show_failure({"error":"Exported %d saved strings to %s" % [int(response.result.strings),path.get_file()]} if response.get("ok",false) else response)
	_restore_focus()

func _failure(response: Dictionary) -> void:
	%ImportSummary.text = str(response.get("error","Import review failed. Nothing was changed."))
	_can_apply = false
	_has_next = false
	%ApplyImport.disabled = true
	%ImportPrevious.disabled = true
	%ImportNext.disabled = true
	%ReviewAgain.show()

func _set_busy(busy: bool) -> void:
	_busy = busy
	%ApplyImport.disabled = busy or _uncertain or not _can_apply
	%ImportPrevious.disabled = busy or _uncertain or _offset == 0
	%ImportNext.disabled = busy or _uncertain or not _has_next
	%CancelImport.disabled = busy or _uncertain
	%ReviewAgain.disabled = busy or _uncertain
	%ImportChanges.mouse_filter = Control.MOUSE_FILTER_IGNORE if _uncertain else Control.MOUSE_FILTER_STOP
	%ImportChanges.focus_mode = Control.FOCUS_NONE if _uncertain else Control.FOCUS_ALL

func cancel(restore_focus := true) -> void:
	if (_busy or _uncertain) and restore_focus: return
	_generation += 1
	_busy = false
	hide()
	%ImportFile.hide()
	%ExportFile.hide()
	if restore_focus: _restore_focus()

func _restore_focus() -> void:
	var focus: Variant = _focus.get_ref() if _focus != null else null
	if is_instance_valid(focus) and focus.is_visible_in_tree(): focus.grab_focus()

func _unhandled_key_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel") and not _busy: cancel(); get_viewport().set_input_as_handled()
