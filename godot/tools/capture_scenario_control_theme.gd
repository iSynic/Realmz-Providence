extends SceneTree

const SPECIMEN = preload("res://tools/scenario_control_specimen.tscn")


func _initialize() -> void:
	call_deferred("_capture")


func _capture() -> void:
	var output := OS.get_environment("PROVIDENCE_THEME_CAPTURE_PATH")
	if output.is_empty():
		push_error("Set PROVIDENCE_THEME_CAPTURE_PATH to the bounded review PNG path")
		quit(1)
		return
	root.size = Vector2i(1600, 1380)
	root.content_scale_size = root.size
	var heading := Label.new()
	heading.text = "NATIVE SCENARIO CONTROL STATES · independent viewports · controlled samples, not project data"
	heading.position = Vector2(16, 16)
	root.add_child(heading)
	var modes := ["dark", "light", "high-contrast"]
	var densities := ["balanced", "compact"]
	var samples: Array[Dictionary] = []
	for row in range(2):
		for column in range(3):
			var title := Label.new()
			title.text = "%s / %s" % [modes[column], densities[row]]
			title.position = Vector2(16 + column * 528, 52 + row * 650)
			root.add_child(title)
			var host := SubViewportContainer.new()
			host.position = Vector2(16 + column * 528, 80 + row * 650)
			root.add_child(host)
			var viewport := SubViewport.new()
			viewport.size = Vector2i(512, 610)
			host.add_child(viewport)
			var specimen := SPECIMEN.instantiate() as Control
			viewport.add_child(specimen)
			specimen.size = Vector2(512, 610)
			specimen.theme.mode = modes[column]
			specimen.theme.density = densities[row]
			samples.append({"viewport": viewport, "specimen": specimen, "position": host.position})
	for frame in range(4):
		await process_frame
	for sample in samples:
		sample.specimen.size = Vector2(512, 610)
	await process_frame
	await RenderingServer.frame_post_draw
	var sheet := root.get_texture().get_image()
	var focus_paths := ["Content/Navigation/Navigate", "Content/ScenarioName", "Content/AdmissionPolicy", "Content/EvidenceDisclosure", "Content/AdmissionPolicy", "Content/ScenarioName"]
	for index in range(samples.size()):
		var sample := samples[index]
		var specimen: Control = sample.specimen
		var viewport: SubViewport = sample.viewport
		var target := specimen.get_node(focus_paths[index]) as Control
		if target is ItemList:
			target.select(2)
		if target is Button and target.toggle_mode:
			target.button_pressed = true
		target.grab_focus()
		await process_frame
		await RenderingServer.frame_post_draw
		print("PROVIDENCE_THEME_GEOMETRY %s size=%s minimum=%s" % [index, specimen.size, specimen.get_combined_minimum_size()])
		if viewport.gui_get_focus_owner() != target:
			push_error("Theme capture lost real focus")
			quit(1)
			return
		sheet.blit_rect(viewport.get_texture().get_image(), Rect2i(Vector2i.ZERO, viewport.size), Vector2i(sample.position))
	var error := sheet.save_png(output)
	if error != OK:
		push_error("Could not save native theme review: %s" % error_string(error))
		quit(1)
		return
	print("PROVIDENCE_THEME_CAPTURE_OK " + output)
	quit(0)
