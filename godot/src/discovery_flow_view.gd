extends Window

signal action_requested(action: String)
signal node_requested(id: String)
signal closed
var model = preload("res://src/discovery_flow_state.gd").new()
var suspended := false
var stale := false
var loading := false
var selection_serial := 0
var _focus: WeakRef
var _connections: Array = []
@onready var graph = %Graph

func _ready() -> void:
	close_requested.connect(close_view)
	%Close.pressed.connect(close_view)
	for pair in [[%Back,"back"], [%FocusHere,"focus"], [%Refresh,"refresh"], [%Upstream,"upstream"], [%Downstream,"downstream"], [%Collapse,"collapse"], [%Retry,"retry"], [%OpenRecord,"open-record"], [%OpenSource,"open-source"]]:
		pair[0].pressed.connect(func(): action_requested.emit(pair[1]))
	for button in [%Calls, %State, %References]: button.toggled.connect(func(_enabled): action_requested.emit("filters"))
	%Fit.pressed.connect(graph.fit_content)
	%Recenter.pressed.connect(func(): graph.recenter(root_id()))
	%ZoomIn.pressed.connect(func(): graph.zoom = minf(graph.zoom_max, graph.zoom * 1.2))
	%ZoomOut.pressed.connect(func(): graph.zoom = maxf(graph.zoom_min, graph.zoom / 1.2))
	%ZoomReset.pressed.connect(func(): graph.zoom = 1.0)
	%ZoomReset.tooltip_text = "Reset zoom to 100%"
	graph.record_selected.connect(select_node)
	graph.occurrence_selected.connect(select_edge)
	%Connections.item_selected.connect(_choose_connection)
	%PreviousEdge.pressed.connect(_move_edge.bind(-1))
	%NextEdge.pressed.connect(_move_edge.bind(1))
	%Retry.visible = false
	apply_theme()

func apply_theme(mode := "dark", density := "balanced") -> void:
	var controls = preload("res://src/discovery_flow_theme.gd").new()
	controls.mode = mode
	controls.density = density
	theme = controls
	if not is_node_ready(): return
	$Background.add_theme_stylebox_override("panel", controls.make_panel_style(Color(controls.PALETTES[mode][0]), Color(controls.PALETTES[mode][2]), 1, 0, 0, 0))
	for pair in [[%Calls, controls.ACCENTS[mode][0]], [%State, controls.ACCENTS[mode][2]], [%References, controls.PALETTES[mode][4]]]:
		for state in ["font_color", "font_pressed_color", "font_hover_color", "font_hover_pressed_color"]: pair[0].add_theme_color_override(state, Color(pair[1]))
	graph.theme = controls
	graph.add_theme_stylebox_override("panel", controls.make_panel_style(Color(controls.PALETTES[mode][0]), Color(controls.PALETTES[mode][2]), 0, 0, 0, 0))
	for id in graph.cards: graph.style_card(graph.cards[id], model.nodes[id])
	%Notice.add_theme_color_override("font_color", Color(controls.ACCENTS[mode][3]))
	graph.queue_redraw()

func present() -> void:
	if not visible:
		var focused := get_parent().get_viewport().gui_get_focus_owner()
		if focused != null: _focus = weakref(focused)
	var available := get_parent().get_viewport().get_visible_rect().size
	popup_centered(Vector2i(maxf(1080, available.x - 64), maxf(680, available.y - 64)))
	suspended = false
	%Close.grab_focus()

func render(back_available: bool) -> void:
	graph.display(model)
	%UpstreamCaption.text = "UPSTREAM · " + ("EXPANDED" if model.groups.values().any(func(group): return group.direction == "upstream") else "2 LEVELS")
	%DownstreamCaption.text = "DOWNSTREAM · " + ("EXPANDED" if model.groups.values().any(func(group): return group.direction == "downstream") else "2 LEVELS")
	%Back.disabled = not back_available or loading
	for pair in [[%Calls,"calls"], [%State,"state"], [%References,"references"]]: pair[0].set_pressed_no_signal(pair[1] in model.categories)
	var root: Dictionary = model.nodes.get(root_id(), {})
	%Heading.text = "View flow · " + (graph.caption(root) if not root.is_empty() else str(model.root.get("identity", "")))
	%Status.text = "%d nodes · %d connections · %s" % [model.nodes.size(), model.edges.size(), "View limit reached; focus a branch to continue" if model.limited else "Requested levels loaded; expand a record to explore further"]
	if model.nodes.size() == 1 and model.edges.is_empty(): %Status.text = "No mapped relationships for this record and these filters."
	if loading: %Status.text += " · Loading…"
	_show_selection()

func select_node(id: String) -> void:
	if not model.nodes.has(id): return
	selection_serial += 1
	model.selected = id
	model.edge = ""
	graph.highlight_selection()
	_show_selection()
	node_requested.emit(id)

func select_edge(id: String) -> void:
	if not model.edges.has(id): return
	selection_serial += 1
	if model.selected not in [model.edges[id].source, model.edges[id].target]: model.selected = model.edges[id].source
	model.edge = id
	graph.highlight_selection()
	_show_selection()

