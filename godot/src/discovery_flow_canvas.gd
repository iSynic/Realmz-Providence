extends GraphEdit

signal record_selected(id: String)
signal occurrences_requested(ids: Array)
signal helper_requested(id: String, anchor: Vector2, pinned: bool)
signal helper_dismissed
signal helper_focus_changed
signal connection_help_requested(ids: Array, anchor: Vector2)
signal menu_requested(id: String, anchor: Vector2)
signal members_requested(ids: Array)
signal display_changed
var model
var cards: Dictionary = {}
var grouping = preload("res://src/discovery_flow_groups.gd").new()
var _paths: Dictionary = {}
var _display_edges: Dictionary = {}
var _last_view := ""
var _focused := ""
var _layout_signature := ""
var _display_positions: Dictionary = {}
var _hover_edge := ""

func _ready() -> void:
	end_node_move.connect(_save_drag)
	gui_input.connect(_canvas_input)
	mouse_exited.connect(func(): _hover_edge = ""; helper_dismissed.emit())

func display(value) -> void:
	model = value
	grouping.build(model)
	var signature := str(grouping.visible.keys())
	if signature != _layout_signature:
		_layout_signature = signature
		_layout()
	for id in cards.keys():
		if not grouping.visible.has(id):
			remove_child(cards[id]); cards[id].queue_free(); cards.erase(id)
	for id in grouping.visible:
		if not cards.has(id): _add_card(id)
		_update_card(id)
		cards[id].position_offset = _display_positions[id]
	_build_edges()
	highlight_selection()
	display_changed.emit()

func _layout() -> void:
	var layers: Dictionary = {}
	var ordered: Array = grouping.visible.keys()
	ordered.sort_custom(func(a, b):
		var left: Dictionary = grouping.visible[a]
		var right: Dictionary = grouping.visible[b]
		var ranks := {"quest-flag":0, "quest":0, "extra-action-point":1, "cycle-group":2, "message":3, "simple-encounter":4}
		if ranks.get(left.kind, 5) != ranks.get(right.kind, 5): return ranks.get(left.kind, 5) < ranks.get(right.kind, 5)
		return str(left.nativeId).naturalnocasecmp_to(str(right.nativeId)) < 0)
	var maximum := 1
	for id in ordered:
		var depth := _display_depth(id)
		if not layers.has(depth): layers[depth] = []
		layers[depth].append(id)
		maximum = maxi(maximum, layers[depth].size())
	for depth in layers:
		var rows: Array = layers[depth]
		for index in rows.size():
			var id: String = rows[index]
			var position := Vector2(int(depth) * 268, index * 190 + (maximum - rows.size()) * 95)
			if model.manual_positions.has(id): position = model.positions[id]
			if model.group_positions.has(id): position = model.group_positions[id]
			_display_positions[id] = position
			if model.nodes.has(id): model.positions[id] = position

func _display_depth(id: String) -> int:
	var row: Dictionary = grouping.visible[id]
	var depth := int(row.depth)
	if not str(row.kind).ends_with("encounter-result") or model.same_selection(row.selection, model.root): return depth
	for edge: Dictionary in model.edges.values():
		if edge.source != id or edge.relationship != "call": continue
		var target: String = grouping.representatives[edge.target]
		if grouping.visible.has(target): depth = mini(depth, int(grouping.visible[target].depth) - 1)
	return depth

func _add_card(id: String) -> void:
	var card := preload("res://src/discovery_flow_card.tscn").instantiate()
	card.name = "Record_" + str(cards.size()) + "_" + str(Time.get_ticks_usec())
	card.focus_mode = Control.FOCUS_ALL if model.same_selection(grouping.visible[id].selection, model.root) else Control.FOCUS_CLICK
	card.theme = theme
	add_child(card)
	cards[id] = card
	card.gui_input.connect(func(event): _card_input(event, id))
	card.focus_entered.connect(func(): _focus_changed(id))
	card.mouse_entered.connect(func(): if model.nodes.has(id): helper_requested.emit(id, card.global_position + Vector2(0, card.size.y * zoom), false))
	card.mouse_exited.connect(func(): helper_dismissed.emit())
	card.disclosure_requested.connect(func(): _disclose(id))

