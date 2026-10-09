extends SceneTree

var _editor: ProvidenceBattleEditor
var _failed := false
var _open: Array = []
var _times: Array[float] = []
var _theme_switches: Array[float] = []
var _dense_times: Array[float] = []
var _dense_cold_times: Array[float] = []


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.gui_embed_subwindows = true
	_editor = load("res://src/battle_editor.tscn").instantiate()
	_editor.theme = load("res://theme/scenario_controls.tres").duplicate()
	root.add_child(_editor)
	_editor.monster_open_requested.connect(func(id, set_id): _open.append([id, set_id]))
	for width in [1600, 1920]:
		root.size = Vector2i(width, 900 if width == 1600 else 1080)
		_editor.size = root.size
		await process_frame
		await _exercise(width)
		if _failed: return
	_times.sort()
	if not _check(_times[int(_times.size() * 0.95)] < 100.0, "Gallery exceeds the existing 100ms visible-control budget: p95=%.2fms samples=%s" % [_times[int(_times.size() * 0.95)], _times]): return
	_theme_switches.sort()
	if not _check(_dense_times.max() < 100.0, "Continuous gallery exceeds the 100ms warm visible-control budget: %s" % [_dense_times]): return
	print("PROVIDENCE_BATTLE_CONTINUOUS_GALLERY_OK entries=217 End=217 visible-artwork-window warm-max=%.2fms samples=%d cold-max=%.2fms" % [_dense_times.max(), _dense_times.size(), _dense_cold_times.max()])
	print("PROVIDENCE_BATTLE_GALLERY_OK viewports=2 themes=6 row-arrows hover click enter double-click unavailable stale-refresh filtered-brush-rejected selection-scroll opaque-tooltip warm-p95=%.2fms cold-theme-max=%.2fms" % [_times[int(_times.size() * 0.95)], _theme_switches.back()])
	_editor.queue_free(); quit(0)


func _rows(unavailable := false, count := 32) -> Array:
	var rows: Array = []
	for id in range(1, count + 1):
		rows.append({"nativeId": id, "identity": "monster:0:%d" % id, "label": "Gallery Monster %d" % id,
			"available": not unavailable, "reason": "Missing exact Mega variant" if unavailable else "",
			"monster": null if unavailable else {"size": 0, "iconId": id, "hitDice": id, "armor": 25}})
	return rows


func _bind(rows: Array, total := 32) -> void:
	_editor.set_palette({"page": {"items": rows, "offset": 0, "total": total, "placeableTotal": total}})


func _exercise(width: int) -> void:
	var grid: Array = []; grid.resize(169); grid.fill(0)
	_editor.bind_document({"revision": 1, "battle": {"identity": "battle:2", "nativeId": 2, "grid": grid,
		"distance": 0, "messageBefore": 0, "messageAfter": 0, "battleMacro": 0}})
	_editor.restore_browser_state({})
	var palette: Control = _editor.get_node("%MonsterPalette")
	var columns := 4 if width == 1600 else 5
	_bind(_rows()); await process_frame
	if not _check(palette.get_node("%Tiles").columns == columns and _editor.get_node("%OpenPaletteMonster").disabled, "Gallery width or unselected Open state is wrong"): return
	var tile: Button = palette.get_node("%Tiles").get_child(0)
	var generation: int = _editor.draft.generation
	_mouse(tile, "hover"); await process_frame
	if not _check(palette.get_selected_items().is_empty() and tile.tooltip_text.contains("Monster 1") and tile.tooltip_text.contains("HD 1"), "Hover chose a brush or omitted its facts"): return
	_mouse(tile, "click"); await process_frame
	if not _check(_selected(palette) == 0 and not _editor.get_node("%OpenPaletteMonster").disabled, "Mouse did not choose an exact gallery destination"): return
	_key(KEY_RIGHT); await process_frame
	_key(KEY_DOWN); await process_frame
	if not _check(_selected(palette) == columns + 1 and palette.get_node("%SelectionName").text.contains("Monster %d" % (columns + 2)), "Arrow navigation did not move by a gallery row"): return
	if not _check(_editor.draft.generation == generation and not _editor.has_unapplied_changes(), "Brush navigation painted or dirtied the Battle"): return
	_key(KEY_HOME); await process_frame
	_key(KEY_ENTER); await process_frame
	if not _check(_open.back() == [1, 0], "Enter opened a different Monster or set"): return
	_mouse(tile, "double"); await process_frame
	if not _check(_open.back() == [1, 0], "Double-click changed the exact Monster identity"): return
	_key(KEY_END); await process_frame
	var last: Control = palette.get_node("%Tiles").get_child(31)
	if not _check(_selected(palette) == 31 and palette.get_node("%TileScroll").get_global_rect().encloses(last.get_global_rect()), "End failed to reveal the last thumbnail"): return
	var scroll: float = palette.get_v_scroll_bar().value
	_bind(_rows()); await process_frame
	if not _check(_selected(palette) == 31 and is_equal_approx(palette.get_v_scroll_bar().value, scroll), "Equivalent refresh lost selection or scroll"): return
	await _filtered_brush(palette)
	await _unavailable_and_stale(palette)
	await _theme_regressions(palette)
	await _continuous_catalog(palette)


