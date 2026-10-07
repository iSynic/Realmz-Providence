extends SceneTree

const Export = preload("res://src/map_image_export.gd")
var _scratch := ""


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	_scratch = OS.get_environment("PROVIDENCE_MAP_EXPORT_TEST_ROOT")
	assert(not _scratch.is_empty(), "The test needs a caller-owned scratch directory.")
	var canvas := preload("res://src/map_canvas.gd").new()
	canvas.size = Vector2(900, 900)
	root.add_child(canvas)
	await process_frame
	var tiles: Array = []; tiles.resize(8100); tiles.fill(1); tiles[0] = -30
	canvas.set_document(tiles, [{"coordinate": {"x": 2, "y": 2}, "overlayKind": "battle"}])
	assert(canvas.set_render_atlas(_land_atlas()))
	canvas.set_real_tiles_visible(false)
	canvas.select_cell(4, 4)
	canvas.terrain_preview[Vector2i(5, 5)] = 2
	var overlay := preload("res://src/map_view_overlay.gd").new()
	canvas.add_child(overlay)
	overlay.set_hints({"secretCells": [{"x": 1, "y": 1}]})
	overlay.configure({"secrets": true}, [{"left": 4, "top": 4, "right": 6, "bottom": 6, "nativeId": 2}])
	var regions := preload("res://src/random_region_overlay.gd").new()
	canvas.add_child(regions)
	regions.regions = [{"identity": "land:0:rect:0", "left": 7, "top": 7, "right": 9, "bottom": 9},
		{"identity": "land:0:rect:1", "left": 10, "top": 10, "right": 12, "bottom": 12}]
	regions.set_display_enabled(true)
	regions.filter_active = true; regions.visible_ids = {"land:0:rect:0": true}
	var navigation := canvas.read_navigation_state()
	var plain: Image = await Export.render(root, canvas, false, false)
	assert(plain != null and plain.get_size() == Vector2i(2880, 2880))
	assert(plain.get_pixel(16, 16).r > 0.9, "Special artwork must survive without overlays.")
	assert(plain.get_pixel(176, 176).g > 0.9, "Unapplied terrain must not appear in the JPEG.")
	var marked: Image = await Export.render(root, canvas, false, true)
	assert(marked.get_pixel(80, 75).r > 0.5, "Enabled Action Points must be included.")
	assert(marked.get_pixel(32, 45) != plain.get_pixel(32, 45), "Active secrets must be included.")
	assert(marked.get_pixel(128, 172) != plain.get_pixel(128, 172), "Selected Player Maps must be included.")
	assert(marked.get_pixel(224, 268) != plain.get_pixel(224, 268), "Selected random regions must be included.")
	assert(marked.get_pixel(320, 364) == plain.get_pixel(320, 364), "Filtered regions must stay excluded.")
	assert(canvas.read_navigation_state() == navigation, "Export changed navigation or selection.")
	canvas.set_action_points_visible(false)
	var filtered: Image = await Export.render(root, canvas, true, true)
	assert(filtered.get_size() == canvas.image_export_size(true))
	var cell_pixels := filtered.get_width() / 90.0
	assert(filtered.get_pixel(roundi(cell_pixels * 2.5), roundi(cell_pixels * 2.5)).g > 0.9)
	assert(Export.save(plain, _scratch.path_join("land.jpg")) == OK)
	var reopened := Image.load_from_file(_scratch.path_join("land.jpg"))
	assert(reopened.get_size() == plain.get_size() and reopened.get_pixel(16, 16).r > 0.8)
	assert(Export.save(plain, _scratch.path_join("absent/subdir/map.jpg")) != OK)
	assert(Export.save(plain, _scratch.path_join("map.png")) == ERR_INVALID_PARAMETER)
	await _dungeon(canvas)
	await _controls(canvas)
	canvas.queue_free()
	await process_frame
	print("PROVIDENCE_MAP_IMAGE_EXPORT_OK native zoom overlays real-artwork special dungeon jpeg failure no-state-change controls")
	quit()


