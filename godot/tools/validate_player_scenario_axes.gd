extends SceneTree


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	var scenes := ["player_maps_editor","scenario_startup_editor","scenario_restrictions_editor","scenario_contact_editor","scenario_security_evidence"]
	for scene in scenes:
		var view: Control = load("res://src/%s.tscn" % scene).instantiate(); root.add_child(view)
		for mode in ["dark","light","high-contrast"]:
			for density in ["balanced","compact"]:
				var controls := preload("res://src/player_scenario_theme.gd").new()
				controls.mode = mode; controls.density = density; view.theme = controls
				for viewport_size in [Vector2i(1600,900),Vector2i(1920,1080)]:
					root.size = viewport_size; view.size = Vector2(viewport_size) - Vector2(110,160)
					await process_frame; await process_frame
					assert(view.get_combined_minimum_size().x <= view.size.x, scene + " horizontal containment")
					assert(view.get_combined_minimum_size().y <= view.size.y, scene + " vertical containment")
					var text: Color = controls.get_color("font_color","LineEdit")
					var fill: Color = controls.get_stylebox("normal","LineEdit").bg_color
					var light := maxf(text.get_luminance(),fill.get_luminance()); var dark := minf(text.get_luminance(),fill.get_luminance())
					assert((light + 0.05) / (dark + 0.05) >= 4.5, scene + " field contrast")
					for color_name in ["checkbox_checked_color", "checkbox_unchecked_color"]:
						var icon: Color = controls.get_color(color_name, "ScenarioBan")
						var background: Color = controls.get_stylebox("normal", "Button").bg_color
						var icon_luminance := icon.srgb_to_linear().get_luminance()
						var background_luminance := background.srgb_to_linear().get_luminance()
						assert((maxf(icon_luminance, background_luminance) + 0.05) / (minf(icon_luminance, background_luminance) + 0.05) >= 3.0, scene + " ban indicator contrast")
		view.free()
	print("PROVIDENCE_PLAYER_SCENARIO_AXES_OK routes=5 themes=3 densities=2 viewports=2 containment-and-field-contrast")
	quit()
