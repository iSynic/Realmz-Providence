extends Window

signal query_requested(query: String, scope: String, kind: String, offset: int)
signal preview_requested(identity: String, scope: String, query: String)
signal links_requested(record: Dictionary, direction: String, query: String, offset: int, trace_params: Dictionary)
signal open_record_requested(record: Dictionary)
signal open_source_requested(link: Dictionary)
signal open_target_requested(link: Dictionary)
signal trace_branch_requested(link: Dictionary)
signal flow_requested(record: Dictionary)
signal closed

var _mode := "search"
var _page: Dictionary = {}
var _record: Dictionary = {}
var _selection: Dictionary = {}
var _direction := "incoming"
var _back: Array[Dictionary] = []
var _focus: WeakRef
var _timer: Timer
var _restore: Dictionary = {}
var _suspended := false
var _scope := 0
var _interaction := 0
var _preview_callers: Array = []
var _trace := preload("res://src/discovery_trace_state.gd").new()
const KIND_LABELS := {"all":"All content", "message":"Strings", "extra-action-point":"Extra Action Points", "action-point":"Action Points", "quest-flag":"Quests", "simple-encounter":"Simple Encounters", "complex-encounter":"Complex Encounters", "rogue-encounter":"Rogue Encounters", "timed-encounter":"Timed Encounters", "text-resource":"Scrolling text", "reference-string":"Reference text groups", "monster-library-entry":"Monster Library", "random-rectangle":"Random encounter regions", "option-label":"Option labels", "documentation":"Code help"}
@onready var _query := %Query as LineEdit
@onready var _rows := %Rows as Tree
@onready var _detail := %Detail as RichTextLabel

func _ready() -> void:
	close_requested.connect(close_view)
	_query.text_changed.connect(_query_changed)
	_timer = Timer.new()
	_timer.one_shot = true
	_timer.wait_time = 0.18
	add_child(_timer)
	_timer.timeout.connect(refresh)
	for index in 4:
		%Scope.get_child(index).pressed.connect(_select_scope.bind(index))
	%Kind.item_selected.connect(func(_id: int): refresh())
	%Previous.pressed.connect(func(): refresh(maxi(0, int(_page.get("offset", 0)) - 64)))
	%Next.pressed.connect(next_page)
	%Refresh.pressed.connect(refresh_retaining_state)
	%Close.pressed.connect(close_view)
	%Back.pressed.connect(go_back)
	%SearchUsedBy.pressed.connect(show_links.bind("incoming"))
	%SearchUses.pressed.connect(show_links.bind("outgoing"))
	%UsedBy.pressed.connect(show_links.bind("incoming"))
	%Uses.pressed.connect(show_links.bind("outgoing"))
	%Trace.pressed.connect(show_links.bind("trace"))
	%OpenRecord.pressed.connect(func(): open_record_requested.emit(_record))
	%ViewFlow.pressed.connect(func(): flow_requested.emit(_record.duplicate(true)))
	%OpenSource.pressed.connect(func(): open_source_requested.emit(_selection))
	%OpenTarget.pressed.connect(func(): open_target_requested.emit(_selection))
	%TraceBranch.pressed.connect(func(): trace_branch_requested.emit(_selection))
	_rows.item_selected.connect(_selected)
	_rows.item_activated.connect(_accept)
	_query.text_submitted.connect(func(_value: String): _accept())
	_query.gui_input.connect(_query_key_input)
	for kind in ["all", "message", "extra-action-point", "action-point", "quest-flag", "simple-encounter", "complex-encounter", "rogue-encounter", "timed-encounter", "battle", "monster", "shop", "treasure", "item", "spell", "map", "player-map", "race", "caste", "icon", "picture", "sound", "text-resource", "option-label", "reference-string", "random-rectangle", "monster-library-entry", "documentation"]:
		%Kind.add_item(KIND_LABELS.get(kind, kind.capitalize()))
		%Kind.set_item_metadata(%Kind.item_count - 1, kind)
	for index in 3:
		%Callers.get_child(index).pressed.connect(func(): open_source_requested.emit(_preview_callers[index].duplicate(true)))
	_clear_selection()

func open_search() -> void:
	_remember_focus()
	if _suspended:
		_suspended = false
		_restore = state()
		popup_centered(size)
		refresh(int(_page.get("offset", 0)))
		return
	_mode = "search"
	_record.clear()
	_back.clear()
	_update_mode()
	popup_centered(_window_size(false))
	_query.grab_focus()
	refresh()

func open_links(record: Dictionary, direction := "incoming") -> void:
	_remember_focus()
	_record = record.duplicate(true)
	_mode = "links"
	_direction = direction
	_back.clear()
	_query.text = ""
	_update_mode()
	popup_centered(_window_size(true))
	_query.grab_focus()
	refresh()

