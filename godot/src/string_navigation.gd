extends RefCounted

var _view: ProvidenceStringEditor
var _controller
var _find: LineEdit
var _status: Label
var _after: Dictionary = {}
var _query_generation := 0
var _timer: Timer
var _opening_match := false

func initialize(view: ProvidenceStringEditor, controller) -> void:
	_view = view
	_controller = controller
	_find = view.find_child("OccurrenceSearch",true,false)
	_status = view.find_child("OccurrenceStatus",true,false)
	_timer = view.find_child("OccurrenceTimer",true,false)
	_timer.timeout.connect(_preview_count)
	_find.text_changed.connect(_query_changed)
	_find.text_submitted.connect(func(_text): _view.request_navigation(find.bind(false),"finding text"))
	(view.find_child("FindFirst",true,false) as Button).pressed.connect(func(): _view.request_navigation(find.bind(false),"finding text"))
	(view.find_child("FindNext",true,false) as Button).pressed.connect(func(): _view.request_navigation(find.bind(true),"finding the next occurrence"))
	(view.find_child("FindLong",true,false) as Button).pressed.connect(func(): _view.request_navigation(find_long,"finding long strings"))
	(view.find_child("Go",true,false) as Button).pressed.connect(func(): _view.request_navigation(go,"opening a numbered string"))

func _query_changed(_text: String) -> void:
	_query_generation += 1
	_after.clear()
	_view.set_find_state(false,false)
	_status.text = "Checking saved text…" if not _find.text.is_empty() else "Enter text, then Find First"
	_timer.start() if not _find.text.is_empty() else _timer.stop()

func go() -> void:
	var response: Dictionary = await _controller.open_id(int((_view.find_child("GoToString",true,false) as SpinBox).value),false)
	if not response.get("ok",false): _view.show_failure(response)

func find(next: bool) -> void:
	var query := _find.text
	if query.is_empty(): _after.clear(); _status.text = "Enter text to find"; return
	var generation := _query_generation
	var params := {"family":_view.family(),"query":query}
	if next and not _after.is_empty():
		params["afterId"] = int(_after.nativeId)
		params["afterCharacterIndex"] = int(_after.characterIndex)
	var response: Dictionary = await _controller.request("text.find",params)
	if generation != _query_generation: return
	if not response.get("ok",false): _status.text = str(response.get("error","Search failed")); return
	var hit: Variant = response.result.get("next")
	_status.text = "%d occurrences%s" % [int(response.result.total)," · wrapped to first" if response.result.get("wrapped",false) else ""]
	if hit == null: _after.clear(); _view.set_find_state(false,false); return
	_opening_match = true
	var opened: Dictionary = await _controller.open_id(int(hit.nativeId),false)
	_opening_match = false
	if generation != _query_generation or not opened.get("ok",false): return
	_after = hit.duplicate(true)
	_view.set_find_state(true,true)
	_status.text += " · %s %d · line %d, column %d" % ["Label" if _view.family()=="option-label" else "String",int(hit.nativeId),int(hit.line),int(hit.column)]
	_view.highlight_occurrence(hit)

func find_long() -> void:
	var generation := _query_generation
	var family := _view.family()
	var session: int = _controller.session_generation()
	var identity := _view.selected_identity()
	var params := {"family":_view.family()}
	var record := _view.selected_record()
	if not record.is_empty(): params["afterId"] = int(record.nativeId)
	var response: Dictionary = await _controller.request("text.find-long",params)
	if not is_instance_valid(_view) or generation != _query_generation or family != _view.family() or session != _controller.session_generation() or identity != _view.selected_identity(): return
	if not response.get("ok",false): _view.show_failure(response); return
	_status.text = "%d strings at their Classic length limit" % int(response.result.total)
	if response.result.nativeId != null: await _controller.open_id(int(response.result.nativeId),false)

func read_state() -> Dictionary:
	var state := _view.editor_position()
	state.merge({"mode":_view.family(),"identity":_view.selected_identity(),"query":_view.query(),"pageOffset":_view.page_offset(),"findQuery":_find.text,"findAfter":_after.duplicate(true)})
	return state

func restore(state: Dictionary) -> bool:
	_query_generation += 1
	_view.set_family(str(state.get("mode","message")))
	_view.set_query(str(state.get("query","")))
	var response: Dictionary = await _controller.reload(str(state.get("identity","")),int(state.get("pageOffset",0)),false)
	if not response.get("ok",false): return false
	_find.text = str(state.get("findQuery",""))
	_after = state.get("findAfter",{}).duplicate(true)
	_view.set_find_state(not _find.text.is_empty(),not _after.is_empty())
	if not _find.text.is_empty(): _timer.start()
	_view.restore_editor_position(state)
	return true

func invalidate() -> void:
	_query_generation += 1
	_timer.stop()
	_after.clear()
	_view.set_find_state(false,false)
	_status.text = "Enter text, then Find First"

func selection_changed() -> void:
	if not _opening_match: _query_changed(_find.text)

func document_changed() -> void:
	_query_changed(_find.text)

func _preview_count() -> void:
	var generation := _query_generation
	var family := _view.family()
	while is_instance_valid(_view) and _view.is_inside_tree() and _view.operation_busy():
		await _view.get_tree().process_frame
		if generation != _query_generation: return
	if not is_instance_valid(_view) or not _view.is_inside_tree() or generation != _query_generation: return
	var response: Dictionary = await _controller.request("text.find",{"family":family,"query":_find.text})
	if not is_instance_valid(_view) or generation != _query_generation or _view.family()!=family: return
	if not response.get("ok",false):
		_status.text = str(response.get("error","Could not count occurrences."))
		_view.set_find_state(false,false)
		return
	var count := int(response.result.get("total",0))
	_status.text = "%d occurrences in saved text%s" % [count," · Find First to select a match" if _after.is_empty() else " · current match retained"] if count>0 else "No occurrences in saved text"
	_view.set_find_state(count>0,count>0 and not _after.is_empty())
