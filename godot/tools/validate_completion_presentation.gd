extends SceneTree

const ThemeType = preload("res://theme/scenario_control_theme.gd")

func _initialize() -> void: call_deferred("_run")

func _run() -> void:
	root.size = Vector2i(1600,900)
	for scene in ["action_point_editor","extra_action_point_editor","simple_encounter_editor","publish_workbench"]:
		var view: Control = load("res://src/%s.tscn" % scene).instantiate()
		root.add_child(view)
		for mode in ["dark","light","high-contrast"]:
			for density in ["balanced","compact"]:
				var themed := ThemeType.new()
				themed.mode = mode; themed.density = density
				view.theme = themed; view.size = Vector2(1476,760)
				await create_timer(.1).timeout
				assert(view.get_combined_minimum_size().x <= 1476,"Completion scene overflows compact width: " + scene + mode + density)
				if scene == "simple_encounter_editor":
					var controls: Array = view._response_controls
					view._populate_result_picker(controls[0].result,0,-4)
					await process_frame
					for row: Dictionary in controls:
						assert(is_equal_approx(row.result.size.x,controls[0].result.size.x))
						assert(is_equal_approx(row.text.size.x,controls[0].text.size.x))
		view.free(); await process_frame
	print("PROVIDENCE_COMPLETION_PRESENTATION_OK four-scenes six-combinations compact-width equal-simple-routing no-additional-visual-acceptance")
	quit()
