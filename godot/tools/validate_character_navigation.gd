extends SceneTree


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	for viewport in [Vector2i(1920, 1080), Vector2i(1600, 900)]:
		root.size = viewport
		for kind in ["spell", "race", "caste"]:
			var view: Control = load("res://src/" + kind + "_editor.tscn").instantiate()
			root.add_child(view); view.size = viewport
			await process_frame; await process_frame
			var strip: Control = view.get_node("Catalog/Routes")
			var requested: Array[int] = []
			view.route_requested.connect(func(tab: int): requested.append(tab))
			for name: String in strip.ROUTES:
				var button: Button = strip.get_node(name)
				var current: bool = strip.ROUTES[name] == view.route_identity()
				assert(button.is_visible_in_tree() and button.size.y >= 34)
				assert(button.get_global_rect().end.x <= strip.get_global_rect().end.x)
				assert(button.disabled == current and button.button_pressed == current)
				button.pressed.emit()
			assert(requested.size() == 2)
			view.set_locked(true)
			for name: String in strip.ROUTES:
				assert(strip.get_node(name).disabled)
				strip.get_node(name).pressed.emit()
			assert(requested.size() == 2)
			view.set_locked(false)
			assert(strip.get_node(kind.capitalize() + "s").disabled)
			view.free()
	await theme_variants()
	print("PROVIDENCE_CHARACTER_NAVIGATION_OK three-editors both-viewports current-noop locked-noop")
	quit()


func theme_variants() -> void:
	for mode in ["dark", "light", "high-contrast"]:
		for density in ["balanced", "compact"]:
			var strip: Control = load("res://src/character_navigation.tscn").instantiate()
			var controls = preload("res://src/item_theme.gd").new()
			controls.mode = mode; controls.density = density; strip.theme = controls
			root.add_child(strip); strip.size = Vector2(270,34)
			strip.configure("rules.spells"); await process_frame; await process_frame
			assert(strip.size.x <= 270)
			for button: Button in strip.get_children():
				assert(button.size.x >= button.get_minimum_size().x and button.size.y >= 34)
			strip.free()
