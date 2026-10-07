extends "res://tools/validate_map_paint_resources.gd"

var _capture_root := ""

class MappingBridge extends "res://src/native_bridge.gd":
	var writes := 0
	var reject := false
	var lose := false
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method == "terrain-mapping.accept" and reject:
			reject = false; return {"ok":false,"error":"Controlled mapping rejection"}
		var response: Dictionary = super._request(method,params)
		if method == "terrain-mapping.accept" and response.get("ok",false):
			writes += 1
			if lose: lose = false; return {"ok":false,"outcomeUnknown":true,"error":"Controlled mapping reply loss"}
		return response


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.is_empty() or not args[0].get_file().begins_with("providence-ui-paint-"): push_error("A disposable mapping root is required"); quit(1); return
	if args.size()>1: _capture_root=args[1]
	var prior := OS.get_environment("PROVIDENCE_PROJECT_PATH"); OS.set_environment("PROVIDENCE_PROJECT_PATH","")
	root.size = Vector2i(1600,900); root.gui_embed_subwindows = true
	var shell: Control = load("res://src/editor_shell.tscn").instantiate(); shell.set_script(CheckedShell); root.add_child(shell)
	await _frames(3); shell._bridge.stop(); shell._bridge = MappingBridge.new(args[0].path_join("mapping-settings.cfg"))
	var path: String = args[0].path_join("mapping-project")
	var created: Dictionary = shell._bridge.create_project("terrain-mapping",path)
	if _check(created.get("ok",false),"Mapping project creation failed"):
		await shell._activate_session(created)
		if await _setup(shell): await _mapping(shell); await _fail_mapping(shell); await _reopen_mapping(shell,path); await _missing_mapping(shell)
	shell.free(); await _frames(2); OS.set_environment("PROVIDENCE_PROJECT_PATH",prior)
	if not _failed: print("PROVIDENCE_MAP_PAINT_MAPPING_OK actual-artwork samples names exclusions cancel focus one-history stale rejected uncertain-no-retry save-reopen")
	quit(1 if _failed else 0)


func _mapping(shell) -> void:
	var controller = shell._maps.terrain_mapping; var view = controller.view
	await controller.open(); await _settle(shell)
	_check(view.visible and view.get_node("%Samples").atlas != null and view.get_node("%Samples").samples.size() == 12,"Mapping did not render actual atlas join samples")
	for viewport in [Vector2i(1920,1080),Vector2i(1600,900)]:
		root.size = viewport; view.popup_centered(); await _frames(3)
		_check(Rect2(Vector2.ZERO,Vector2(view.size)).encloses(view.get_node("%Accept").get_global_rect()),"Mapping footer overflowed its window")
		await _capture_mapping("review",viewport)
	await controller._review("classic-desert"); await _settle(shell)
	await _capture_mapping_both("suggestion")
	controller.discard_draft(); await controller.open()
	var revision: int = shell._session_view.revision; var before := _tiles(shell)
	view.get_node("%Search").text = "17"; view.get_node("%Search").text_changed.emit("17")
	view._select_tile(17)
	view.get_node("%TileName").text = "Reviewed shoreline"; view.get_node("%TileName").text_changed.emit("Reviewed shoreline")
	var key := InputEventKey.new(); key.pressed = true; key.keycode = KEY_ESCAPE; view._unhandled_key_input(key)
	await _frames(2)
	_check(not view.visible and shell._session_view.revision == revision and shell._map_context_sidebar.get_node("%TerrainMapping").has_focus(),"Mapping Escape mutated data or lost focus")
	await controller.open(); view._select_tile(17)
	view.get_node("%TileName").text = "Reviewed shoreline"; view.get_node("%TileName").text_changed.emit("Reviewed shoreline")
	view.get_node("%Exclude").button_pressed = true
	var result: Dictionary = await controller.commit_selected(); await _settle(shell)
	if not _check(result.get("ok",false) and shell._session_view.revision == revision + 1 and _tiles(shell) == before,"Mapping acceptance did not preserve cells or one history entry: " + str(result)): return
	await controller.open()
	_check(view.context.mappingRevision == 1 and view.context.tileCatalog.items[16].name == "Reviewed shoreline","Mapping edits were not reloaded")
	controller.discard_draft(); await shell._undo(); await _settle(shell); await controller.open()
	_check(view.context.mappingRevision == 0,"Undo did not restore absent mapping")
	controller.discard_draft(); await shell._redo(); await _settle(shell)


