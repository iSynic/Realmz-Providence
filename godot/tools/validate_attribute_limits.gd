extends SceneTree


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	for viewport in [Vector2i(1920,1080), Vector2i(1600,900)]:
		root.size = viewport
		for kind in ["race", "caste"]:
			var view: Control = load("res://src/" + kind + "_editor.tscn").instantiate()
			root.add_child(view); view.size = viewport
			for mode in ["dark", "light", "high-contrast"]:
				for density in ["balanced", "compact"]:
					view.apply_theme(mode, density)
					await process_frame; await process_frame
					verify_columns(view)
			view.free()
	print("PROVIDENCE_ATTRIBUTE_LIMITS_OK both-editors both-viewports six-theme-density-combinations")
	quit()


func verify_columns(view: Control) -> void:
	var table: GridContainer = view.form.find_child("AttributeLimits", true, false)
	assert(table != null and table.columns == 3 and table.get_child_count() == 21)
	var headings := [table.get_child(1), table.get_child(2)]
	for row in 6:
		for column in 2:
			var index := row * 2 + column
			var field: SpinBox = view.form.control_for(["definition", "attributeLimits", index])
			assert(field == table.get_child(4 + row * 3 + column))
			assert(field.min_value == -32768 and field.max_value == 32767)
			assert(is_equal_approx(field.global_position.x, headings[column].global_position.x))
			assert(is_equal_approx(field.size.x, headings[column].size.x))
			assert(field.get_global_rect().end.x <= table.get_global_rect().end.x)
			assert(field.get_global_rect().end.y <= table.get_global_rect().end.y)
		var minimum: Control = table.get_child(4 + row * 3)
		var maximum: Control = table.get_child(5 + row * 3)
		assert(minimum.size == maximum.size)
