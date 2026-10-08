extends GraphEdit

signal record_selected(id: String)
signal occurrence_selected(id: String)
var model
var cards: Dictionary = {}
var _paths: Dictionary = {}
var _last_view := ""

func _ready() -> void:
	end_node_move.connect(save_positions)
	gui_input.connect(_canvas_input)

func display(value) -> void:
	model = value
	for id in cards.keys():
		if not model.nodes.has(id):
			remove_child(cards[id])
			cards[id].queue_free()
			cards.erase(id)
	for id in model.nodes:
		if not cards.has(id): _add_card(id, model.nodes[id])
		if not cards[id].position_offset.is_equal_approx(model.positions[id]): cards[id].position_offset = model.positions[id]
	highlight_selection()

func highlight_selection() -> void:
	for id in cards:
		if cards[id].selected != (id == model.selected): cards[id].selected = id == model.selected
	queue_redraw()

func _add_card(id: String, row: Dictionary) -> void:
	var card := GraphNode.new()
	card.name = "Record_" + str(cards.size()) + "_" + str(Time.get_ticks_usec())
	var title := caption(row)
	card.title = title if title.length() <= 22 else title.left(21) + "…"
	card.custom_minimum_size = Vector2(176, 98)
	card.size = Vector2(176, 98)
	card.resizable = false
	card.focus_mode = Control.FOCUS_ALL
	card.tooltip_text = title + "\n" + str(row.label) + "\n" + str(row.availabilityReason)
	var summary := Label.new()
	summary.custom_minimum_size = Vector2(152, 56)
	summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	summary.max_lines_visible = 3
	summary.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	summary.text = str(row.label)
	summary.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.add_child(summary)
	add_child(card)
	style_card(card, row)
	card.gui_input.connect(func(event): _card_input(event, id))
	card.focus_entered.connect(func(): record_selected.emit(id))
	cards[id] = card

func style_card(card: GraphNode, row: Dictionary) -> void:
	var colors: Array = theme.PALETTES[theme.mode]
	var border := Color(colors[2]) if row.navigable else Color(theme.ACCENTS[theme.mode][3])
	for type in ["panel", "titlebar"]:
		card.add_theme_stylebox_override(type, theme.make_panel_style(Color(colors[1]), border, 1, 6, 10, 0))
		card.add_theme_stylebox_override(type + "_selected", theme.make_panel_style(Color(colors[1]), Color(colors[6]), 2, 6, 10, 0))

static func caption(row: Dictionary) -> String:
	var names := {"extra-action-point":"XAP", "action-point":"AP", "message":"String", "quest-flag":"Quest", "quest":"Quest"}
	var kind := str(row.get("kind", "record"))
	if kind.ends_with("-encounter-result"):
		var identity := str(row.selection.identity)
		return "%s %s · Result %d" % [kind.get_slice("-", 0).capitalize(), identity.get_slice(":", 1), int(identity.get_slice(":", 3)) + 1]
	var number = row.get("authorId")
	if number == null: number = row.get("nativeId", "")
	return "%s %s" % [names.get(kind, kind.capitalize()), number]

func save_positions() -> void:
	if model == null: return
	for id in cards: model.positions[id] = cards[id].position_offset
	model.viewport = {"zoom":zoom, "scroll":scroll_offset}
	queue_redraw()

func _process(_delta: float) -> void:
	if not is_visible_in_tree() or model == null: return
	var signature := str(scroll_offset) + str(zoom)
	for card: GraphNode in cards.values(): signature += str(card.position_offset)
	if signature != _last_view:
		_last_view = signature
		queue_redraw()

func _draw() -> void:
	_paths.clear()
	if model == null: return
	for edge: Dictionary in model.edges.values():
		if not cards.has(edge.source) or not cards.has(edge.target): continue
		var source: GraphNode = cards[edge.source]
		var target: GraphNode = cards[edge.target]
		var forward := target.position_offset.x > source.position_offset.x
		var same_column := is_equal_approx(target.position_offset.x, source.position_offset.x)
		var start := (source.position_offset + Vector2(source.size.x if forward or same_column else 0, source.size.y / 2)) * zoom - scroll_offset
		var finish := (target.position_offset + Vector2(0 if forward else target.size.x, target.size.y / 2)) * zoom - scroll_offset
		var middle := (start.x + finish.x) / 2
		if same_column: middle = maxf(start.x, finish.x) + 40 * zoom
		var points := PackedVector2Array([start, Vector2(middle, start.y), Vector2(middle, finish.y), finish])
		_paths[edge.id] = points
		_draw_edge(edge, points)

