extends Window

signal action_requested(action: String)
signal node_requested(id: String)
signal caller_requested(selection: Dictionary)
signal candidate_requested(selection: Dictionary)
signal closed
var model = preload("res://src/discovery_flow_state.gd").new()
var suspended := false
var stale := false
var loading := false
var selection_serial := 0
var _focus: WeakRef
var _helper_id := ""
var _helper_pinned := false
var _hover_time := 0.0
var _hover_anchor := Vector2.ZERO
var _helper_text := ""
var _menu_target := ""
var _themes: Dictionary = {}
const DEPTHS := [1, 2, 3, 4, 6, 8, 16, 32]
const DIRECTIONS := ["upstream", "downstream", "both"]
@onready var graph = %Graph
@onready var inspector = %Inspector

func _ready() -> void:
	close_requested.connect(close_view)
	%Close.pressed.connect(close_view)
	for pair in [[%Back,"back"], [%FocusHere,"focus"], [%Refresh,"refresh"], [%Upstream,"upstream"], [%Downstream,"downstream"], [%Collapse,"collapse"], [%Retry,"retry"]]:
		pair[0].pressed.connect(func(): action_requested.emit(pair[1]))
	for button in [%Calls, %Checks, %Changes, %Uses, %Eligibility]: button.toggled.connect(func(_enabled): action_requested.emit("filters"))
	for depth in DEPTHS: %Depth.add_item("Depth %d" % depth)
	for direction in DIRECTIONS: %Direction.add_item("Both directions" if direction == "both" else str(direction).capitalize())
	%Depth.item_selected.connect(func(_index): action_requested.emit("query"))
	%Direction.item_selected.connect(func(_index): action_requested.emit("query"))
	%Fit.pressed.connect(graph.fit_content)
	%Recenter.pressed.connect(func(): graph.recenter(root_id()))
	%ZoomIn.pressed.connect(func(): graph.zoom = minf(graph.zoom_max, graph.zoom * 1.2))
	%ZoomOut.pressed.connect(func(): graph.zoom = maxf(graph.zoom_min, graph.zoom / 1.2))
	%ZoomReset.pressed.connect(func(): graph.zoom = 1.0)
	%Find.text_changed.connect(_find)
	%Find.text_submitted.connect(func(_text): _find_select(0))
	%List.item_activated.connect(_find_select)
	%List.item_selected.connect(_find_select)
	%Symbols.pressed.connect(_symbols)
	%LockNodes.toggled.connect(graph.set_nodes_locked)
	graph.record_selected.connect(select_node)
	graph.occurrences_requested.connect(select_occurrences)
	graph.helper_requested.connect(_queue_helper)
	graph.helper_dismissed.connect(_dismiss_hover)
	graph.helper_focus_changed.connect(_dismiss_helper)
	graph.connection_help_requested.connect(_connection_help)
	graph.menu_requested.connect(_open_graph_menu)
	graph.members_requested.connect(_show_members)
	graph.display_changed.connect(_refresh_status)
	inspector.action_requested.connect(func(action): action_requested.emit(action))
	inspector.step_selected.connect(select_step)
	inspector.field_selected.connect(select_step_field)
	inspector.occurrence_selected.connect(select_edge)
	inspector.inspect_requested.connect(reveal_node)
	inspector.caller_requested.connect(func(selection): caller_requested.emit(selection))
	inspector.candidate_requested.connect(func(selection): candidate_requested.emit(selection))
	inspector.selection_changed.connect(func(): selection_serial += 1; graph.highlight_selection())
	inspector.step_help_requested.connect(_step_help)
	inspector.helper_dismissed.connect(_dismiss_hover)
	inspector.helper_focus_changed.connect(_dismiss_helper)
	%GraphActions.id_pressed.connect(_graph_menu_action)
	%Retry.visible = false
	apply_theme()

func apply_theme(mode := "dark", density := "balanced") -> void:
	var key := mode + ":" + density
	if not _themes.has(key):
		var created = preload("res://src/discovery_flow_theme.gd").new()
		created.mode = mode
		created.density = density
		_themes[key] = created
	var controls = _themes[key]
	theme = controls
	if not is_node_ready(): return
	$Background.add_theme_stylebox_override("panel", controls.make_panel_style(Color(controls.PALETTES[mode][0]), Color(controls.PALETTES[mode][2]), 1, 0, 0, 0))
	graph.theme = controls
	inspector.theme = controls
	graph.add_theme_stylebox_override("panel", controls.make_panel_style(Color(controls.PALETTES[mode][0]), Color(controls.PALETTES[mode][2]), 0, 0, 0, 0))
	for panel in [%Helper, %FindResults]: panel.add_theme_stylebox_override("panel", controls.make_panel_style(Color(controls.PALETTES[mode][1]), Color(controls.PALETTES[mode][6]), 1, 12, 12, 0))
	graph.refresh_styles()
	%Legend.set_meta("flow_theme", controls)
	%Legend.queue_redraw()
	graph.queue_redraw()

