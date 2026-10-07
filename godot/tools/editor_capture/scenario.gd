extends RefCounted

static func prepare(editor: Control, tree: SceneTree) -> bool:
	var scenario_tabs := {"scenario-startup": 26, "scenario-restrictions": 27, "scenario-contact": 28, "scenario-security": 29}
	var scenario_surface := OS.get_environment("PROVIDENCE_CAPTURE_SURFACE")
	if not scenario_tabs.has(scenario_surface):
		push_error("Unknown Scenario capture surface: %s" % scenario_surface)
		editor.queue_free()
		await tree.process_frame
		tree.quit(2)
		return false
	editor._navigation.select_tab(int(scenario_tabs[scenario_surface]))
	for _frame in range(3):
		await tree.process_frame
	var focus_name := OS.get_environment("PROVIDENCE_CAPTURE_SCENARIO_FOCUS")
	if not focus_name.is_empty():
		var focus_surface: Control = editor._workbenches.scenario_sections[int(scenario_tabs[scenario_surface]) - 26]
		var focus_control := focus_surface.find_child(focus_name, true, false) as Control
		if focus_control == null or not focus_control.is_visible_in_tree() or focus_control.focus_mode != Control.FOCUS_ALL:
			push_error("Scenario capture focus target is unavailable: %s" % focus_name)
			tree.quit(2)
			return false
		focus_control.grab_focus()
		for reverse in [false, true]:
			for down in [true, false]:
				var key := InputEventKey.new()
				key.keycode = KEY_TAB
				key.shift_pressed = reverse
				key.pressed = down
				tree.root.push_input(key)
				await tree.process_frame
		if tree.root.gui_get_focus_owner() != focus_control or not focus_control.has_focus(true):
			push_error("Scenario capture did not return keyboard focus to %s" % focus_name)
			tree.quit(2)
			return false
		for _frame in range(2):
			await tree.process_frame
	if OS.get_environment("PROVIDENCE_CAPTURE_GEOMETRY") == "1":
		var surface: Control = editor._workbenches.scenario_sections[int(scenario_tabs[scenario_surface]) - 26]
		var regions := {}
		for region in ["FormPanel", "StartupShellForm", "StartMapSummary", "ContactFields", "ContactDescription", "RestrictionChecklists", "RaceChecklist", "RestrictionMessage", "SecurityCodeSegments", "RegistrationGenerator"]:
			var control := surface.find_child(region, true, false) as Control
			if control != null:
				regions[region] = {"x": control.global_position.x - surface.global_position.x, "y": control.global_position.y - surface.global_position.y, "width": control.size.x, "height": control.size.y}
		print("PROVIDENCE_SCENARIO_GEOMETRY %s %s" % [scenario_surface, JSON.stringify(regions)])
	return true


