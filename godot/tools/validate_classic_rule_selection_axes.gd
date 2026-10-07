extends SceneTree


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	root.gui_embed_subwindows = true
	var dialog: Window = load("res://src/classic_rule_selection_dialog.tscn").instantiate()
	root.add_child(dialog)
	for mode in ["dark", "light", "high-contrast"]:
		for density in ["balanced", "compact"]:
			dialog.theme = preload("res://src/player_scenario_theme.gd").new()
			dialog.theme.mode = mode; dialog.theme.density = density
			for viewport_size in [Vector2i(1600,900), Vector2i(1920,1080)]:
				root.size = viewport_size
				dialog.begin({"context":{"nativeMenuSelection":10}}, null)
				dialog.get_node("%RuleSource").select(2)
				dialog.get_node("%MenuSlot").value = 20
				for state in ["saved", "blocked", "rejected", "uncertain"]:
					present(dialog, state)
					await process_frame; await process_frame
					var content := dialog.get_node("Margin") as Control
					assert(content.get_combined_minimum_size().y <= content.size.y, state + " vertical containment")
					assert(content.get_combined_minimum_size().x <= content.size.x, state + " horizontal containment")
					var footer := dialog.get_node("Margin/Content/Footer") as Control
					assert(footer.get_rect().end.y <= content.size.y, state + " footer remains visible")
	dialog.free(); await process_frame
	print("PROVIDENCE_CLASSIC_RULE_SELECTION_AXES_OK themes=3 densities=2 viewports=2 states=4")
	quit()


func present(dialog: Window, state: String) -> void:
	if state == "saved":
		dialog.present_preview({"ok":true,"result":{"validChoice":true,"ready":true,
			"raceSource":"scenario","casteSource":"application"}})
	elif state == "blocked":
		dialog.present_preview({"ok":true,"result":{"validChoice":true,"ready":false,
			"raceSource":"scenario","casteSource":"application",
			"message":"selected scenario Data Race must contain 30 usable records; found 0"}})
	else:
		dialog.writing({"nativeMenuSelection":20})
		dialog.present_failure({"outcomeUnknown":state == "uncertain", "error":"The write was rejected."})
