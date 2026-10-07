extends RefCounted

const FEATURES := ["Wall", "HorizontalDoor", "VerticalDoor", "Stairs", "Column", "Archway"]


static func apply(dock: Control, projection: Dictionary) -> void:
	for feature: String in FEATURES:
		dock.get_node("%" + feature + "Preview").texture = null
	var image: Image = preload("res://src/dungeon_cell_artwork.gd").derive_atlas(projection)
	if image == null: return
	var base := image.get_region(Rect2i(48, 48, 16, 16))
	for index in range(FEATURES.size()):
		var swatch: Image = base.duplicate()
		if index < 5:
			var overlay := image.get_region(Rect2i(index % 4 * 16, index / 4 * 16, 16, 16))
			swatch.blend_rect(overlay, Rect2i(0, 0, 16, 16), Vector2i.ZERO)
		else:
			for y in range(16):
				for x in range(16):
					var distance := Vector2(x - 8, y - 8).length()
					if distance >= 3.0 and distance <= 4.5: swatch.set_pixel(x, y, Color("39ff35"))
		dock.get_node("%" + FEATURES[index] + "Preview").texture = ImageTexture.create_from_image(swatch)
