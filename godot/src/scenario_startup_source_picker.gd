extends ConfirmationDialog

var _view: Control
var _token: Dictionary = {}
var _rows: Array = []
var _selected: Dictionary = {}
var _projection: Dictionary = {}
var _generation := 0
var _offset := 0
var _total := 0
var _focus: Control


func _ready() -> void:
	%SourceSearch.text_changed.connect(func(_text: String): _offset = 0; _filter())
	%SourcePrevious.pressed.connect(func(): _offset = maxi(0, _offset - 64); _filter())
	%SourceNext.pressed.connect(func(): _offset += 64; _filter())
	%SourceChoices.item_selected.connect(_preview)
	confirmed.connect(_accept)
	canceled.connect(cancel)
	close_requested.connect(cancel)


func begin(view: Control, focus: Control) -> void:
	cancel(false)
	_view = view; _focus = focus
	_token = {"revision": view.applied_revision(), "draft": view.draft_token()}
	%SourceSearch.text = ""; _offset = 0
	popup_centered(Vector2i(900, 560))
	_filter()
	%SourceSearch.grab_focus()


func _current(require_visible := true) -> bool:
	return (visible or not require_visible) and is_instance_valid(_view) and _view.can_edit() and _token.get("revision") == _view.applied_revision() and _token.get("draft") == _view.draft_token()


func _filter() -> void:
	_generation += 1; _selected.clear(); _projection.clear()
	%SourceChoices.clear(); %SourceDetails.text = "No source selected."
	get_ok_button().disabled = true
	if not is_instance_valid(_view): return
	var generation := _generation
	%SourcePrevious.disabled = true; %SourceNext.disabled = true; %SourceCount.text = "Loading retained files…"
	while _view.controller.is_busy():
		await get_tree().process_frame
		if not _current() or generation != _generation: return
	var response: Dictionary = await _view.controller.query("scenario-security.source-list", {"expectedRevision": _token.revision, "search": %SourceSearch.text, "offset": _offset})
	if not _current() or generation != _generation: return
	if not response.get("ok", false): %SourceDetails.text = str(response.get("error", "Source list unavailable.")); return
	_rows = response.result.items; _offset = int(response.result.offset); _total = int(response.result.total)
	for source: Dictionary in _rows: %SourceChoices.add_item("%s · %d bytes" % [source.nativePath, source.byteLength])
	%SourceCount.text = "%d matches · page %d of %d" % [_total, _offset / 64 + 1, maxi(1, ceili(float(_total) / 64))]
	%SourcePrevious.disabled = _offset == 0; %SourceNext.disabled = _offset + 64 >= _total
	if _rows.is_empty(): %SourceDetails.text = "No retained startup candidates match. Cancel keeps the draft."



func _preview(index: int) -> void:
	if not _current() or index < 0 or index >= _rows.size(): return
	_generation += 1
	var generation := _generation
	_selected = _rows[index].duplicate(true); _projection.clear()
	get_ok_button().disabled = true; %SourceDetails.text = "Reading this exact retained file…"
	while _view.controller.is_busy():
		await get_tree().process_frame
		if not _current() or generation != _generation: return
	var response: Dictionary = await _view.controller.query("scenario-security.source-preview", {"expectedRevision": _token.revision, "startupSource": _selected})
	if not _current() or generation != _generation: return
	if not response.get("ok", false): %SourceDetails.text = str(response.get("error", "Source preview unavailable.")); return
	_projection = response.result
	%SourceDetails.text = "%s\n\n%s\n\nThis choice stays local until Apply Security Codes. Existing retained files remain unchanged." % [_selected.nativePath, "Security segments decoded." if _projection.decodingAvailable else str(_projection.reason)]
	get_ok_button().disabled = false


func _accept() -> void:
	if not _current(false) or _projection.is_empty(): return
	var view := _view; var source := _selected.duplicate(true); var preview := _projection.duplicate(true)
	cancel(); view.accept_original_source(source, preview)


func cancel(restore := true) -> void:
	_generation += 1; hide(); _token.clear(); _selected.clear(); _projection.clear(); _view = null
	if restore and is_instance_valid(_focus): _focus.call_deferred("grab_focus")
	_focus = null
