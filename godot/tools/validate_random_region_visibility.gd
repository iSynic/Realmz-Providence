extends SceneTree


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	root.size = Vector2i(1600,900)
	var land: Control = preload("res://src/land_editor.tscn").instantiate()
	root.add_child(land)
	await process_frame
	land.document_identity = "land:0"
	land.set_document(_tiles(),[])
	var filter: Button = land.get_node("%MapViewFilters").get_node("%RandomAreasFilter")
	var overlay: Control = land.get_node("%RandomRegionOverlay")
	var requests: Array = []
	land.section_requested.connect(func(section): requests.append(section))
	var region := {"identity":"land:0:rect:3","left":1,"top":2,"right":10,"bottom":12}
	overlay.set_document("land:0",[region])
	land.set_view_projection({"map":{"identity":"land:0","runtime":{"randomRectangles":[region]}}})
	assert(not overlay.visible)
	filter.button_pressed = true
	assert(overlay.visible and requests.is_empty())
	overlay.configure([region],{"identity":region.identity,"left":3,"top":4,"right":12,"bottom":14},3)
	overlay.set_drawing(true)
	var draft: Dictionary = overlay.draft.duplicate(true)
	filter.button_pressed = false
	assert(not overlay.visible and not overlay.drawing and overlay.draft == draft)
	filter.button_pressed = true
	assert(overlay.visible and overlay.draft == draft and not overlay.drawing)
	var saved: Dictionary = land.read_navigation_state()
	filter.button_pressed = false
	await land.restore_navigation_state(saved)
	assert(overlay.visible and filter.button_pressed)
	filter.button_pressed = false
	var hidden: Dictionary = land.read_navigation_state()
	overlay.set_drawing(true)
	assert(filter.button_pressed and overlay.visible)
	await land.restore_navigation_state(hidden)
	assert(not overlay.visible and not filter.button_pressed and not overlay.drawing)
	overlay.clear_draft()
	assert(overlay.draft.is_empty() and overlay.regions == [region])
	overlay.set_document("land:1",[])
	assert(overlay.regions.is_empty() and overlay.draft.is_empty())
	land.free()
	print("PROVIDENCE_RANDOM_REGION_VISIBILITY_OK toggle-without-navigation dirty-draft-preserved draw-canceled explicit-resume navigation-restored stale-map-cleared")
	quit()


func _tiles() -> Array:
	var tiles: Array = []; tiles.resize(8100); tiles.fill(1)
	return tiles
