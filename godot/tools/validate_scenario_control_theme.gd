extends SceneTree

const SPECIMEN = preload("res://tools/scenario_control_specimen.tscn")


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var specimen := SPECIMEN.instantiate() as Control
	root.add_child(specimen)
	await process_frame
	for mode in ["dark", "light", "high-contrast"]:
		for density in ["balanced", "compact"]:
			specimen.theme.mode = mode
			specimen.theme.density = density
			await process_frame
			await process_frame
			var field := specimen.get_node("Content/ScenarioName") as LineEdit
			var list := specimen.get_node("Content/AdmissionPolicy") as ItemList
			var disclosure := specimen.get_node("Content/EvidenceDisclosure") as Button
			var navigation := specimen.get_node("Content/Navigation/Navigate") as Button
			field.grab_focus()
			await _key(KEY_TAB)
			if root.gui_get_focus_owner() != list:
				return _fail("Tab did not reach the policy list")
			list.select(1)
			await _key(KEY_DOWN)
			await _key(KEY_SPACE)
			if list.get_selected_items() != PackedInt32Array([2]) or list.get_item_icon(2) != load("res://theme/policy_checked.svg") or list.get_item_icon_modulate(2) != list.get_theme_color("font_color"):
				return _fail("Selection changed admission policy")
			disclosure.grab_focus()
			await _key(KEY_SPACE)
			if not specimen.get_node("Content/Evidence").visible:
				return _fail("Space did not expand evidence")
			await _key(KEY_SPACE)
			navigation.grab_focus()
			specimen.get_node("Content/Result").text = "Not activated"
			await _key(KEY_ENTER)
			if not specimen.get_node("Content/Result").text.begins_with("Navigation activated"):
				return _fail("Enter did not activate navigation")
			if not specimen.get_node("Content/Navigation/Unavailable").disabled or field.editable:
				return _fail("Unavailable authoring became enabled")
			var focus := field.get_theme_stylebox("focus") as StyleBoxFlat
			if focus.border_width_left != 2 or focus.bg_color.a != 0 or field.get_theme_font_size("font_size") != 13:
				return _fail("Focus or typography differs from approved primitive")
			if specimen.get_combined_minimum_size().x > 512:
				return _fail("Specimen exceeds approved width")
	print("PROVIDENCE_SCENARIO_CONTROL_THEME_OK themes=3 densities=2 keyboard=verified focus=2px")
	quit(0)


func _key(code: Key) -> void:
	for down in [true, false]:
		var event := InputEventKey.new()
		event.keycode = code
		event.pressed = down
		root.push_input(event)
		await process_frame


func _fail(message: String) -> void:
	push_error("PROVIDENCE_SCENARIO_CONTROL_THEME_FAILED: " + message)
	quit(1)
