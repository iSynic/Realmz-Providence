extends "res://tools/validate_map_paint_behavior.gd"

class CustomBridge extends BehaviorBridge:
	var custom_writes := 0
	var drop_custom := false
	var reject_custom := false
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method == "custom-landlook.apply" and reject_custom:
			reject_custom = false; return {"ok":false,"error":"Controlled Custom Landlook rejection"}
		var response: Dictionary = super._request(method, params)
		if method == "custom-landlook.apply" and response.get("ok", false):
			custom_writes += 1
			if drop_custom: drop_custom = false; return {"ok":false,"outcomeUnknown":true,"error":"Controlled Custom Landlook reply loss"}
		return response


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or not args[0].get_file().begins_with("providence-ui-paint-"): push_error("A disposable Custom Landlook output root is required"); quit(1); return
	var prior := OS.get_environment("PROVIDENCE_PROJECT_PATH"); OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.size = Vector2i(1600, 900); root.gui_embed_subwindows = true
	var shell: Control = load("res://src/editor_shell.tscn").instantiate(); shell.set_script(CheckedShell); root.add_child(shell)
	await _frames(3); shell._bridge.stop(); shell._bridge = CustomBridge.new(args[0].path_join("custom-settings.cfg"))
	var created: Dictionary = shell._bridge.create_project("custom-landlooks", args[0].path_join("custom-project"))
	if _check(created.get("ok", false), "Custom Landlook project creation failed"):
		await shell._activate_session(created)
		if await _setup(shell) and await _custom_behavior(shell, args[0]) and await _custom_artwork(shell, args[0]):
			await shell._maps.chrome.request_tool("paint")
			await _settle(shell)
			_check(shell._maps.paint.workspace.tiles_dock.ui.customization.is_visible_in_tree(), "Custom Landlook workflow did not expose its originating Paint control")
			await _stock_clone(shell)
			await _clone_custom(shell)
			await _import_custom(shell, args[0])
			await _custom_failure_and_recovery(shell)
			await _custom_persistence(shell, args[0].path_join("custom-project"))
	shell.free(); await _frames(2); OS.set_environment("PROVIDENCE_PROJECT_PATH", prior)
	if not _failed: print("PROVIDENCE_MAP_PAINT_CUSTOM_OK clone-allocation preview-pure atomic-art-behavior-map exact-resource protected-import unchanged-history rejected-retained original-result no-replay stale cancel-focus save-reopen teardown")
	quit(1 if _failed else 0)


func _custom_artwork(shell, output: String) -> bool:
	var image := Image.create(640, 320, false, Image.FORMAT_RGBA8); image.fill(Color.WHITE)
	var path := output.path_join("custom-atlas.png"); image.save_png(path)
	return _mutate(shell, "asset.import", {"path":path,"asset":{"identity":"custom-fixture","label":"Custom 1 fixture","kind":"tileset","mimeType":"image/png","classicResource":{"resourceType":"PICT","resourceId":306},"width":640,"height":320,"tileWidth":32,"tileHeight":32,"columns":20,"rows":10,"landlook":6,"source":"Controlled native command fixture"}})


func _clone_custom(shell) -> void:
	var controller = shell._maps.custom_landlooks; var window = controller.view
	await controller.open(); await _settle(shell)
	_check(window.visible and window.get_node("%CustomAtlas").texture != null, "Custom template artwork was unavailable")
	for viewport in [Vector2i(1920,1080),Vector2i(1600,900)]:
		root.size = viewport; window.popup_centered(); await _frames(2)
		_check(window.size.x <= root.size.x and window.size.y <= root.size.y and window.get_node("%ApplyCustom").get_global_rect().end.y <= window.size.y, "Custom Landlook footer overflowed a certified viewport")
	var revision: int = shell._session_view.revision
	window.get_node("%Custom7").pressed.emit(); await _settle(shell)
	await controller.review()
	_check(window.review_is_current() and shell._session_view.revision == revision and window.get_node("%AffectedMaps").item_count == 1, "Custom clone review wrote early or omitted its map")
	window.cancel(); await _frames(2)
	_check(window.visible and window.get_node("%DiscardCustomPrompt").visible, "Dirty clone close skipped the discard choice")
	window.get_node("%DiscardCustomPrompt").hide()
	window.get_node("%EditCustomBehavior").pressed.emit(); await _frames(2)
	var navigation: ConfirmationDialog = window.get_node("%BehaviorNavigation")
	_check(navigation.visible and navigation.get_parent() == window, "Behavior navigation did not retain nested modal ownership")
	navigation.hide(); navigation.canceled.emit(); await _frames(2)
	_check(window.visible and window.review_is_current() and shell._session_view.revision == revision, "Canceling behavior navigation lost the Landlook draft")
	await controller.apply_review(); await _settle(shell)
	_check(not window.visible and shell._session_view.revision == revision + 1, "Custom clone was not one atomic acknowledged command")
	_check(_current_look(shell) == 7, "Custom clone did not assign its originating map")
	await shell._undo(); _check(_current_look(shell) == 6, "Custom clone Undo did not restore the map")
	await shell._redo(); _check(_current_look(shell) == 7, "Custom clone Redo did not restore the map")
	await controller.open(); await _settle(shell)
	window.cancel(); await _frames(2)
	_check(not window.visible and shell._maps.paint.workspace.tiles_dock.ui.customization.has_focus(), "Unchanged cancellation did not restore focus")