func refresh(offset := 0, advance_work := false) -> void:
	_interaction += 1
	var trace_params: Dictionary = _trace.prepare(offset, advance_work, offset == 0 and not advance_work and _restore.is_empty()) if _mode == "links" and _direction == "trace" else {}
	_clear_selection()
	%Status.text = "Loading…"
	if _mode == "search": query_requested.emit(_query.text, ["scenario", "personal", "stock", "docs"][_scope], str(%Kind.get_item_metadata(%Kind.selected)), offset)
	else: links_requested.emit(_record, _direction, _query.text, offset, trace_params)

func next_page() -> void:
	var offset := int(_page.get("offset", 0)) + 64
	if _mode == "links" and _direction == "trace":
		_restore = state()
		var advance: bool = offset >= int(_page.get("total", 0)) and _page.get("workLimited", false)
		refresh(0 if advance else offset, advance)
	else: refresh(offset)

func set_page(page: Dictionary) -> void:
	_page = page.duplicate(true)
	_rows.clear()
	_clear_selection()
	var values: Array = page.get("items", [])
	if _mode == "links" and _direction == "trace":
		values = _trace.accept(page)
	_render_rows(values)
	var total := int(page.get("total", 0))
	var offset := int(page.get("offset", 0))
	%Status.text = "%d shown · %d matches · %d–%d%s" % [values.size(), total, offset + 1 if total > 0 else 0, mini(offset + 64, total), " · work bound reached; expand a branch" if page.get("workLimited", false) else ""]
	%Previous.disabled = offset == 0 or (_mode == "links" and _direction == "trace")
	%Next.disabled = offset + 64 >= total
	if _mode == "links" and _direction == "trace":
		%Next.disabled = offset + 64 >= total and not page.get("workLimited", false)
		%Status.text = "%d loaded · %d explored matches · %d remaining in this batch" % [values.size(), total, int(page.get("remaining", 0))]
		if page.get("workLimited", false): %Status.text += " · exploration bound reached; more branches may remain"
	%Next.text = "Load next %d of %d" % [mini(64, maxi(0, total - offset - 64)), maxi(0, total - offset - 64)] if _mode == "links" and _direction == "trace" else "Next"
	if _mode == "links" and _direction == "trace" and offset + 64 >= total and page.get("workLimited", false): %Next.text = "Continue caller exploration"
	if int(page.get("frontiers", 0)) > 0: %Status.text += " · %d depth-limited branches; select a caller to expand" % int(page.frontiers)
	if _mode == "links":
		for button in [%UsedBy, %Uses, %Trace]: button.disabled = _record.is_empty()
		%ViewFlow.disabled = str(_record.get("identity", "")).is_empty()
		if _direction == "incoming": %UsedBy.text = "Used By %d" % total
		elif _direction == "outgoing": %Uses.text = "Uses %d" % total
	if not _restore.is_empty():
		_restore_selection()

func _render_rows(values: Array) -> void:
	var root := _rows.create_item()
	for value: Dictionary in values:
		var item := _rows.create_item(root)
		item.set_text(0, preload("res://src/discovery_preview.gd").row(value, _mode == "search"))
		item.set_custom_minimum_height(64)
		item.set_metadata(0, value)
		item.set_tooltip_text(0, item.get_text(0))

func set_preview(result: Dictionary) -> void:
	_record = result.get("record", {}).duplicate(true)
	%PreviewTitle.text = preload("res://src/discovery_preview.gd").title(_record)
	%PreviewTitle.theme_type_variation = &"QuestTitle" if _record.get("kind") == "quest-flag" else &"DiscoveryTitle"
	%PreviewContext.text = "%s content · %s · ID %s" % [str(_record.get("scope", "")).capitalize(), KIND_LABELS.get(_record.get("kind"), str(_record.get("kind", "")).capitalize()), _record.get("authorId", _record.get("nativeId", ""))]
	preload("res://src/discovery_preview.gd").record_details(_detail, result)
	_preview_callers = result.get("callers", []).duplicate(true)
	for index in 3:
		var button: Button = %Callers.get_child(index)
		button.visible = index < _preview_callers.size()
		if not button.visible: continue
		var caller: Dictionary = _preview_callers[index]
		button.text = "%s\n%s → %s" % [caller.sourceLabel, caller.meaning, caller.targetLabel]
		button.tooltip_text = preload("res://src/source_navigation.gd").unavailable_reason(caller)
		button.disabled = not button.tooltip_text.is_empty()
	%OpenRecord.disabled = _record.is_empty()
	%ViewFlow.disabled = _record.is_empty() or str(_record.get("identity", "")).is_empty()
	%SearchUsedBy.text = "Used By %d" % int(result.get("usedBy", 0))
	%SearchUses.text = "Uses %d" % int(result.get("uses", 0))
	for button in [%UsedBy, %Uses, %Trace, %SearchUsedBy, %SearchUses]: button.disabled = _record.is_empty() or _record.get("scope", "") in ["docs", "personal"] or _record.get("kind", "") in ["monster-library-entry", "reference-string"]
	if _record.get("kind", "") == "reference-string": _detail.add_text("Text groups contain individual entries. Group-level caller coverage is not available.\n")

