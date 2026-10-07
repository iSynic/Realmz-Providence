extends SceneTree


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var gallery := ItemList.new()
	gallery.set_script(load("res://src/artwork_gallery.gd"))
	gallery.max_columns = 5
	gallery.fixed_icon_size = Vector2i(96, 96)
	root.add_child(gallery)
	for index in 25:
		gallery.add_item("Artwork %d" % (9000 + index))
	for width in [952, 964, 1272, 1284]:
		gallery.size = Vector2(width, 590)
		await process_frame
		await process_frame
		var first: Rect2 = gallery.get_item_rect(0)
		var fifth: Rect2 = gallery.get_item_rect(4)
		var sixth: Rect2 = gallery.get_item_rect(5)
		for index in gallery.item_count:
			if absf(gallery.card_bounds(0).size.x - gallery.card_bounds(index).size.x) > 1:
				push_error("Gallery columns must have equal widths")
				quit(1)
				return
		if fifth.position.y != first.position.y or sixth.position.y <= first.position.y or fifth.end.x < width - 40 or fifth.end.x > width:
			push_error("Gallery must fill five columns without horizontal overflow at %d" % width)
			quit(1)
			return
		gallery.select(0)
		gallery.release_focus()
		if not gallery.is_selected(0):
			push_error("Gallery selection was lost when focus moved")
			quit(1)
			return
	await _check_music_rows(gallery)
	gallery.queue_free()
	var column := VBoxContainer.new()
	root.add_child(column)
	column.size = Vector2(964, 590)
	var bounded := ItemList.new()
	bounded.set_script(load("res://src/artwork_gallery.gd"))
	bounded.set("fit_content", true)
	bounded.max_columns = 5
	bounded.fixed_icon_size = Vector2i(96, 96)
	var gutter := MarginContainer.new()
	gutter.add_theme_constant_override("margin_left", -4)
	gutter.add_theme_constant_override("margin_right", -4)
	column.add_child(gutter)
	gutter.add_child(bounded)
	var footer := Label.new()
	footer.text = "Pictures shown"
	column.add_child(footer)
	var pixels := Image.create(96, 96, false, Image.FORMAT_RGBA8)
	var icon := ImageTexture.create_from_image(pixels)
	for index in 10:
		bounded.add_item("Artwork %d" % index, icon)
	for frame in 6:
		await process_frame
	bounded._fit_content()
	for frame in 3:
		await process_frame
	assert(footer.position.y < 400 and footer.position.y >= bounded.size.y)
	for index in bounded.item_count:
		var card: Rect2 = bounded.card_bounds(index)
		assert(bounded.get_item_at_position(card.get_center(), true) == index)
		assert(absf(card.size.x - bounded.card_bounds(0).size.x) <= 1)
	for index in 40:
		bounded.add_item("Artwork %d" % (index + 10), icon)
	bounded._fit_content()
	for frame in 6:
		await process_frame
	assert(footer.position.y + footer.size.y <= column.size.y + 1)
	bounded.maximum_content_height = 302.0
	bounded._fit_content()
	for frame in 6:
		await process_frame
	assert(bounded.size.y <= 302.0)
	assert(bounded.get_v_scroll_bar().max_value > bounded.get_v_scroll_bar().page)
	bounded.get_v_scroll_bar().value = bounded.get_v_scroll_bar().max_value
	await process_frame
	var last_card: Rect2 = bounded.card_bounds(bounded.item_count - 1)
	last_card.position.y -= bounded.get_v_scroll_bar().value
	assert(last_card.end.y <= bounded.size.y + 1)
	assert(bounded.get_item_at_position(last_card.get_center(), true) == bounded.item_count - 1)
	column.queue_free()
	quit(0)


func _check_music_rows(gallery: ItemList) -> void:
	gallery.clear()
	gallery.set_music_rows(true)
	gallery.add_item("Custom 1 · Trouble music\nScenario · Standard MOD · Exact source retained")
	gallery.add_item("Custom 2 · Empty slot\nImport a standard MOD into this slot.")
	await process_frame
	assert(gallery.max_columns == 1 and gallery.max_text_lines == 2)
	assert(gallery.get_item_rect(1).position.y >= gallery.get_item_rect(0).end.y)
	gallery.set_music_rows(false)
	assert(gallery.max_columns == 5 and gallery.fixed_icon_size == Vector2i(96,96))
	print("PROVIDENCE_ARTWORK_GALLERY_OK five-columns widths=952,964,1272,1284 equal-outlines selection-retained")
