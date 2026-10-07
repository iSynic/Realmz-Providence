extends SceneTree


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	var routes := ["economy.treasure", "economy.items", "economy.shops"]
	var scenes := ["treasure_editor", "item_editor", "shop_editor"]
	for size: Vector2i in [Vector2i(1920,1080), Vector2i(1600,900)]:
		root.size = size
		for i in routes.size():
			var view: Control = load("res://src/" + scenes[i] + ".tscn").instantiate()
			root.add_child(view)
			view.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
			var strip: Control = view.get_node("EconomyNavigation")
			strip.set_counts({"economy.treasure": 76, "economy.items": 999, "economy.shops": 38})
			await process_frame
			await process_frame
			assert(strip.is_visible_in_tree() and strip.size.y >= 34)
			assert(strip.get_global_rect().end.x <= view.get_global_rect().end.x)
			var requested: Array[String] = []
			strip.route_requested.connect(func(route: String): requested.append(route))
			for name: String in strip.ROUTES:
				var button: Button = strip.get_node(name)
				assert(button.disabled == (strip.ROUTES[name] == routes[i]))
				assert(button.text.contains(str({"economy.treasure":76,"economy.items":999,"economy.shops":38}[strip.ROUTES[name]])))
				if not button.disabled: button.pressed.emit()
			assert(requested.size() == 2 and not requested.has(routes[i]))
			view.free()
	print("PROVIDENCE_ECONOMY_NAVIGATION_OK three-editors both-viewports sibling-routes active-route counts")
	quit()
