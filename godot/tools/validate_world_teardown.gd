extends SceneTree


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	var shell: Control = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(shell)
	await process_frame
	var owners := {"maps": weakref(shell._maps), "document": weakref(shell._maps.document), "regions": weakref(shell._maps.regions),
		"tileCatalog": weakref(shell._maps.tile_catalog),
		"worldSpecial": weakref(shell._maps.world_special),
		"specialPlacement": weakref(shell._maps.special_placement),
		"specialPalette": weakref(shell._maps.special_placement.palette),
		"apPlacement": weakref(shell._maps.ap_placement),
		"cellBehavior": weakref(shell._maps.cell_behavior),
		"smartTerrain": weakref(shell._maps.smart_terrain),
		"tileBehavior": weakref(shell._maps.tile_behavior),
		"customLandlooks": weakref(shell._maps.custom_landlooks),
		"settings": weakref(shell._maps.settings), "paint": weakref(shell._maps.paint), "palette": weakref(shell._maps.paint.workspace), "landAuthoring": weakref(shell._maps.land_authoring), "paintResources": weakref(shell._maps.paint_resources), "dungeonStamps": weakref(shell._maps.dungeon_stamps)}
	shell.free()
	await process_frame
	await process_frame
	for key in owners:
		var retained: Variant = owners[key].get_ref()
		if retained != null:
			push_error("World owner retained after teardown: " + str(key))
			quit(1)
			return
	print("PROVIDENCE_WORLD_TEARDOWN_OK")
	quit()