func _fail_mapping(shell) -> void:
	var controller = shell._maps.terrain_mapping; var view = controller.view
	await controller.open(); view._select_tile(17); view.get_node("%Exclude").button_pressed = false
	_check(view.get_node("%Material").text == "", "Null material rendered as authored text")
	view.get_node("%TileName").text_changed.emit(view.get_node("%TileName").text)
	_check(not view.draft().tileLabels["17"].has("material"), "Editing a name authored a null material label")
	var kept: Dictionary = view.draft(); shell._bridge.reject = true
	var result: Dictionary = await controller.commit_selected()
	_check(not result.get("ok",false) and view.visible and view.draft() == kept and not view.get_node("%Accept").disabled,"Rejected mapping lost draft or acceptance controls")
	await _capture_mapping_both("failed-write")
	var count: int = shell._bridge.writes; shell._bridge.lose = true
	result = await controller.commit_selected()
	_check(result.get("outcomeUnknown",false) and view.get_node("%Cancel").disabled,"Unknown mapping outcome did not lock draft")
	await _capture_mapping_both("recovery")
	controller.discard_draft(); _check(view.visible,"Unknown outcome allowed discard")
	await controller.check_original(); await _settle(shell)
	_check(not view.visible and shell._bridge.writes == count + 1,"Mapping recovery repeated a mutation or left a committed draft")
	await controller.open(); var old_revision: int = view.context.revision
	_mutate(shell,"map.update-cell",{"identity":"land:1","x":50,"y":50,"tile":156})
	result = await controller.commit_selected()
	_check(not result.get("ok",false) and view.visible and view.context.revision == old_revision,"Stale mapping silently accepted a new document revision")
	controller.discard_draft()


func _reopen_mapping(shell, path: String) -> void:
	await shell._project_session.save()
	var reopened: Dictionary = shell._bridge.start_project(path)
	if not _check(reopened.get("ok",false),"Mapping project failed to reopen"): return
	await shell._activate_session(reopened); await shell._maps.document.load_map("land:1"); await _settle(shell)
	await shell._maps.terrain_mapping.open()
	var view = shell._maps.terrain_mapping.view
	_check(view.context.mappingRevision == 2 and view.context.tileCatalog.items[16].name == "Reviewed shoreline","Mapping Save/reopen lost accepted names or revision")
	_check(view.context.tileCatalog.familyAvailability.all(func(row): return row.available),"Removing exclusion failed to restore family availability")
	shell._maps.terrain_mapping.discard_draft()


func _capture_mapping(state:String,viewport:Vector2i) -> void:
	if _capture_root.is_empty() or DisplayServer.get_name()=="headless": return
	await RenderingServer.frame_post_draw
	var path:=_capture_root.path_join("mapping-%s-%dx%d.png"%[state,viewport.x,viewport.y])
	_check(root.get_texture().get_image().save_png(path)==OK,"Could not save mapping capture")


func _capture_mapping_both(state: String) -> void:
	if _capture_root.is_empty(): return
	var view=root.get_node("ProvidenceEditor")._maps.terrain_mapping.view
	for viewport in [Vector2i(1920,1080),Vector2i(1600,900)]:
		root.size=viewport; view.popup_centered(); await _frames(4)
		await _capture_mapping(state,viewport)


func _missing_mapping(shell) -> void:
	var runtime:Dictionary=shell._bridge.request("map.open",{"identity":"land:1"}).result.map.runtime.duplicate(true)
	var missing:=runtime.duplicate(true); missing.landlook=6; missing.tilesetId="classic.landlook.6"
	_check(_mutate(shell,"map-runtime.set",{"identity":"land:1","metadata":_integer_fields(missing)}),"Missing artwork setup failed")
	await shell._maps.document.load_map("land:1"); await _settle(shell)
	var controller=shell._maps.terrain_mapping; var view=controller.view
	var response:Dictionary=await controller.open()
	_check(not response.get("ok",false) and view.visible and view.get_node("%Accept").disabled and view.get_node("%Retry").visible,"Missing artwork did not expose disabled review and retry")
	await _capture_mapping_both("missing")
	view.cancel(); _check(not view.visible,"Missing artwork window could not cancel")
	_check(_mutate(shell,"map-runtime.set",{"identity":"land:1","metadata":_integer_fields(runtime)}),"Artwork restoration failed")
	await shell._maps.document.load_map("land:1"); await _settle(shell)
	await controller.open()
	_check(view.visible and not view.get_node("%Accept").disabled and not view.get_node("%Retry").visible,"Restored artwork did not restore review")
	controller.discard_draft()


func _integer_fields(value: Variant) -> Variant:
	if value is float: return int(value)
	if value is Array: return value.map(_integer_fields)
	if value is Dictionary:
		var result: Dictionary = {}
		for key in value: result[key] = _integer_fields(value[key])
		return result
	return value
