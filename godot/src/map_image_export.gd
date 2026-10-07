extends RefCounted

const DEFAULT_QUALITY := 70
const MAX_PIXELS := 64 * 1024 * 1024


static func render(owner: Node, canvas: ProvidenceMapCanvas, current_zoom: bool, overlays: bool) -> Image:
	var extent := canvas.image_export_size(current_zoom)
	if extent.x <= 0 or extent.x > 16384 or extent.x * extent.y > MAX_PIXELS: return null
	var viewport := SubViewport.new()
	viewport.size = extent
	viewport.disable_3d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ONCE
	viewport.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
	viewport.add_child(canvas.create_image_export(extent.x / 90.0, overlays))
	owner.add_child(viewport)
	await RenderingServer.frame_post_draw
	var image := viewport.get_texture().get_image()
	viewport.queue_free()
	return image


static func save(image: Image, path: String, quality: int = DEFAULT_QUALITY) -> Error:
	if image == null or image.is_empty(): return ERR_INVALID_DATA
	if path.get_extension().to_lower() not in ["jpg", "jpeg"]: return ERR_INVALID_PARAMETER
	if not DirAccess.dir_exists_absolute(path.get_base_dir()): return ERR_FILE_BAD_PATH
	return image.save_jpg(path, clampf(quality / 100.0, 0.01, 1.0))