func _focus_changed(id: String) -> void:
	_focused = id
	for key in cards: cards[key].focus_mode = Control.FOCUS_ALL if key == id else Control.FOCUS_CLICK
	helper_focus_changed.emit()

func _update_card(id: String) -> void:
	var group: Dictionary = grouping.groups.get(id, {})
	var row: Dictionary = grouping.visible[id]
	var summary: Dictionary = model.summaries.get(id, {})
	var count := int(group.get("shown", []).size())
	if not group.is_empty() and not str(group.primary).is_empty(): summary = model.summaries.get(group.primary, {})
	cards[id].present(row, summary, model.same_selection(row.selection, model.root) and group.is_empty(), count, model.revealed.has(id))

func refresh_styles() -> void:
	for id in cards:
		cards[id].theme = theme
		_update_card(id)

func _disclose(id: String) -> void:
	if grouping.groups.has(id):
		members_requested.emit(grouping.groups[id].shown.duplicate())
	else:
		model.revealed.erase(id)
		display(model)
		var representative: String = grouping.representatives.get(id, id)
		if cards.has(representative): cards[representative].grab_focus()

func disclose(id: String) -> void: _disclose(id)

func highlight_selection() -> void:
	var related: Dictionary = {}
	if model.step >= 0:
		for edge: Dictionary in model.selected_step_edges():
			var target: String = edge.source if edge.relationship == "state-check" else edge.target
			related[grouping.representatives.get(target, target)] = true
	for id in cards:
		cards[id].selected = id == grouping.representatives.get(model.selected, model.selected)
		cards[id].related = related.has(id)
		cards[id].queue_redraw()
	queue_redraw()

func grouped_count() -> int: return grouping.count()

static func caption(row: Dictionary) -> String:
	var names := {"extra-action-point":"XAP", "action-point":"AP", "message":"String", "quest-flag":"Quest", "quest":"Quest", "simple-encounter":"Simple", "complex-encounter":"Complex", "rogue-encounter":"Rogue", "timed-encounter":"Timed"}
	var kind := str(row.get("kind", "record"))
	if kind.ends_with("-encounter-result"):
		var identity := str(row.selection.identity)
		return "%s %s · R%d" % [kind.get_slice("-", 0).capitalize(), identity.get_slice(":", 1), int(identity.get_slice(":", 3)) + 1]
	var number = row.get("authorId")
	if number == null: number = row.get("nativeId", "")
	return "%s %s" % [names.get(kind, kind.capitalize()), number]

func _save_drag() -> void:
	for id in cards:
		if cards[id].position_offset.is_equal_approx(_display_positions[id]): continue
		_display_positions[id] = cards[id].position_offset
		if model.nodes.has(id): model.manual_positions[id] = true; model.positions[id] = cards[id].position_offset
		else: model.group_positions[id] = cards[id].position_offset
	save_positions()

func save_positions() -> void:
	if model == null: return
	model.viewport = {"zoom":zoom, "scroll":scroll_offset}
	queue_redraw()

func _process(_delta: float) -> void:
	if not is_visible_in_tree() or model == null: return
	var signature := str(scroll_offset) + str(zoom)
	for card: GraphNode in cards.values(): signature += str(card.position_offset) + str(card.size)
	if signature != _last_view:
		_last_view = signature
		queue_redraw()

func _build_edges() -> void:
	_display_edges.clear()
	for edge: Dictionary in model.edges.values():
		var source: String = grouping.representatives[edge.source]
		var target: String = grouping.representatives[edge.target]
		if source == target and source != edge.source: continue
		var key := source + "|" + target + "|" + str(edge.relationship)
		if not _display_edges.has(key): _display_edges[key] = {"source":source, "target":target, "relationship":edge.relationship, "ids":[]}
		_display_edges[key].ids.append(edge.id)