func _continuous_catalog(palette: Control) -> void:
	for repeat in 3:
		var started := Time.get_ticks_usec()
		_bind(_rows(false, 217), 217); await process_frame
		var elapsed := (Time.get_ticks_usec() - started) / 1000.0
		if repeat == 0: _dense_cold_times.append(elapsed)
		else: _dense_times.append(elapsed)
	if not _check(palette.item_count == 217 and not _editor.get_node("%PaletteNext").visible, "Continuous gallery omitted records or retained page navigation"): return
	palette.grab_focus(); await process_frame
	_key(KEY_END); await process_frame
	var last: Control = palette.get_node("%Tiles").get_child(216)
	if not _check(_selected(palette) == 216 and palette.get_node("%TileScroll").get_global_rect().encloses(last.get_global_rect()), "End did not reach Monster 217"): return
	if not _check(palette.visible_records().size() < 64 and _editor.visible_icon_ids().has(217), "Artwork selection ignored the visible catalog window"): return


func _filtered_brush(palette: Control) -> void:
	_editor.draft.edit_cell(35, 1)
	var canvas: Control = _editor.get_node("%BattleCanvas")
	canvas.selected_slot = 35
	_bind([_rows()[0]], 1); await process_frame
	if not _check(palette.get_selected_items().is_empty() and palette.get_node("%SelectionName").text == "No brush selected." and _editor.get_node("%PaintTool").disabled and _editor.get_node("%ReplaceOccupant").disabled, "Filtering away the brush retained hidden Paint or Replace authority"): return
	var values: Array = _editor.draft.record.grid.duplicate()
	var generation: int = _editor.draft.generation
	var mouse := InputEventMouseButton.new()
	mouse.button_index = MOUSE_BUTTON_LEFT; mouse.pressed = true
	mouse.position = canvas.get_global_rect().position + canvas.rect_for_slot(36).get_center()
	mouse.global_position = mouse.position; root.push_input(mouse, true)
	mouse = mouse.duplicate(); mouse.pressed = false; root.push_input(mouse, true)
	canvas.cell_action.emit("replace", 35)
	canvas.cell_action.emit("paint", 36)
	await process_frame
	if not _check(_editor.draft.record.grid == values and _editor.draft.generation == generation, "Filtered-out brush modified the draft through mouse or mutation acceptance"): return
	_bind(_rows()); await process_frame
	_check(_selected(palette) == 31 and not _editor.get_node("%PaintTool").disabled and not _editor.get_node("%ReplaceOccupant").disabled, "Restoring the exact brush page lost selection or Paint/Replace eligibility")


