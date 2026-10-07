extends SceneTree

const VIEWPORTS := [Vector2i(1600, 900), Vector2i(2560, 1392)]


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	assert(ProjectSettings.get_setting("display/window/stretch/mode") == "disabled")
	var shell: Control = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(shell)
	await process_frame
	var reference_sizes := {}
	for viewport in VIEWPORTS:
		root.size = viewport
		await process_frame
		var menu: Control = shell.get_node("%CommandBarHost")
		var rail: Control = shell.get_node("%DomainNavigation")
		var document: Control = shell.get_node("%DocumentHost")
		assert(shell.size.round() == Vector2(viewport))
		assert(document.get_global_rect().end.x <= viewport.x)
		var sizes := {"menuHeight": menu.size.y, "railWidth": rail.size.x}
		if reference_sizes.is_empty(): reference_sizes = sizes
		else:
			assert(is_equal_approx(float(sizes.menuHeight), float(reference_sizes.menuHeight)))
			assert(is_equal_approx(float(sizes.railWidth), float(reference_sizes.railWidth)))
	shell.free()
	for frame in 3: await process_frame
	print("PROVIDENCE_NATIVE_WINDOW_SCALING_OK mode=disabled controls=constant canvas=expanded viewports=2")
	quit(0)