func show_failure(message: String) -> void:
	_trace.reset()
	_page = {}
	_rows.clear()
	_clear_selection()
	%Status.text = message + " · Refresh to retry the read."
	%Previous.disabled = true
	%Next.disabled = true

func refresh_retaining_state() -> void:
	_restore = state()
	refresh(int(_page.get("offset", 0)))

func show_links(direction: String) -> void:
	if _record.is_empty(): return
	_back.append(state())
	_mode = "links"
	_direction = direction
	_query.text = ""
	_update_mode()
	popup_centered(_window_size(true))
	refresh()

func state() -> Dictionary:
	return {"mode": _mode, "record": _record.duplicate(true), "direction": _direction, "query": _query.text, "offset": _page.get("offset", 0), "scope": _scope, "kind": %Kind.selected, "selection": _selection_key(), "scroll": _rows.get_scroll(), "focus": _query.has_focus(), "trace": _trace.state()}

func interaction_token() -> int:
	return _interaction

func suspend_for_navigation() -> void:
	_timer.stop()
	_suspended = true
	hide()

func resume_after_canceled_navigation() -> void:
	if not _suspended: return
	_suspended = false
	popup_centered(size)
	_rows.grab_focus()

func navigation_failed(message: String) -> void:
	if not _suspended: return
	resume_after_canceled_navigation()
	%Status.text = message + " · Open exact source retries only the read."

func _selection_key() -> String:
	return str(_selection.get("record", {}).get("identity", "")) if _mode == "search" else str(_selection.get("occurrence", "")) + str(_selection.get("traceKey", ""))

func _restore_selection() -> void:
	var item := _rows.get_root().get_first_child()
	while item != null:
		var value: Dictionary = item.get_metadata(0)
		var key := str(value.get("record", {}).get("identity", "")) if _mode == "search" else str(value.get("link", value).get("occurrence", "")) + JSON.stringify([value.get("path", []), value.get("positions", []), value.get("contexts", [])])
		if key == str(_restore.get("selection", "")):
			item.select(0)
			break
		item = item.get_next()
	preload("res://src/tree_scroll_state.gd").restore(_rows, _restore.get("scroll", Vector2.ZERO))
	if _restore.get("focus", false): _query.grab_focus()
	else: _rows.grab_focus()
	_restore.clear()

func go_back() -> void:
	if _back.is_empty(): return
	var prior: Dictionary = _back.pop_back()
	_restore = prior.duplicate(true)
	_trace.restore(prior.get("trace", {}))
	_mode = prior.mode
	_record = prior.record
	_direction = prior.direction
	_query.text = prior.query
	_scope = prior.scope
	%Scope.get_child(_scope).button_pressed = true
	%Kind.selected = prior.kind
	_update_mode()
	popup_centered(_window_size(_mode == "links"))
	refresh(int(prior.offset))

func close_view() -> void:
	_interaction += 1
	_timer.stop()
	_suspended = false
	hide()
	closed.emit()
	if _focus != null and _focus.get_ref() != null: _focus.get_ref().grab_focus()