func _draw() -> void:
	_paths.clear()
	if model == null: return
	var lanes: Dictionary = {}
	for key in _display_edges:
		var edge: Dictionary = _display_edges[key]
		if not cards.has(edge.source) or not cards.has(edge.target): continue
		var source: GraphNode = cards[edge.source]
		var target: GraphNode = cards[edge.target]
		var forward := target.position_offset.x > source.position_offset.x
		var same_column := is_equal_approx(target.position_offset.x, source.position_offset.x)
		var start := (source.position_offset + Vector2(source.size.x if forward or same_column else 0, source.size.y / 2)) * zoom - scroll_offset
		var finish := (target.position_offset + Vector2(0 if forward else target.size.x, target.size.y / 2)) * zoom - scroll_offset
		var lane_key := "%s:%s" % [edge.source, edge.target]
		var lane := int(lanes.get(lane_key, 0))
		lanes[lane_key] = lane + 1
		start.y += lane * 10; finish.y += lane * 10
		var middle := (start.x + finish.x) / 2 + lane * 10
		if same_column: middle = maxf(start.x, finish.x) + (36 + lane * 12) * zoom
		var points := PackedVector2Array([start, Vector2(middle, start.y), Vector2(middle, finish.y), finish])
		_paths[key] = points
		_draw_edge(edge, points)

func _draw_edge(edge: Dictionary, points: PackedVector2Array) -> void:
	var relationship: String = edge.relationship
	var color := Color(theme.ACCENTS[theme.mode][2 if relationship.begins_with("state-") else (1 if relationship == "eligibility" else 0)])
	if relationship == "reference": color = Color("8edbd6") if theme.mode != "light" else Color("126665")
	var selected: bool = model.edge in edge.ids
	if model.step >= 0:
		for occurrence: Dictionary in model.selected_step_edges(): selected = selected or occurrence.id in edge.ids
	var width := 3.0 if selected else 1.5
	var dash := 3.0 if relationship in ["reference", "eligibility"] else (8.0 if relationship.begins_with("state-") else 0.0)
	for index in range(1, points.size()): _draw_segment(points[index - 1], points[index], color, width, dash)
	var end := points[-1]
	var facing := signf(end.x - points[-2].x)
	if relationship == "state-change": draw_rect(Rect2(end - Vector2(4, 4), Vector2(8, 8)), color)
	elif relationship in ["state-check", "eligibility"]: draw_polyline(PackedVector2Array([end + Vector2(-5, 0), end + Vector2(0, -4), end + Vector2(5, 0), end + Vector2(0, 4), end + Vector2(-5, 0)]), color, width, true)
	else: draw_polyline(PackedVector2Array([end + Vector2(-8 * facing, -4), end, end + Vector2(-8 * facing, 4)]), color, width, true)
	if edge.ids.size() <= 1: return
	var text := "×%d" % edge.ids.size()
	var at := points[0].lerp(points[1], 0.5) + Vector2(-12, -9)
	var font := get_theme_default_font()
	var extent := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, 10)
	draw_rect(Rect2(at - Vector2(2, extent.y), extent + Vector2(4, 4)), Color(theme.PALETTES[theme.mode][0]))
	draw_string(font, at, text, HORIZONTAL_ALIGNMENT_LEFT, -1, 10, color)

func _draw_segment(start: Vector2, finish: Vector2, color: Color, width: float, dash: float) -> void:
	# Bound dashed geometry to the viewport even when a branch is far offscreen.
	if is_equal_approx(start.x, finish.x):
		if start.x < 0 or start.x > size.x: return
		start.y = clampf(start.y, 0, size.y); finish.y = clampf(finish.y, 0, size.y)
	else:
		if start.y < 0 or start.y > size.y: return
		start.x = clampf(start.x, 0, size.x); finish.x = clampf(finish.x, 0, size.x)
	if start.is_equal_approx(finish): return
	if dash > 0: draw_dashed_line(start, finish, color, width, dash)
	else: draw_line(start, finish, color, width, true)