func _land_atlas() -> Dictionary:
	var atlas := Image.create(32, 32, false, Image.FORMAT_RGB8); atlas.fill(Color.GREEN)
	var special := Image.create(32, 32, false, Image.FORMAT_RGBA8); special.fill(Color.RED)
	return {"available": true, "tilesetId": "custom-2", "tileWidth": 32, "tileHeight": 32,
		"columns": 1, "rows": 1, "baseTile": 1, "base64": Marshalls.raw_to_base64(atlas.save_png_to_buffer()),
		"overlays": [{"resourceId": -30, "base64": Marshalls.raw_to_base64(special.save_png_to_buffer())}]}


func _dungeon(canvas: ProvidenceMapCanvas) -> void:
	var atlas := Image.create(640, 640, false, Image.FORMAT_RGBA8); atlas.fill(Color.WHITE)
	atlas.fill_rect(Rect2i(624, 368, 16, 16), Color.BLACK)
	atlas.fill_rect(Rect2i(576, 320, 16, 16), Color.RED)
	var sprites: Array = []; sprites.resize(8100); sprites.fill(0); sprites[0] = 1
	var behaviors: Array = []; behaviors.resize(8100); behaviors.fill(1)
	assert(canvas.set_render_atlas({"available": true, "tilesetId": "dungeon-302", "renderMode": "dungeon-top-down",
		"tileWidth": 32, "tileHeight": 32, "columns": 20, "rows": 20,
		"base64": Marshalls.raw_to_base64(atlas.save_png_to_buffer()),
		"dungeonRender": {"format": "realmz.dungeon-render.v1", "spriteLayerMasks": sprites, "behaviorOverlayMasks": behaviors}}))
	var plain: Image = await Export.render(root, canvas, false, false)
	var marked: Image = await Export.render(root, canvas, false, true)
	assert(plain.get_pixel(16, 16).r > 0.9, "Dungeon sprites are artwork, not optional overlays.")
	assert(plain.get_pixel(55, 48).g < 0.1 and marked.get_pixel(55, 48).g > 0.5)
	assert(Export.save(plain, _scratch.path_join("dungeon.jpg")) == OK)


func _controls(canvas: ProvidenceMapCanvas) -> void:
	for route: String in ["land", "dungeon"]:
		var editor: Control = load("res://src/%s_editor.tscn" % route).instantiate()
		root.add_child(editor)
		await process_frame
		assert(editor.get_node("%ExportMapImage").text == "Export JPEG…")
		var dialog := editor.get_node("%MapImageExport")
		assert(dialog.get_node("%ExportQuality").value == 70)
		assert(dialog.get_node("%ExportFile").file_mode == FileDialog.FILE_MODE_SAVE_FILE)
		for viewport_size in [Vector2i(1920, 1080), Vector2i(1600, 900)]:
			root.size = viewport_size
			editor.size = Vector2(viewport_size) - Vector2(380, 100)
			dialog.open(canvas, route)
			await process_frame
			assert(dialog.size.x <= viewport_size.x and dialog.size.y <= viewport_size.y)
			assert(not dialog.get_ok_button().disabled)
			assert(editor.get_node("%ExportMapImage").get_global_rect().end.x <= editor.size.x)
			dialog.hide()
		dialog.get_node("%ExportScale").select(1)
		dialog.get_node("%ExportOverlays").button_pressed = false
		await dialog._save(_scratch.path_join(route + "-dialog.jpg"))
		assert(dialog.get_node("%ExportStatus").text.begins_with("Saved "))
		assert(Image.load_from_file(_scratch.path_join(route + "-dialog.jpg")).get_size() == canvas.image_export_size(true))
		await dialog._save(_scratch.path_join("absent/failed.jpg"))
		assert(dialog.get_node("%ExportStatus").text.begins_with("Could not save JPEG"))
		assert(not dialog.get_cancel_button().disabled and not dialog.get_ok_button().disabled)
		editor.queue_free()
		await process_frame
