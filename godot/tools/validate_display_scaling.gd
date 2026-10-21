extends SceneTree

const Scaling = preload("res://src/display_scaling.gd")
var _checks := 0
var _display: Node

class UsesBridge extends RefCounted:
	func request(method: String, _params := {}) -> Dictionary:
		if method == "session.describe": return {"ok": true, "result": {"revision": 0}}
		return {"ok": true, "result": {"asset": {"identity": "artwork-fixture"}, "revision": 0, "useTargets": [], "paging": {}}}


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	_expect(not OS.get_environment("PROVIDENCE_DISPLAY_SETTINGS_PATH").is_empty(), "Run through verify-display-scaling.ps1 with an isolated preference path")
	_display = root.get_node("DisplaySettings")
	var expected := OS.get_environment("PROVIDENCE_EXPECT_UI_SCALE")
	if not expected.is_empty():
		_expect(_display.preference == expected, "The saved UI scale must be restored in a new process")
		_expect(is_equal_approx(root.content_scale_factor, _display.describe().effective), "Restored scale applies before the first scene")
		print("PROVIDENCE_DISPLAY_SCALING_RESTART_OK preference=%s effective=%s" % [expected, root.content_scale_factor])
		quit()
		return
	_policy()
	await _root_and_draft()
	await _windows()
	await _artwork_popup()
	await _menu()
	_expect(_display.set_preference("150") == OK, "Leave an explicit saved value for the separate restart check")
	print("PROVIDENCE_DISPLAY_SCALING_OK checks=%d scaling=live preferences=isolated draft=retained native=%s embedded=inherited" % [_checks, "deferred-headless" if DisplayServer.get_name() == "headless" else "reopen-verified"])
	quit()


func _policy() -> void:
	_expect(Scaling.fitted_scale(2.0, Vector2i(3840, 2100)) == 2.0, "4K workspace supports 200%")
	_expect(Scaling.fitted_scale(2.0, Vector2i(2880, 1760)) == 1.75, "Laptop scaling preserves the compact workspace")
	_expect(Scaling.fitted_scale(3.0, Vector2i(1920, 1040)) == 1.0, "Oversized requests cannot clip the certified workspace")
	_expect(Scaling.fitted_scale(0.0, Vector2i.ZERO) == 1.0, "Invalid low scale is bounded")
	_expect(Scaling.fitted_scale(9.0, Vector2i.ZERO) == 3.0, "Invalid high scale is bounded")
	for value in ["auto", "100", "125", "150", "175", "200", "225", "250", "300"]:
		_expect(Scaling.valid_preference(value), "Supported scale " + value)
	for value in ["", "0", "1.5", "nan", "110", "400"]:
		_expect(not Scaling.valid_preference(value), "Invalid scale " + value)


func _root_and_draft() -> void:
	_display.set_preference("100")
	root.size = Vector2i(1600, 900)
	var workspace := Control.new()
	workspace.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(workspace)
	var draft := LineEdit.new()
	draft.position = Vector2(20, 20)
	draft.size = Vector2(400, 36)
	workspace.add_child(draft)
	draft.text = "Retained, unapplied scenario text"
	draft.caret_column = 9
	draft.select(3, 9)
	draft.grab_focus()
	for value in ["125", "150", "200", "100"]:
		_expect(_display.set_preference(value) == OK, "Scale preference saves")
		await _settle()
		var factor: float = _display.describe().effective
		_expect(is_equal_approx(root.content_scale_factor, factor), "Root uses the reported effective scale")
		_expect(workspace.size.is_equal_approx(Vector2(root.size) / factor), "UI layout uses scaled logical coordinates")
		_expect(draft.text == "Retained, unapplied scenario text" and draft.caret_column == 9 and draft.has_selection(), "Scale changes preserve draft, caret and selection")
		_expect(draft.has_focus(), "Scale changes preserve keyboard focus")
		var settings := ConfigFile.new()
		_expect(settings.load(OS.get_environment("PROVIDENCE_DISPLAY_SETTINGS_PATH")) == OK, "Saved preference can be reopened")
		_expect(settings.get_value("display", "ui_scale") == value, "Explicit scale survives a settings reload")
	_expect(_display.set_preference("invalid") == ERR_INVALID_PARAMETER and _display.preference == "100", "Invalid preference cannot replace the last valid setting")
	workspace.free()