func present() -> void:
	if not visible:
		var focused := get_parent().get_viewport().gui_get_focus_owner()
		if focused != null: _focus = weakref(focused)
	var available := get_parent().get_viewport().get_visible_rect().size
	popup_centered(Vector2i(maxf(1080, available.x - 48), maxf(680, available.y - 48)))
	inspector.custom_minimum_size.x = 440 if available.x >= 1900 else 416
	suspended = false
	%Close.grab_focus()

func render(back_available: bool) -> void:
	graph.display(model)
	%LockNodes.set_pressed_no_signal(model.nodes_locked)
	%UpstreamCaption.text = "UPSTREAM · %d LEVELS" % model.depth
	%DownstreamCaption.text = "DOWNSTREAM · %d LEVELS" % model.depth
	%Back.disabled = not back_available or loading
	%Refresh.text = "Cancel" if loading else "Refresh"
	for pair in [[%Calls,"calls"], [%Checks,"checks"], [%Changes,"changes"], [%Uses,"uses"], [%Eligibility,"eligibility"]]: pair[0].set_pressed_no_signal(pair[1] in model.categories)
	%Depth.select(maxi(0, DEPTHS.find(model.depth)))
	%Direction.select(maxi(0, DIRECTIONS.find(model.direction)))
	for control in [%Depth, %Direction, %Calls, %Checks, %Changes, %Uses, %Eligibility]: control.disabled = loading
	var root: Dictionary = model.nodes.get(root_id(), {})
	%Heading.text = "View Flow  /  " + (graph.caption(root) if not root.is_empty() else str(model.root.get("identity", "")))
	_refresh_status()
	_show_selection()

func _refresh_status() -> void:
	%Status.text = "%d loaded · %d relationships · %d grouped" % [model.nodes.size(), model.edges.size(), graph.grouped_count()]
	if model.limited: %Status.text += " · View limit reached; focus a branch to continue"
	elif model.nodes.size() == 1 and model.edges.is_empty(): %Status.text += " · No mapped relationships for these filters"
	if loading: %Status.text += " · Loading…"

func select_node(id: String) -> void:
	if not model.nodes.has(id): return
	selection_serial += 1
	model.selected = id
	model.steps_expanded = false
	model.edge = ""
	model.source_edge = ""
	model.step = -1
	model.inspector_tab = "steps" if model.summaries.get(id, {}).get("program", false) else "details"
	inspector.occurrence_filter.clear()
	graph.highlight_selection()
	_show_selection()
	node_requested.emit(id)

func reveal_node(id: String) -> void:
	if not model.nodes.has(id): return
	var owning_occurrence: String = model.edge
	if owning_occurrence.is_empty() and model.step >= 0:
		var related: Array = model.selected_step_edges()
		if related.size() == 1: owning_occurrence = related[0].id
	if graph.grouping.representatives.get(id, id) != id: model.revealed[id] = true
	graph.display(model)
	select_node(id)
	model.source_edge = owning_occurrence
	_show_selection()
	graph.recenter(id)

func select_step(slot: int) -> void:
	selection_serial += 1
	model.step = slot
	model.steps_expanded = false
	model.edge = ""
	model.inspector_tab = "steps"
	graph.highlight_selection()
	_show_selection()

func select_occurrences(ids: Array) -> void:
	selection_serial += 1
	inspector.occurrence_filter = ids.duplicate()
	model.inspector_tab = "connections"
	model.step = -1
	model.edge = ""
	model.source_edge = ""
	if ids.size() == 1: select_edge(str(ids[0]))
	else: _show_selection()

func select_step_field(id: String) -> void:
	if not model.selected_step_edges().any(func(occurrence): return occurrence.id == id): return
	model.edge = id
	graph.highlight_selection()
	_show_selection()

func select_edge(id: String) -> void:
	if not model.edges.has(id): return
	selection_serial += 1
	if model.selected not in [model.edges[id].source, model.edges[id].target]: model.selected = model.edges[id].source
	model.edge = id
	model.step = -1
	model.inspector_tab = "connections"
	graph.highlight_selection()
	_show_selection()

func _show_selection() -> void:
	var row: Dictionary = model.nodes.get(model.selected, {})
	var enabled := not row.is_empty() and not stale and not loading
	%Selected.text = "Selection: " + (graph.caption(row) if not row.is_empty() else "—")
	%FocusHere.disabled = not enabled or model.selected == root_id()
	for pair in [[%Upstream,"upstream"], [%Downstream,"downstream"]]:
		pair[0].disabled = not enabled or model.limited or not _has_frontier(pair[1])
		pair[0].tooltip_text = "Focus a branch to continue beyond this view's limit." if model.limited else "Load one more level from the selected record."
	%Collapse.disabled = not enabled or not model.can_collapse(model.selected)
	inspector.present(model, row, enabled)

