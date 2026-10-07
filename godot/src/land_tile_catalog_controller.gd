extends RefCounted

var _document
var _view
var _dock
var _catalog: Dictionary = {}


func initialize(document, view, dock) -> void:
	_document = document; _view = view; _dock = dock
	document.tile_catalog_changed.connect(_present)
	view.atlas_changed.connect(_atlas_changed)


func attach_session(_bridge: RefCounted) -> void:
	_present({})


func _present(catalog: Dictionary) -> void:
	_catalog = catalog.duplicate(true)
	if is_instance_valid(_dock): _dock.set_tile_catalog(_catalog)


func _atlas_changed(atlas: Dictionary) -> void:
	if atlas.has("tileCatalog"): _present(atlas.tileCatalog)
	elif is_instance_valid(_dock): _dock.set_tile_catalog(_catalog)


func label_for_tile(tile: int) -> String:
	for row: Dictionary in _catalog.get("items", []):
		if int(row.tile) == tile: return "%s · tile %d" % [str(row.name), tile]
	return "Terrain tile %d" % tile


func dispose() -> void:
	attach_session(null)
	if _document != null and _document.tile_catalog_changed.is_connected(_present): _document.tile_catalog_changed.disconnect(_present)
	if is_instance_valid(_view) and _view.atlas_changed.is_connected(_atlas_changed): _view.atlas_changed.disconnect(_atlas_changed)
	_document = null; _view = null; _dock = null