func _show_selection() -> void:
	var row: Dictionary = model.nodes.get(model.selected, {})
	var enabled := not row.is_empty() and not stale and not loading
	%Selected.text = "Selected: " + (graph.caption(row) if not row.is_empty() else "—")
	%FocusHere.disabled = not enabled or model.selected == root_id()
	%Upstream.disabled = not enabled
	%Downstream.disabled = not enabled
	%Collapse.disabled = not enabled or not model.can_collapse(model.selected)
	_connections = model.related()
	%Connections.clear()
	%Connections.add_item("Record details")
	var selection := 0
	for index in _connections.size():
		var item: Dictionary = _connections[index]
		%Connections.add_item("%d · %s · %s" % [index + 1, item.reference.meaning, item.reference.sourceLabel])
		if item.id == model.edge: selection = index + 1
	%Connections.select(selection)
	%ConnectionCount.text = "%d / %d" % [selection, _connections.size()] if selection > 0 else "%d connections" % _connections.size()
	%PreviousEdge.disabled = selection <= 1
	%NextEdge.disabled = selection >= _connections.size()
	%Detail.clear()
	%OpenSource.disabled = true
	%OpenRecord.disabled = not enabled or not row.get("navigable", false)
	%OpenRecord.text = "Open in editor"
	if model.edges.has(model.edge): _show_edge(model.edges[model.edge], enabled)
	else: _show_node(row)

func _show_node(row: Dictionary) -> void:
	%DetailHeading.text = "SELECTED RECORD"
	%SelectedTitle.text = str(row.get("label", "Select a record"))
	if row.is_empty(): return
	_field("Kind", str(row.kind).capitalize())
	_field("Scope", str(row.selection.scope).capitalize())
	_field("Availability", str(row.resolution).capitalize())
	if row.selection.get("entryPosition") != null: _field("Entry step", str(int(row.selection.entryPosition) + 1))
	%DetailHint.text = str(row.availabilityReason) if not row.navigable else "Select a connection for its exact step and owning field."

func _show_edge(edge: Dictionary, enabled: bool) -> void:
	var link: Dictionary = edge.reference
	%DetailHeading.text = "SELECTED CONNECTION"
	%SelectedTitle.text = "%s → %s" % [graph.caption(model.nodes[edge.source]), graph.caption(model.nodes[edge.target])]
	_field("Meaning", str(link.meaning))
	_field("Source", str(link.sourceLabel))
	_field("Field", preload("res://src/discovery_preview.gd").field_label(str(link.field)))
	for key in ["condition", "effect", "branch"]:
		if not str(edge.details.get(key, "")).is_empty(): _field(key.capitalize(), str(edge.details[key]))
	_field("Destination", str(link.targetLabel))
	_field("Resolution", str(link.resolution).capitalize())
	var reason := preload("res://src/source_navigation.gd").unavailable_reason(link)
	%OpenSource.disabled = not enabled or not reason.is_empty()
	%OpenSource.tooltip_text = reason
	var target: Dictionary = model.nodes[edge.target]
	%OpenRecord.disabled = not enabled or not target.navigable
	%OpenRecord.text = "Open " + graph.caption(target)
	%DetailHint.text = "This state relationship does not call the checking action or establish execution order." if str(edge.relationship).begins_with("state-") else "Possible authored relationship; runtime conditions determine whether it runs."
	if not target.navigable: %DetailHint.text = str(target.availabilityReason) + " Open the owning step to inspect or repair it."

func _field(label: String, text: String) -> void:
	%Detail.push_color(Color(theme.PALETTES[theme.mode][4]))
	%Detail.add_text(label + "\n")
	%Detail.pop()
	%Detail.add_text(text + "\n\n")

func show_preview(result: Dictionary, id: String) -> void:
	if model.selected != id or not model.edge.is_empty(): return
	preload("res://src/discovery_preview.gd").record_details(%Detail, result)

func _choose_connection(index: int) -> void:
	if index == 0: select_node(model.selected)
	else: select_edge(_connections[index - 1].id)

func _move_edge(direction: int) -> void:
	var next := clampi(%Connections.selected + direction, 1, _connections.size())
	if not _connections.is_empty(): select_edge(_connections[next - 1].id)

func filter_categories() -> Array:
	var result: Array = []
	for pair in [[%Calls,"calls"], [%State,"state"], [%References,"references"]]:
		if pair[0].button_pressed: result.append(pair[1])
	return result

func root_id() -> String:
	for id in model.nodes:
		if model.same_selection(model.nodes[id].selection, model.root): return id
	return ""

func show_failure(message: String, retry_available := true) -> void:
	loading = false
	%Status.text = message + " · Completed branches are retained."
	%Retry.visible = retry_available
	_show_selection()

func mark_stale(message := "Project changed. Refresh before expanding or opening records.") -> void:
	stale = true
	%Notice.text = message
	%Retry.visible = false
	_show_selection()

func suspend_for_navigation() -> void:
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
	graph.save_positions()
	suspended = false
	hide()
	closed.emit()
	if _focus != null and is_instance_valid(_focus.get_ref()): _focus.get_ref().grab_focus()

func _input(event: InputEvent) -> void:
	if visible and event.is_action_pressed("ui_cancel"):
		close_view()
		set_input_as_handled()

func _process(_delta: float) -> void:
	if visible: %ZoomReset.text = "%d%%" % roundi(graph.zoom * 100)