func _draw_edge(edge: Dictionary, points: PackedVector2Array) -> void:
	var state: bool = str(edge.relationship).begins_with("state-")
	var reference: bool = edge.relationship in ["reference", "eligibility"]
	var colors: Array = theme.ACCENTS[theme.mode]
	var color := Color(colors[2 if state else 0])
	if reference: color = Color(theme.PALETTES[theme.mode][4])
	var width := 3.0 if edge.id == model.edge else 1.5
	for index in range(1, points.size()):
		_draw_segment(points[index - 1], points[index], color, width, 3.0 if reference else (8.0 if state else 0.0))
	var end := points[-1]
	var facing := signf(end.x - points[-2].x)
	draw_polyline(PackedVector2Array([end + Vector2(-8 * facing, -4), end, end + Vector2(-8 * facing, 4)]), color, width, true)
	if edge.id == model.edge:
		var text: String = {"call":"Calls", "state-check":"Checks", "state-change":"Changes", "reference":"Uses", "eligibility":"Eligible"}.get(edge.relationship, "Link")
		var at := points[1] + Vector2(-20, -10)
		var font := get_theme_default_font()
		var extent := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, 12)
		draw_rect(Rect2(at - Vector2(3, extent.y), extent + Vector2(6, 5)), Color(theme.PALETTES[theme.mode][0]))
		draw_string(font, at, text, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, color)

func _draw_segment(start: Vector2, finish: Vector2, color: Color, width: float, dash: float) -> void:
	# Clip before generating dashed geometry: dense columns can extend far
	# beyond the viewport, but should cost only their visible line length.
	if is_equal_approx(start.x, finish.x):
		if start.x < 0 or start.x > size.x: return
		start.y = clampf(start.y, 0, size.y)
		finish.y = clampf(finish.y, 0, size.y)
	else:
		if start.y < 0 or start.y > size.y: return
		start.x = clampf(start.x, 0, size.x)
		finish.x = clampf(finish.x, 0, size.x)
	if start.is_equal_approx(finish): return
	if dash > 0: draw_dashed_line(start, finish, color, width, dash)
	else: draw_line(start, finish, color, width, true)

func _card_input(event: InputEvent, id: String) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		record_selected.emit(id)
	if event is InputEventKey and event.pressed:
		if event.keycode == KEY_ENTER: record_selected.emit(id)
		elif event.keycode in [KEY_LEFT, KEY_RIGHT, KEY_UP, KEY_DOWN]:
			_select_adjacent(event.keycode)
			cards[id].accept_event()

func _canvas_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed:
		_select_adjacent(event.keycode)
	if not event is InputEventMouseButton or not event.pressed or event.button_index != MOUSE_BUTTON_LEFT: return
	for id in _paths:
		var points: PackedVector2Array = _paths[id]
		for index in range(1, points.size()):
			if Geometry2D.get_closest_point_to_segment(event.position, points[index - 1], points[index]).distance_to(event.position) < 8:
				occurrence_selected.emit(id)
				accept_event()
				return

func _select_adjacent(key: int) -> void:
	if model == null or cards.is_empty(): return
	var vector: Vector2 = {KEY_LEFT:Vector2.LEFT, KEY_RIGHT:Vector2.RIGHT, KEY_UP:Vector2.UP, KEY_DOWN:Vector2.DOWN}.get(key, Vector2.ZERO)
	if vector == Vector2.ZERO: return
	var origin: Vector2 = model.positions.get(model.selected, Vector2.ZERO)
	var best := ""
	var score := INF
	for id in cards:
		var delta: Vector2 = cards[id].position_offset - origin
		if delta.dot(vector) <= 0: continue
		var distance := delta.length() + absf(delta.cross(vector)) * 2
		if distance < score:
			best = id
			score = distance
	if not best.is_empty(): cards[best].grab_focus()

func fit_content() -> void:
	if cards.is_empty(): return
	var bounds := Rect2(cards.values()[0].position_offset, cards.values()[0].size)
	for card: GraphNode in cards.values(): bounds = bounds.merge(Rect2(card.position_offset, card.size))
	zoom = clampf(minf((size.x - 60) / bounds.size.x, (size.y - 90) / bounds.size.y), zoom_min, 1.0)
	scroll_offset = bounds.get_center() * zoom - size / 2

func recenter(id: String) -> void:
	if cards.has(id): scroll_offset = (cards[id].position_offset + cards[id].size / 2) * zoom - size / 2
