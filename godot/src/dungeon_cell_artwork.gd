extends RefCounted


static func derive_atlas(projection: Dictionary, resolved: Image = null) -> Image:
	if not projection.get("available", false) or projection.get("renderMode", "") != "dungeon-top-down": return null
	if int(projection.get("tileWidth", 0)) != 32 or int(projection.get("tileHeight", 0)) != 32: return null
	if int(projection.get("columns", 0)) != 20 or int(projection.get("rows", 0)) != 20: return null
	if resolved == null:
		resolved = Image.new()
		if resolved.load_png_from_buffer(Marshalls.base64_to_raw(str(projection.get("base64", "")))) != OK: return null
	if resolved.get_size() != Vector2i(640, 640): return null
	# The exact shared resource stays intact; only Dungeon presentation uses this crop and white key.
	var image := resolved.get_region(Rect2i(576, 320, 64, 64))
	image.convert(Image.FORMAT_RGBA8)
	for y in 64:
		for x in 64:
			var color := image.get_pixel(x, y)
			if minf(color.r, minf(color.g, color.b)) > 245.0 / 255.0:
				color.a = 0; image.set_pixel(x, y, color)
	return image


static func draw_sprites(canvas: CanvasItem, destination: Rect2, texture: Texture2D, columns: int, tile_size: Vector2i, layers: int) -> void:
	_draw_index(canvas, destination, texture, columns, tile_size, 15)
	for layer in 7:
		if layers & (1 << layer): _draw_index(canvas, destination, texture, columns, tile_size, layer)


static func _draw_index(canvas: CanvasItem, destination: Rect2, texture: Texture2D, columns: int, tile_size: Vector2i, index: int) -> void:
	var source := Rect2(Vector2(index % columns, index / columns) * Vector2(tile_size), Vector2(tile_size))
	canvas.draw_texture_rect_region(texture, destination, source)


static func draw_behavior(canvas: CanvasItem, destination: Rect2, overlays: int) -> void:
	var base := minf(destination.size.x, destination.size.y)
	if overlays & 1:
		canvas.draw_arc(destination.get_center(), maxf(2.0, base * 0.22), 0.0, TAU, 16, Color("39ff35"), maxf(1.0, base / 12.0))
	for index in range(4):
		if overlays & (1 << (index + 1)):
			_draw_arrow(canvas, destination, [Vector2.UP, Vector2.RIGHT, Vector2.DOWN, Vector2.LEFT][index])
	if overlays & (1 << 5): _draw_no_wall(canvas, destination)


static func _draw_arrow(canvas: CanvasItem, destination: Rect2, direction: Vector2) -> void:
	var base := minf(destination.size.x, destination.size.y)
	var center := destination.get_center()
	var tip := center + direction * base * 0.35
	var side := Vector2(-direction.y, direction.x)
	var wing_center := tip - direction * base * 0.22
	var points := PackedVector2Array([tip, wing_center + side * base * 0.16, wing_center - side * base * 0.16])
	canvas.draw_colored_polygon(points, Color("05070a9e"))
	canvas.draw_polyline(PackedVector2Array([points[0], points[1], points[2], points[0]]), Color("f5f2cf"), maxf(1.0, base / 11.0))


static func _draw_no_wall(canvas: CanvasItem, destination: Rect2) -> void:
	var base := minf(destination.size.x, destination.size.y)
	var size := maxf(1.0, floorf(base / 9.0))
	var step := maxf(1.0, floorf(size * 1.15))
	var center := destination.get_center() - Vector2.ONE * size * 0.5
	for offset in [Vector2(0.0, -step), Vector2(-step, 0.0), Vector2(step, 0.0), Vector2(0.0, step)]:
		canvas.draw_rect(Rect2(center + offset, Vector2.ONE * size), Color("00e5ff"))
	canvas.draw_rect(Rect2(center, Vector2.ONE * size), Color("35ff46"))