func _windows() -> void:
	_display.set_preference("150")
	if DisplayServer.get_name() != "headless": await _native_window()
	var embedded := Window.new()
	embedded.hide()
	root.add_child(embedded)
	await _settle()
	_expect(embedded.is_embedded(), "Dialog fixture is embedded")
	_expect(embedded.content_scale_factor == 1.0, "Embedded dialogs do not receive a second scale")
	embedded.free()
	# Queued discovery of short-lived menus must not retain freed Windows.
	var short_lived := PopupMenu.new()
	root.add_child(short_lived)
	short_lived.free()
	await _settle()
	_display.refresh_displays()


func _native_window() -> void:
	var factor: float = _display.describe().effective
	var native := Window.new()
	native.hide()
	native.force_native = true
	native.size = Vector2i(800, 600)
	root.add_child(native)
	await _settle()
	native.show()
	await _settle()
	_expect(is_equal_approx(native.content_scale_factor, factor), "Detached windows use the UI scale")
	var first := native.size
	native.hide()
	native.show()
	await _settle()
	_expect(native.size == first, "Repeated reveals do not multiply native window size")
	native.hide()
	native.size = Vector2i(720, 500)
	native.show()
	await _settle()
	_expect(native.size == Vector2i(Vector2(720, 500) * factor), "A newly supplied popup size scales exactly once: actual=%s factor=%s prior=%s" % [native.size, native.content_scale_factor, first])
	native.free()


func _menu() -> void:
	var menu: ProvidenceApplicationMenu = preload("res://src/application_menu.tscn").instantiate()
	root.add_child(menu)
	var commands: Array[StringName] = []
	menu.command_requested.connect(func(command): commands.append(command); _display.execute(command))
	var popup: PopupMenu = menu.get_node("View/UIScale")
	popup.id_pressed.emit(ProvidenceApplicationMenu.CommandId.VIEW_UI_SCALE + 1)
	await _settle()
	_expect(commands == [&"view.ui-scale.100"] and _display.preference == "100", "Menu selection dispatches a working scale command without a project")
	menu.update_command_state({"uiScale": _display.describe()})
	_expect(popup.is_item_checked(1) and not popup.is_item_checked(0), "Radio check reflects the saved preference")
	_display.set_preference("300")
	var fitted: Dictionary = _display.describe()
	menu.update_command_state({"uiScale": fitted})
	_expect(popup.is_item_checked(8), "A fitted request retains its selected percentage")
	if fitted.effective < fitted.requested:
		_expect(popup.get_item_text(8).contains("fits at %d%%" % roundi(fitted.effective * 100)), "A reduced effective scale is disclosed beside the selected request")
	_expect(popup.get_item_text(0) == "Automatic", "Unselected Automatic must not display the manual scale as a detected value")
	popup.id_pressed.emit(ProvidenceApplicationMenu.CommandId.VIEW_UI_SCALE)
	menu.update_command_state({"uiScale": _display.describe()})
	_expect(popup.is_item_checked(0) and _display.preference == "auto", "Automatic mode is restorable")
	_expect(popup.get_item_text(0).contains("%"), "Automatic shows its effective scale")
	var reset := InputEventKey.new()
	reset.keycode = KEY_0
	reset.ctrl_pressed = true
	reset.alt_pressed = true
	_expect(popup.get_item_shortcut(1).matches_event(reset), "Ctrl+Alt+0 restores 100%")
	menu.free()
	await _settle()


func _artwork_popup() -> void:
	var anchor := Button.new()
	anchor.position = Vector2(200, 200)
	anchor.size = Vector2(120, 36)
	root.add_child(anchor)
	var popup := preload("res://src/artwork_uses_menu.gd").new()
	root.add_child(popup)
	await _settle()
	await popup.show_uses(UsesBridge.new(), "artwork-fixture", anchor)
	await _settle()
	_expect(popup.position == Vector2i(anchor.get_global_transform_with_canvas() * Vector2(0, anchor.size.y)), "Artwork uses menu anchors in the scaled viewport rather than physical screen pixels")
	popup.free()
	anchor.free()


func _settle() -> void:
	for frame in 4: await process_frame


func _expect(value: bool, message: String) -> void:
	_checks += 1
	if not value: push_error(message); quit(1)
	assert(value, message)