func _has_frontier(direction: String, id := "") -> bool:
	if id.is_empty(): id = model.selected
	for group: Dictionary in model.groups.values():
		for frontier: Dictionary in group.frontiers:
			if frontier.nodeId == id and frontier.direction == direction: return true
	return false

func show_preview(result: Dictionary, id: String) -> void:
	if model.selected == id and model.edge.is_empty(): inspector.show_preview(result)

func filter_categories() -> Array:
	var result: Array = []
	for pair in [[%Calls,"calls"], [%Checks,"checks"], [%Changes,"changes"], [%Uses,"uses"], [%Eligibility,"eligibility"]]:
		if pair[0].button_pressed: result.append(pair[1])
	return result

func query_depth() -> int: return DEPTHS[%Depth.selected]
func query_direction() -> String: return DIRECTIONS[%Direction.selected]

func root_id() -> String:
	for id in model.nodes:
		if model.same_selection(model.nodes[id].selection, model.root): return id
	return ""

func _find(query: String) -> void:
	%List.clear()
	%FindResults.visible = not query.is_empty()
	for id in model.nodes:
		var row: Dictionary = model.nodes[id]
		var haystack: String = graph.caption(row) + " " + str(row.label) + " " + str(row.selection.identity) + " " + str(model.summaries.get(id, {}).get("summary", ""))
		if query.to_lower() not in haystack.to_lower(): continue
		var index: int = %List.add_item(graph.caption(row) + " · " + str(row.label))
		%List.set_item_metadata(index, id)
	if %List.item_count == 0: %List.add_item("No matches in %d loaded records" % model.nodes.size())

func _find_select(index: int) -> void:
	if index >= %List.item_count: return
	var id = %List.get_item_metadata(index)
	if id == null: return
	%FindResults.hide()
	reveal_node(str(id))
	graph.focus_record(str(id))

func _show_members(ids: Array) -> void:
	_dismiss_helper()
	%List.clear()
	for id in ids:
		var index: int = %List.add_item(graph.caption(model.nodes[id]) + " · " + str(model.summaries.get(id, {}).get("summary", model.nodes[id].label)))
		%List.set_item_metadata(index, id)
	%FindResults.show()
	%List.grab_focus()

func _dismiss_find() -> void:
	%FindResults.hide()
	%Find.clear()

func _queue_helper(id: String, anchor: Vector2, pinned: bool) -> void:
	if _helper_pinned and not pinned: return
	_helper_id = id
	_helper_text = ""
	_hover_time = 0.0
	_hover_anchor = anchor
	_helper_pinned = pinned
	%Helper.hide()
	if pinned: _show_helper()

func _dismiss_hover() -> void:
	if not _helper_pinned: _dismiss_helper()

func _dismiss_helper() -> void:
	_helper_id = ""; _helper_text = ""; _helper_pinned = false
	%Helper.hide()

func _step_help(step: Dictionary, anchor: Vector2, pinned: bool) -> void:
	_queue_text_help("STEP %d · %s\n%s\n%s\n%s" % [int(step.position) + 1, step.title, step.summary, step.condition, step.warning], anchor, pinned)

func _connection_help(ids: Array, anchor: Vector2) -> void:
	var lines := PackedStringArray(["%d loaded occurrences" % ids.size()])
	for id in ids.slice(0, 4):
		var link: Dictionary = model.edges[id].reference
		lines.append(str(link.sourceLabel) + " → " + str(link.targetLabel))
		lines.append(str(link.meaning))
	if ids.size() > 4: lines.append("Open Connections to inspect every occurrence.")
	_queue_text_help("\n".join(lines), anchor, false)

func _queue_text_help(text: String, anchor: Vector2, pinned: bool) -> void:
	if _helper_pinned and not pinned: return
	_helper_id = ""
	_helper_text = text
	_hover_anchor = anchor
	_hover_time = 0.0
	_helper_pinned = pinned
	%Helper.hide()
	if pinned: _show_helper()

