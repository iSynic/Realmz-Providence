extends Node

signal changed
signal status_changed(message: String)

const PREFERENCES := "user://display.cfg"
const PERCENTAGES := [100, 125, 150, 175, 200, 225, 250, 300]
const WORKSPACE := Vector2i(1600, 900)
const COMMAND_PREFIX := "view.ui-scale."

var preference := "auto"
var _path := PREFERENCES
var _windows: Array[WeakRef] = []
var _applying := false
var _elapsed := 0.0


func _ready() -> void:
	var override_path := OS.get_environment("PROVIDENCE_DISPLAY_SETTINGS_PATH")
	if not override_path.is_empty(): _path = override_path
	var settings := ConfigFile.new()
	if settings.load(_path) == OK:
		var saved: Variant = settings.get_value("display", "ui_scale", "auto")
		if saved is String and valid_preference(saved): preference = saved
	_watch(get_tree().root)
	get_tree().node_added.connect(_node_added)
	refresh_displays()


static func valid_preference(value: String) -> bool:
	return value == "auto" or value in PERCENTAGES.map(func(percent): return str(percent))


static func fitted_scale(requested: float, area: Vector2i) -> float:
	if area.x <= 0 or area.y <= 0: return clampf(requested, 1.0, 3.0)
	var fit := minf(float(area.x) / WORKSPACE.x, float(area.y) / WORKSPACE.y)
	# Keep the certified compact workspace available instead of clipping its commands.
	fit = maxf(1.0, floorf(fit * 4.0) / 4.0)
	return clampf(requested, 1.0, minf(3.0, fit))


func handles(command: StringName) -> bool:
	return str(command).begins_with(COMMAND_PREFIX) and valid_preference(str(command).trim_prefix(COMMAND_PREFIX))


func execute(command: StringName) -> void:
	if not handles(command): return
	if set_preference(str(command).trim_prefix(COMMAND_PREFIX)) != OK: return
	var state := describe()
	var message := "UI scale · %d%%" % roundi(state.effective * 100)
	if state.requested > state.effective:
		message += " · fitted to this display (%d%% requested)" % roundi(state.requested * 100)
	status_changed.emit(message)


func set_preference(value: String) -> Error:
	if not valid_preference(value): return ERR_INVALID_PARAMETER
	preference = value
	refresh_displays()
	changed.emit()
	var settings := ConfigFile.new()
	settings.load(_path)
	settings.set_value("display", "ui_scale", preference)
	var error := settings.save(_path)
	if error != OK: status_changed.emit("UI scale changed; the preference could not be saved.")
	return error


func describe(window: Window = null) -> Dictionary:
	if window == null: window = get_tree().root
	var screen := window.current_screen
	var requested := _display_scale(screen) if preference == "auto" else float(preference) / 100.0
	return {"preference": preference, "requested": requested,
		"effective": fitted_scale(requested, _usable_area(window).size)}


func _display_scale(screen: int) -> float:
	if DisplayServer.get_name() == "headless": return 1.0
	var scale := DisplayServer.screen_get_scale(screen)
	# Windows versions without screen_get_scale still expose the effective OS DPI.
	if OS.get_name() == "Windows": scale = maxf(scale, DisplayServer.screen_get_dpi(screen) / 96.0)
	return clampf(scale, 1.0, 3.0)


func _usable_area(window: Window) -> Rect2i:
	var area := DisplayServer.screen_get_usable_rect(window.current_screen)
	if area.size == Vector2i.ZERO: return area
	var decorations := window.get_size_with_decorations() - window.size if window.visible else Vector2i(16, 40)
	area.size -= decorations.max(Vector2i.ZERO)
	return area


func _process(delta: float) -> void:
	_elapsed += delta
	if _elapsed < 0.5: return
	_elapsed = 0.0
	refresh_displays()


func _node_added(node: Node) -> void:
	if node is Window: _watch_reference.call_deferred(weakref(node))


func _watch_reference(reference: WeakRef) -> void:
	var window: Window = reference.get_ref()
	if window != null: _watch(window)


func _watch(window: Window) -> void:
	if not is_instance_valid(window) or window.has_meta("display_scale_watched"): return
	window.set_meta("display_scale_watched", true)
	window.set_meta("display_original_minimum", window.min_size)
	_windows.append(weakref(window))
	window.visibility_changed.connect(_visibility_changed.bind(window))
	window.size_changed.connect(_remember_size.bind(window))
	if window.visible: _apply(window)


func _visibility_changed(window: Window) -> void:
	if window.visible:
		_apply(window, true)
		window.remove_meta("display_hidden_size")
	else:
		window.set_meta("display_hidden_size", window.size)


func _remember_size(window: Window) -> void:
	if _applying or not window.visible: return
	window.set_meta("display_scaled_size", window.size)


func refresh_displays() -> void:
	var updated := false
	_windows = _windows.filter(func(reference): return reference.get_ref() != null)
	for reference in _windows:
		var window: Window = reference.get_ref()
		if window.visible: updated = _apply(window) or updated
	if updated: changed.emit()


func _apply(window: Window, opening := false) -> bool:
	# Embedded dialogs already inherit their containing viewport's scale.
	if window != get_tree().root and (window.is_embedded() or window is PopupMenu): return false
	var factor := float(describe(window).effective)
	var previous := float(window.get_meta("display_applied_scale", 1.0))
	var different := not is_equal_approx(factor, previous)
	var supplied_size := window.size
	var prior_size: Vector2i = window.get_meta("display_scaled_size", Vector2i.ZERO)
	if opening: prior_size = window.get_meta("display_hidden_size", prior_size)
	if not different and (not opening or supplied_size == prior_size): return false
	_applying = true
	window.content_scale_factor = factor
	var original_minimum: Vector2i = window.get_meta("display_original_minimum", window.min_size)
	var minimum := WORKSPACE.max(original_minimum) if window == get_tree().root and factor > 1.0 else original_minimum
	var area := _usable_area(window)
	window.min_size = Vector2i(Vector2(minimum) * factor)
	var desired := Vector2(supplied_size) * factor / previous
	if opening and supplied_size != prior_size: desired = Vector2(supplied_size) * factor
	var extent := Vector2i(desired).max(window.min_size)
	if area.size.x > 0 and area.size.y > 0:
		window.min_size = window.min_size.min(area.size)
		extent = extent.min(area.size)
	window.size = extent
	window.set_meta("display_applied_scale", factor)
	window.set_meta("display_scaled_size", window.size)
	if area.size.x > 0 and area.size.y > 0:
		window.position = Vector2i(clampi(window.position.x, area.position.x, area.end.x - extent.x),
			clampi(window.position.y, area.position.y, area.end.y - extent.y))
	_applying = false
	return different
