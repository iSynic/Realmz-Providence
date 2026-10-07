extends SceneTree

const Composer = preload("res://src/combat_tile_artwork.gd")


func _initialize() -> void: call_deferred("_run")


func _projection(image: Image, rows: int, identity: String) -> Dictionary:
	return {"available":true,"renderMode":"outdoor-landlook","tilesetId":identity,"columns":20,"rows":rows,
		"tileWidth":32,"tileHeight":32,"base64":Marshalls.raw_to_base64(image.save_png_to_buffer())}


func _run() -> void:
	var land := Image.create(640,320,false,Image.FORMAT_RGBA8); land.fill(Color.GREEN)
	land.fill_rect(Rect2i(0,0,32,32),Color.RED)
	land.fill_rect(Rect2i(480,224,32,32),Color.BLUE)
	var shared := Image.create(640,640,false,Image.FORMAT_RGBA8); shared.fill(Color.WHITE)
	shared.fill_rect(Rect2i(0,320,32,32),Color.YELLOW)
	var source := _projection(land,10,"custom.landlook.7")
	var stock := _projection(shared,20,"dungeon-top-down-302")
	var source_bytes: String = source.base64; var stock_bytes: String = stock.base64
	var composed := Composer.compose(source,stock)
	var atlas = preload("res://src/land_tile_atlas.gd").new(); root.add_child(atlas)
	assert(atlas.set_atlas(composed,400))
	assert(atlas.tile_texture(1).get_image().get_pixel(0,0)==Color.RED)
	assert(atlas.tile_texture(156).get_image().get_pixel(0,0)==Color.BLUE)
	assert(atlas.tile_texture(200).get_image().get_pixel(0,0)==Color.GREEN)
	assert(atlas.tile_texture(201).get_image().get_pixel(0,0)==Color.YELLOW)
	assert(atlas.tile_texture(400).get_image().get_pixel(0,0)==Color.WHITE)
	assert(source.base64==source_bytes and stock.base64==stock_bytes)
	var missing := Composer.compose(source,{"available":false,"reason":"Exact scenario PICT 302 is missing"})
	assert(not missing.available and missing.reason.contains("scenario PICT 302"))
	var malformed := stock.duplicate(true); malformed.rows=10
	assert(not Composer.compose(source,malformed).available)
	malformed=source.duplicate(true); malformed.tileWidth=16
	assert(not Composer.compose(malformed,stock).available)
	print("PROVIDENCE_COMBAT_TILE_ARTWORK_OK active-landlook=1-200 shared=201-400 source-bytes=unchanged malformed=unavailable")
	atlas.free(); quit()