func _show_helper() -> void:
	%Text.text = _helper_text
	if model.nodes.has(_helper_id):
		var row: Dictionary = model.nodes[_helper_id]
		var summary: Dictionary = model.summaries.get(_helper_id, {})
		%Text.text = graph.caption(row) + "\n" + str(summary.get("summary", row.label))
		var excerpt: String = str(summary.get("excerpt", ""))
		if not excerpt.is_empty():
			var clipped := excerpt.length() > 480 or bool(summary.get("excerptTruncated", false))
			%Text.text += "\n" + ("Text excerpt: " if clipped else "Text: ") + excerpt.left(480) + ("…" if clipped else "")
		if not row.navigable: %Text.text += "\n! " + str(row.availabilityReason)
	%Text.text += "\nPossible authored behavior · F1 pins help · Esc dismisses"
	%Helper.size = Vector2(400, 0)
	%Helper.position = Vector2(clampf(_hover_anchor.x, 8, size.x - 408), clampf(_hover_anchor.y + 12, 8, size.y - %Helper.get_combined_minimum_size().y - 8))
	if graph.cards.has(_helper_id):
		var card = graph.cards[_helper_id]
		var bounds := Rect2(card.global_position, card.size * graph.zoom)
		var height: float = %Helper.get_combined_minimum_size().y
		var left: float = clampf(bounds.position.x, 8, graph.size.x - 408)
		var top: float = bounds.end.y + 12
		if top + height > graph.global_position.y + graph.size.y: top = bounds.position.y - height - 12
		%Helper.position = Vector2(left, maxf(8, top))
	%Helper.show()

func _symbols() -> void:
	_helper_pinned = true
	_helper_id = ""
	%Text.text = "SYMBOLS & KEY\n\n→ Calls: possible program transfer\n◇ Checks: reads state; no execution order implied\n■ Changes: mutates state\n·· Uses: content or resource reference\n◇ Eligibility: enables a possible route\n\n! + hatch: unavailable target or unknown instruction\nFilled card: selection · Outline: mapped step target\nDotted ring: keyboard focus\nROOT: query origin · Groups: loaded members only\n\nArrows move focus · Enter selects · F1 shows help"
	%Helper.position = Vector2(maxf(8, size.x - 448), 145)
	%Helper.size = Vector2(420, 0)
	%Helper.show()

func _open_graph_menu(id: String, anchor: Vector2) -> void:
	_menu_target = id
	%GraphActions.clear()
	if graph.grouping.groups.has(id) or model.revealed.has(id): %GraphActions.add_item("Show members" if graph.grouping.groups.has(id) else "Collapse member", 0)
	if model.nodes.has(id):
		for pair in [["Select record",1], ["Focus here",2], ["Expand upstream",3], ["Expand downstream",4], ["Open record…",5]]: %GraphActions.add_item(pair[0], pair[1])
		for action in [2, 3, 4, 5]:
			var disabled: bool = stale or loading or (action == 5 and not model.nodes[id].navigable) or (action in [3, 4] and model.limited)
			if action == 2: disabled = disabled or id == root_id()
			if action in [3, 4]: disabled = disabled or not _has_frontier("upstream" if action == 3 else "downstream", id)
			%GraphActions.set_item_disabled(%GraphActions.get_item_index(action), disabled)
	%GraphActions.position = Vector2i(anchor)
	%GraphActions.popup()

func _graph_menu_action(id: int) -> void:
	if id == 0: graph.disclose(_menu_target); return
	select_node(_menu_target)
	if id > 1: action_requested.emit({2:"focus",3:"upstream",4:"downstream",5:"open-record"}[id])

func show_failure(message: String, retry_available := true) -> void:
	loading = false
	%Status.text = message + (" · Previous view retained." if not model.nodes.is_empty() else " · No view loaded.")
	%Retry.visible = retry_available
	_show_selection()

func mark_stale(message := "Project changed. Refresh before expanding or opening records.") -> void:
	stale = true
	%Notice.text = message
	%Retry.visible = false
	_show_selection()

func suspend_for_navigation() -> void:
	_dismiss_find()
	graph.save_positions()
	suspended = true
	hide()

func resume_after_canceled_navigation() -> void:
	if suspended: present()

func navigation_failed(message: String) -> void:
	if not suspended: return
	present()
	show_failure(message, false)

func close_view() -> void:
	_dismiss_find()
	graph.save_positions()
	suspended = false
	hide()
	closed.emit()
	if _focus != null and is_instance_valid(_focus.get_ref()): _focus.get_ref().grab_focus()

func _input(event: InputEvent) -> void:
	if not visible: return
	if event is InputEventMouseButton and event.pressed and %FindResults.visible:
		if not %FindResults.get_global_rect().has_point(event.position) and not %Find.get_global_rect().has_point(event.position):
			_dismiss_find()
	if not event.is_action_pressed("ui_cancel"): return
	if %FindResults.visible:
		_dismiss_find()
		_dismiss_helper()
		%Find.grab_focus()
	elif %Helper.visible:
		_dismiss_helper()
	else: close_view()
	set_input_as_handled()

func _process(delta: float) -> void:
	if not visible: return
	%ZoomReset.text = "%d%%" % roundi(graph.zoom * 100)
	if (not _helper_id.is_empty() or not _helper_text.is_empty()) and not %Helper.visible and not _helper_pinned:
		_hover_time += delta
		if _hover_time >= 0.35: _show_helper()