func _stock_clone(shell) -> void:
	var controller = shell._maps.custom_landlooks; var window = controller.view
	await controller.open(); await _settle(shell)
	var sources: OptionButton = window.get_node("%SourceTemplate")
	var stock := sources.get_item_index(0)
	_check(stock >= 0 and sources.get_item_metadata(stock).available, "Fresh-project stock behavior and artwork were not available from configured support")
	sources.select(stock); sources.item_selected.emit(stock); window.get_node("%Custom8").pressed.emit(); await _settle(shell)
	var reviewed: Dictionary = await controller.review()
	if not _check(window.review_is_current(), "Stock-to-custom cloning was unavailable: " + str(reviewed)): window.dismiss(); return
	await controller.apply_review(); await _settle(shell)
	_check(_current_look(shell) == 8, "Stock-to-custom clone did not assign the new scenario-owned look")
	await shell._undo(); _check(_current_look(shell) == 6, "Stock-to-custom Undo did not restore the original map")


func _import_custom(shell, output: String) -> void:
	var controller = shell._maps.custom_landlooks; var window = controller.view
	await controller.open(); await _settle(shell)
	window.get_node("%Operation").select(1); window.get_node("%Operation").item_selected.emit(1)
	window.get_node("%Custom7").pressed.emit(); await _settle(shell)
	window.get_node("%ImportMode").select(2); window.get_node("%ImportMode").item_selected.emit(2)
	window.get_node("%ReplaceCustom").button_pressed = true
	var image := Image.create(32, 32, false, Image.FORMAT_RGBA8); image.fill(Color.BLACK)
	var path := output.path_join("one-tile.png"); image.save_png(path)
	window.get_node("%SourcePath").text = path; window.get_node("%SourcePath").text_changed.emit(path)
	window.get_node("%TargetTile").value = 60
	var revision: int = shell._session_view.revision
	var invalid: Dictionary = await controller.review()
	_check(not invalid.get("ok", false) and shell._session_view.revision == revision and int(window.draft().tile) == 60, "Protected tile import changed the project or lost its draft")
	window.get_node("%TargetTile").value = 1; await controller.review()
	_check(window.review_is_current(), "One-tile import did not produce an applicable review")
	await controller.apply_review(); await _settle(shell)
	_check(shell._session_view.revision == revision + 1, "Artwork import did not commit once")
	await controller.open(); await _settle(shell)
	window.get_node("%ReplaceCustom").button_pressed = true; window.get_node("%Custom7").pressed.emit(); await _settle(shell)
	window.get_node("%SourceTemplate").select(window.get_node("%SourceTemplate").get_item_index(7)); window.get_node("%SourceTemplate").item_selected.emit(window.get_node("%SourceTemplate").selected); await _settle(shell)
	await controller.review()
	_check(not window.review_is_current(), "Copying the same custom artwork and behavior created a needless history step")
	window.dismiss()


func _custom_failure_and_recovery(shell) -> void:
	var controller = shell._maps.custom_landlooks; var window = controller.view
	await controller.open(); await _settle(shell); window.get_node("%Custom8").pressed.emit(); await _settle(shell)
	await controller.review(); shell._bridge.reject_custom = true
	var rejected: Dictionary = await controller.apply_review()
	_check(not rejected.get("ok", false) and window.has_unapplied_changes() and int(window.draft().destination) == 8, "Rejected clone lost its draft")
	await controller.review(); shell._bridge.drop_custom = true
	var writes: int = shell._bridge.custom_writes
	var lost: Dictionary = await controller.apply_review()
	_check(lost.get("outcomeUnknown", false) and window.get_node("%RecoverCustom").visible, "Uncertain clone did not offer original-result recovery")
	await controller.check_original(); await _settle(shell)
	_check(not window.visible and shell._bridge.custom_writes == writes + 1 and _current_look(shell) == 8, "Clone recovery replayed a mutation or lost the committed map")
	await controller.open(); await _settle(shell); window.get_node("%Custom7").pressed.emit(); await _settle(shell)
	var navigated: Dictionary = await shell._maps.document.load_map("land:0"); await _settle(shell)
	_check(navigated.get("ok", false), "Custom stale-destination navigation failed: " + str(navigated))
	var stale: Dictionary = await controller.review()
	_check(not window.visible and stale.get("stale", false), "A stale Custom Landlook destination remained authorable: " + str({"identity":shell._maps.document.identity,"visible":window.visible,"response":stale}))


func _custom_persistence(shell, path: String) -> void:
	await shell._project_session.save()
	var response: Dictionary = shell._bridge.start_project(path)
	_check(response.get("ok", false), "Custom Landlook saved project did not reopen")
	await shell._activate_session(response); await shell._maps.document.load_map("land:1"); await _settle(shell)
	_check(_current_look(shell) == 8, "Custom Landlook assignment was not persisted")
	await shell._maps.custom_landlooks.open(); await _settle(shell)
	_check(shell._maps.custom_landlooks.view.get_node("%CustomAtlas").texture != null, "Custom artwork was not readable after reopen")
	shell._maps.custom_landlooks.view.dismiss()


func _current_look(shell) -> int:
	var response: Dictionary = shell._bridge.request("map.open", {"identity":shell._maps.document.identity})
	return int(response.result.map.runtime.landlook) if response.get("ok", false) else -1
