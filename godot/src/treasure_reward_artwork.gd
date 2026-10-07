extends RefCounted

# Only the known stock reward has an opaque neutral backdrop. Custom resources
# and the canonical source pixels retain their own transparency and ownership.
const STOCK_GOLD_RGBA := "21d14722391c42695f9192426034335b1b77e1243cfb6c3b95b73ab50d0d0d07"


static func gold_material(texture: Texture2D) -> ShaderMaterial:
	if texture == null: return null
	var image := texture.get_image()
	if image == null or image.get_size() != Vector2i(32, 32): return null
	image.convert(Image.FORMAT_RGBA8)
	var hash := HashingContext.new()
	hash.start(HashingContext.HASH_SHA256); hash.update(image.get_data())
	if hash.finish().hex_encode() != STOCK_GOLD_RGBA: return null
	var material := ShaderMaterial.new()
	material.shader = preload("res://src/treasure_gold.gdshader")
	return material