func _unavailable_and_stale(palette: Control) -> void:
	var old: Button = palette.get_node("%Tiles").get_child(0)
	_bind(_rows(true))
	var before := _open.size()
	old.pressed.emit()
	palette.select(0); palette.item_selected.emit(0)
	_key(KEY_ENTER); await process_frame
	if not _check(_open.size() == before and _editor.get_node("%PaintTool").disabled and _editor.get_node("%OpenPaletteMonster").disabled, "Unavailable or stale selection opened or painted a substituted variant"): return
	var tile: Button = palette.get_node("%Tiles").get_child(0)
	if not _check(tile.get_node("Warning").visible and tile.get_node("Appearance").texture == null and palette.get_node("%SelectionDetails").text.contains("Missing exact Mega"), "Missing variant lacks its marker, reason or exact empty artwork"): return
	_bind([], 0); await process_frame
	_check(palette.get_selected_items().is_empty() and not palette.get_node("%SelectionName").visible and _editor.get_node("%OpenPaletteMonster").disabled, "No-results retained a stale destination")


func _theme_regressions(palette: Control) -> void:
	for mode in ["dark", "light", "high-contrast"]:
		for density in ["balanced", "compact"]:
			_editor.theme.mode = mode; _editor.theme.density = density
			for sample in 25:
				var started := Time.get_ticks_usec()
				_bind(_rows())
				await process_frame
				var elapsed := (Time.get_ticks_usec() - started) / 1000.0
				if sample == 0: _theme_switches.append(elapsed)
				if sample >= 5: _times.append(elapsed)
			var tile: Control = palette.get_node("%Tiles").get_child(0)
			if not _check(tile.size == Vector2(64, 64) and _editor.get_global_rect().end.x <= root.size.x + 1, "Theme/density changed tile geometry or overflowed the window"): return
			var color: Color = tile.get_node("Identity").get_theme_color("font_color").srgb_to_linear()
			var background: Color = tile.get_theme_stylebox("normal").bg_color.srgb_to_linear()
			_check((maxf(color.get_luminance(), background.get_luminance()) + 0.05) / (minf(color.get_luminance(), background.get_luminance()) + 0.05) >= 4.5, "ID badge contrast is below 4.5")
			_check_tooltip(tile)


func _check_tooltip(tile: Control) -> void:
	var tooltip: PanelContainer = tile._make_custom_tooltip(tile.tooltip_text)
	var panel := tooltip.get_theme_stylebox("panel") as StyleBoxFlat
	var color: Color = tooltip.get_node("Facts").get_theme_color("font_color").srgb_to_linear()
	var background := panel.bg_color.srgb_to_linear()
	_check(panel.bg_color.a == 1.0 and panel.content_margin_left >= 8 and (maxf(color.get_luminance(), background.get_luminance()) + 0.05) / (minf(color.get_luminance(), background.get_luminance()) + 0.05) >= 4.5, "Tooltip must be opaque, padded and readable in every supported theme")
	tooltip.free()


func _selected(palette: Control) -> int:
	var selected: PackedInt32Array = palette.get_selected_items()
	return selected[0] if not selected.is_empty() else -1


func _mouse(tile: Control, kind: String) -> void:
	var event: InputEvent
	if kind == "hover": event = InputEventMouseMotion.new()
	else:
		event = InputEventMouseButton.new(); event.button_index = MOUSE_BUTTON_LEFT; event.pressed = true; event.double_click = kind == "double"
	event.position = tile.get_global_rect().get_center(); event.global_position = event.position
	root.push_input(event, true)
	if event is InputEventMouseButton:
		event = event.duplicate(); event.pressed = false; root.push_input(event, true)


func _key(code: Key) -> void:
	var event := InputEventKey.new(); event.keycode = code; event.pressed = true; root.push_input(event, true)


func _check(condition: bool, message: String) -> bool:
	if condition: return true
	_failed = true; push_error("PROVIDENCE_BATTLE_GALLERY_FAILED: " + message); quit(1); return false