func _selected() -> void:
	_interaction += 1
	var item := _rows.get_selected()
	if item == null: return
	if _mode == "search": _clear_selection()
	_selection = item.get_metadata(0)
	if _mode == "search":
		_record.clear()
		%OpenRecord.disabled = true
		preview_requested.emit(str(_selection.record.identity), str(_selection.record.scope), _query.text)
	else:
		var trace_metadata := _selection.duplicate(true)
		_selection = _selection.get("link", _selection).duplicate(true)
		_selection["traceKey"] = JSON.stringify([trace_metadata.get("path", []), trace_metadata.get("positions", []), trace_metadata.get("contexts", [])])
		_selection["tracePath"] = trace_metadata.get("path", []).duplicate()
		_selection["cycle"] = trace_metadata.get("cycle", false)
		_selection["depthLimited"] = trace_metadata.get("depthLimited", false)
		_selection["callerPosition"] = trace_metadata.get("callerPosition")
		_selection["tracePositions"] = trace_metadata.get("positions", []).duplicate()
		_selection["traceContexts"] = trace_metadata.get("contexts", []).duplicate()
		%PreviewTitle.text = str(_selection.sourceLabel)
		%PreviewContext.text = preload("res://src/discovery_preview.gd").field_label(str(_selection.field))
		%PreviewContext.tooltip_text = str(_selection.source)
		preload("res://src/discovery_preview.gd").link_details(_detail, _selection)
		var reason := preload("res://src/source_navigation.gd").unavailable_reason(_selection)
		%OpenSource.disabled = not reason.is_empty()
		%OpenSource.tooltip_text = reason
		if not reason.is_empty(): _detail.add_text("\n" + reason + "\n")
		%OpenTarget.disabled = str(_selection.get("resolution", "")) not in ["resolved", "stock-fallback"] or (_selection.get("targetIdentity") == null and _selection.targetKind != "monster")
		%OpenTarget.text = "Choose monster variant…" if _selection.targetKind == "monster" and _selection.get("targetIdentity") == null else "Open resolved target"
		%TraceBranch.disabled = false
		%TraceBranch.text = "Jump to cycle source" if _selection.cycle else ("Expand this depth frontier" if _selection.depthLimited else "Trace this caller")

func _accept() -> void:
	if _selection.is_empty(): return
	if _mode == "search" and not _record.is_empty(): open_record_requested.emit(_record)
	elif _mode == "links" and not %OpenSource.disabled: open_source_requested.emit(_selection)

func _clear_selection() -> void:
	_selection = {}
	_preview_callers.clear()
	for button in %Callers.get_children(): button.hide()
	%PreviewTitle.text = ""
	%PreviewContext.text = ""
	if _mode == "search": _record.clear()
	_detail.clear()
	_detail.add_text("No result selected.")
	%SearchUsedBy.text = "Used By"
	%SearchUses.text = "Uses"
	%UsedBy.text = "Used By"
	%Uses.text = "Uses"
	for button in [%ViewFlow, %OpenRecord, %OpenSource, %OpenTarget, %TraceBranch, %UsedBy, %Uses, %Trace, %SearchUsedBy, %SearchUses]: button.disabled = true

func _update_mode() -> void:
	%ViewFlow.disabled = _record.is_empty() or str(_record.get("identity", "")).is_empty()
	%OpenRecord.disabled = _record.is_empty() or _record.get("linkOnly", false)
	title = "Scenario Search" if _mode == "search" else "Links · " + preload("res://src/discovery_preview.gd").title(_record)
	%Heading.text = "Search scenario" if _mode == "search" else title
	%Scope.visible = _mode == "search"
	%Kind.visible = _mode == "search"
	%LinkActions.visible = _mode == "links"
	%SearchLinks.visible = _mode == "search"
	%FollowHeading.visible = _mode == "search"
	%Callers.visible = _mode == "search"
	for pair in [[%UsedBy, "incoming"], [%Uses, "outgoing"], [%Trace, "trace"]]: pair[0].set_pressed_no_signal(_direction == pair[1])
	%OpenSource.visible = _mode == "links"
	%OpenTarget.visible = _mode == "links"
	%TraceBranch.visible = _mode == "links"
	%Back.disabled = _back.is_empty()

func _remember_focus() -> void:
	var focus := get_parent().get_viewport().gui_get_focus_owner()
	_focus = weakref(focus) if focus != null else null

func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		close_view()
		get_viewport().set_input_as_handled()

func _query_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		_query.accept_event()
		close_view()

func _select_scope(index: int) -> void:
	_scope = index
	refresh()

func _window_size(links: bool) -> Vector2i:
	var viewport := get_parent().get_viewport().get_visible_rect().size
	return Vector2i(viewport.x - 110, viewport.y - 100) if links else Vector2i(minf(1460, viewport.x - 300), viewport.y - 160)

func follow_caller(record: Dictionary) -> void:
	_back.append(state())
	_record = record.duplicate(true)
	_direction = "trace"
	_mode = "links"
	_query.text = ""
	_update_mode()
	refresh()

func choose_record_variant(kind: String, id: String) -> void:
	_back.append(state())
	_mode = "search"
	_scope = 0
	%Scope.get_child(0).button_pressed = true
	for index in %Kind.item_count:
		if %Kind.get_item_metadata(index) == kind: %Kind.selected = index
	_query.text = kind + " " + id
	_update_mode()
	popup_centered(_window_size(false))
	refresh()

func apply_theme(mode := "dark", density := "balanced") -> void:
	var controls = preload("res://src/discovery_theme.gd").new()
	controls.mode = mode; controls.density = density
	theme = controls

func _query_changed(_text: String) -> void:
	_interaction += 1
	_clear_selection()
	_timer.start()