func _card_input(event: InputEvent, id: String) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT: _select(id)
	if not event is InputEventKey or not event.pressed: return
	if event.keycode == KEY_ENTER: _select(id)
	elif event.keycode == KEY_F1 and model.nodes.has(id): helper_requested.emit(id, cards[id].global_position + Vector2(0, cards[id].size.y * zoom), true)
	elif event.keycode == KEY_F10 and event.shift_pressed: menu_requested.emit(id, cards[id].global_position + Vector2(20, 40))
	elif event.keycode in [KEY_LEFT, KEY_RIGHT, KEY_UP, KEY_DOWN]: _select_adjacent(event.keycode)
	else: return
	cards[id].accept_event()

func _select(id: String) -> void:
	if grouping.groups.has(id): members_requested.emit(grouping.groups[id].shown.duplicate())
	else: record_selected.emit(id)

func _canvas_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed: _select_adjacent(event.keycode)
	if event is InputEventMouseMotion:
		_hover_connection(event.position)
		return
	if not event is InputEventMouseButton or not event.pressed or event.button_index != MOUSE_BUTTON_LEFT: return
	var hits: Array = []
	for key in _paths:
		var points: PackedVector2Array = _paths[key]
		for index in range(1, points.size()):
			if Geometry2D.get_closest_point_to_segment(event.position, points[index - 1], points[index]).distance_to(event.position) < 7:
				for id in _display_edges[key].ids:
					if id not in hits: hits.append(id)
				break
	if not hits.is_empty(): occurrences_requested.emit(hits); accept_event()

func _hover_connection(at: Vector2) -> void:
	var found := ""
	for key in _paths:
		var points: PackedVector2Array = _paths[key]
		for index in range(1, points.size()):
			if Geometry2D.get_closest_point_to_segment(at, points[index - 1], points[index]).distance_to(at) < 7: found = key; break
		if not found.is_empty(): break
	if found == _hover_edge: return
	_hover_edge = found
	if found.is_empty(): helper_dismissed.emit()
	else: connection_help_requested.emit(_display_edges[found].ids, global_position + at)

func _select_adjacent(key: int) -> void:
	if model == null or cards.is_empty(): return
	var vector: Vector2 = {KEY_LEFT:Vector2.LEFT, KEY_RIGHT:Vector2.RIGHT, KEY_UP:Vector2.UP, KEY_DOWN:Vector2.DOWN}.get(key, Vector2.ZERO)
	if vector == Vector2.ZERO: return
	var origin: Vector2 = cards[_focused].position_offset if cards.has(_focused) else Vector2.ZERO
	var best := ""
	var score := INF
	for id in cards:
		var delta: Vector2 = cards[id].position_offset - origin
		if delta.dot(vector) <= 0: continue
		var distance := delta.length() + absf(delta.cross(vector)) * 2
		if distance < score: best = id; score = distance
	if not best.is_empty(): cards[best].grab_focus()

func focus_record(id: String) -> void:
	if cards.has(id): cards[id].grab_focus()

func fit_content() -> void:
	if cards.is_empty(): return
	var bounds := Rect2(cards.values()[0].position_offset, cards.values()[0].size)
	for card: GraphNode in cards.values(): bounds = bounds.merge(Rect2(card.position_offset, card.size))
	zoom = clampf(minf((size.x - 60) / bounds.size.x, (size.y - 80) / bounds.size.y), 0.75, 1.0)
	scroll_offset = bounds.get_center() * zoom - size / 2

func recenter(id: String) -> void:
	var representative: String = grouping.representatives.get(id, id)
	if cards.has(representative): scroll_offset = (cards[representative].position_offset + cards[representative].size / 2) * zoom - size / 2
