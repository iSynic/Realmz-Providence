extends "res://tools/validate_map_paint_resources.gd"

class SpecialBridge extends ResourceBridge:
	var drop_preview := false
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method == "special-art.preview" and drop_preview:
			drop_preview = false
			return {"ok":false,"outcomeUnknown":true,"error":"Controlled Special Land preview reply loss"}
		return super._request(method,params)


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or not args[0].get_file().begins_with("providence-ui-paint-"): quit(1); return
	var prior := OS.get_environment("PROVIDENCE_PROJECT_PATH"); OS.set_environment("PROVIDENCE_PROJECT_PATH","")
	root.size = Vector2i(1600,900); root.gui_embed_subwindows = true
	var shell: Control = load("res://src/editor_shell.tscn").instantiate(); shell.set_script(CheckedShell); root.add_child(shell)
	await _frames(3); shell._bridge.stop(); shell._bridge = SpecialBridge.new(args[0].path_join("special-settings.cfg"))
	var created: Dictionary = shell._bridge.create_project("special-paint",args[0].path_join("special-project"))
	if _check(created.get("ok",false),"Special placement project creation failed"):
		await shell._activate_session(created)
		if await _setup(shell):
			await _import_special(shell,args[0])
			if not _failed: await _picker_cases(shell)
			if not _failed: await _single_placement(shell)
			if not _failed: await preload("res://tools/world_navigation_checks.gd").new().run(shell, _check, _settle, _mutate)
			if not _failed: await _gallery_cases(shell)
			if not _failed: await _linked_return(shell)
			if not _failed: await _recipe_cases(shell)
			if not _failed: await _special_persistence(shell,args[0].path_join("special-project"))
	shell.free(); await _frames(2); OS.set_environment("PROVIDENCE_PROJECT_PATH",prior)
	if not _failed: print("PROVIDENCE_MAP_PAINT_SPECIAL_OK exact-scenario-stock signed-search payload-preview cancel-focus occupied-destinations direct-placement atomic-history original-result no-replay nested-stamp-cell recipe-artwork read-recovery stale save-reopen teardown")
	quit(1 if _failed else 0)


func _import_special(shell, output: String) -> void:
	var image := Image.create(32,32,false,Image.FORMAT_RGBA8); image.fill(Color(0.2,0.7,0.4))
	image.fill_rect(Rect2i(8,8,16,16),Color(0.9,0.4,0.1))
	var path := output.path_join("special-dome.png"); _check(image.save_png(path)==OK,"Could not create disposable overlay pixels")
	_check(_mutate(shell,"special-land.import",{"path":path,"label":"Scenario Dome","resourceId":-91,"width":32,"height":32,
		"rgbaBase64":Marshalls.raw_to_base64(image.get_data())}),"Scenario Special Land artwork import failed")
	await shell._maps.document.refresh_history(); await _settle(shell)


func _find_special(picker: Window, value: int) -> void:
	picker.get_node("%Search").text = str(value); picker._search(0,false)
	var deadline := Time.get_ticks_msec() + 20000
	while Time.get_ticks_msec() < deadline:
		await process_frame
		if picker.get_node("%Count").text.begins_with("Loading"): continue
		for index in picker._rows.size():
			if int(picker._rows[index].value) == value:
				picker.get_node("%Choices").select(index); picker.get_node("%Choices").item_selected.emit(index); return
		return
	_check(false, "Special artwork search did not finish: " + str(value))


func _picker_cases(shell) -> void:
	var helper = shell._maps.special_placement; var dock = shell._maps.paint.workspace.tiles_dock; var picker: Window = helper._picker
	var revision: int = shell._session_view.revision; var stamp: Dictionary = shell._maps.land_authoring._stamp.duplicate(true)
	helper.choose_for_draft(0,"Reference field",dock.ui.special,helper.select_placement); await _settle(shell); await _find_special(picker,-91); await _settle(shell)
	_check(picker.visible and int(picker.selected.get("value",0)) == -91 and picker.selected.ownership == "scenario","Special picker lost signed identity or exact scenario ownership")
	_check(picker.get_node("%Base").texture != null and not picker.get_node("%UseSelection").disabled,"Special picker did not verify exact pixels before acceptance")
	picker.cancel(); await _frames(2)
	_check(dock.ui.special.has_focus() and shell._maps.land_authoring._stamp == stamp and shell._session_view.revision == revision,"Cancel changed placement or lost focus")
	helper.choose_for_draft(0,"Reference field",dock.ui.special,helper.select_placement); await _settle(shell)
	picker.get_node("%Ownership").select(2); await _find_special(picker,-90); await _settle(shell)
	_check(picker.selected.get("ownership","")=="stock" and picker.get_node("%Base").texture!=null,"Stock Special artwork did not preview from its own library")
	await _find_special(picker,-91); await _settle(shell)
	_check(picker.get_node("%Choices").item_count==0 and picker.selected.is_empty(),"Stock filtering exposed an overridden row or stale details")
	picker.cancel(); await _frames(2)
	helper.choose_for_draft(0,"Reference field",dock.ui.special,helper.select_placement); await _settle(shell)
	await _find_special(picker,-91); await _settle(shell)
	helper._thumbnails.clear(); shell._bridge.drop_preview = true
	await helper._preview(picker.selected,picker.generation); await _settle(shell)
	_check(helper._pending_read and picker.get_node("%RecoverReference").visible and picker.get_node("%UseSelection").disabled,"Unknown preview did not lock acceptance and expose read recovery")
	await helper.check_connection(); await _settle(shell); await _find_special(picker,-91); await _settle(shell)
	_check(not helper._pending_read and picker.get_node("%Base").texture != null,"Read recovery did not restore exact preview")
	picker.get_node("%UseSelection").pressed.emit(); await _frames(2)
	_check(shell._maps.land_authoring._stamp.identity == "special:-91" and shell._session_view.revision == revision,"Artwork acceptance wrote scenario state or lost signed identity")
	_check(shell._maps.chrome.stamps.land.get_node("%StampOwnership").text.contains("cell encoding are replaced"),"Signed artwork stamp falsely promised marker-band retention")


func _single_placement(shell) -> void:
	var author = shell._maps.land_authoring; var before := _tiles(shell); var revision: int = shell._session_view.revision
	await _stamp_destination(author,Vector2i(3,3))
	_check(not author._review.visible and _tiles(shell)[273]==-91,"Special artwork could not replace an occupied cell")
	await shell._undo(); await _settle(shell)
	_check(_tiles(shell)==before,"Undo did not restore the occupied cell exactly")
	revision = shell._session_view.revision
	author.discard_draft(); author._hover_stamp(Vector2i(10,10)); await _settle(shell)
	_check(author._overlay._special_textures.has(-91) and _tiles(shell)==before,"Special destination preview omitted exact artwork or wrote early")
	author.discard_draft(); await _stamp_destination(author,Vector2i(10,10)); await _settle(shell)
	_check(_tiles(shell)[910]==-91 and shell._session_view.revision==revision+1,"Special placement did not commit one history entry")
	_check(shell._workbenches.land.get_node("%LandMapCanvas").cell_artwork(Vector2i(10,10)).overlay != null,"Stamp artwork disappeared when the placement preview cleared")
	await shell._undo(); _check(_tiles(shell)==before,"Special Undo lost original map words")
	await shell._redo(); _check(_tiles(shell)[910]==-91,"Special Redo lost its signed identity")
	shell._bridge.drop_stamp=true; var writes: int = shell._bridge.stamp_writes
	await _stamp_destination(author,Vector2i(11,10)); await author.check_original(); await _settle(shell)
	_check(author._pending.is_empty() and shell._bridge.stamp_writes==writes+1 and _tiles(shell)[911]==-91,"Special receipt recovery replayed or lost placement")


func _gallery_cases(shell) -> void:
	await shell._navigation.select_route("maps.special-land"); await _settle(shell)
	var view: Control = shell._documents.view("maps.special-land").get_node("%WorldSpecialCatalog")
	_check(view.is_visible_in_tree(),"World Special Land opened the legacy Media presentation")
	view.get_node("%SpecialSearch").text="-91"; view.get_node("%SpecialSearch").text_changed.emit("-91"); await _settle(shell)
	_check(view._rows.size()==1 and int(view._rows[0].value)==-91 and view.get_node("%SpecialGallery").get_item_icon(0)!=null,"Gallery lost exact scenario ownership or artwork thumbnails")
	view.get_node("%SpecialGallery").select(0); view.get_node("%SpecialGallery").item_selected.emit(0); await _settle(shell)
	_check(not view.get_node("%SpecialPlace").disabled and view.get_node("%SpecialUses").item_count==1,"Gallery did not verify pixels and exact placed uses")
	var revision: int = shell._session_view.revision
	shell._bridge.drop_preview=true
	view.get_node("%SpecialGallery").item_selected.emit(0); await _settle(shell)
	_check(shell._maps.world_special._pending_read and view.get_node("%SpecialRecover").visible and view.get_node("%SpecialPlace").disabled,"Gallery lost its read recovery boundary")
	await shell._maps.world_special.check_connection(); await _settle(shell)
	_check(not shell._maps.world_special._pending_read and not view.get_node("%SpecialPlace").disabled and shell._session_view.revision==revision,"Gallery reconciliation lost the selection or changed truth")
	view.get_node("%SpecialOpen").pressed.emit(); await _settle(shell)
	_check(shell._navigation.can_go_back(),"Gallery artwork link did not capture its destination")
	await shell._navigation.navigate_back(); await _settle(shell)
	_check(view.is_visible_in_tree() and view.get_node("%SpecialSearch").text=="-91" and int(view.selected_choice().get("value",0))==-91 and view.get_node("%SpecialSearch").has_focus(),"Back lost the World gallery context, search, selection or focus")
	view.get_node("%SpecialPlace").pressed.emit(); await _settle(shell)
	_check(shell._documents.identity_for_tab(shell._document_tabs.current_tab)=="maps.land" and shell._maps.land_authoring._stamp.identity=="special:-91" and shell._session_view.revision==revision,
		"Gallery placement route=%s stamp=%s revision=%s expected=%s origin=%s catalogRevision=%s destination=%s pending=%s disabled=%s" % [shell._documents.identity_for_tab(shell._document_tabs.current_tab),shell._maps.land_authoring._stamp.identity,shell._session_view.revision,revision,shell._maps.world_special._origin,shell._maps.world_special._revision,shell._maps.world_special._destination_available(),shell._maps.world_special._pending_read,view.get_node("%SpecialPlace").disabled])
	await shell._navigation.select_route("maps.special-land"); await _settle(shell)
	view.get_node("%SpecialImport").pressed.emit(); await _settle(shell)
	_check(not view.is_visible_in_tree(),"Import did not reach the accepted Media editor on the shared tab")
	var media: Control = shell._documents.view("assets.special-land")
	media._name.text += " draft"
	await shell._navigation.select_route("maps.special-land"); await _settle(shell)
	_check(shell._unapplied_dialog.visible and not view.is_visible_in_tree() and not shell._navigation.special_land_world_context,
		"Switching a shared route hid an unapplied Media draft without review")
	shell._draft_navigation.cancel(); shell._unapplied_dialog.hide()
	_check(media.has_unapplied_changes(),"Cancelling the shared-route switch discarded the Media draft")
	media.discard_draft()
	await shell._navigation.select_route("maps.land"); await _settle(shell)


func _recipe_cases(shell) -> void:
	var resources = shell._maps.paint_resources; var window: Window = resources._window
	resources.open("stamp"); await _settle(shell); await resources._open_entry("preset:structure-dome-91-90")
	_check(not window.get_node("%UseResource").disabled and window.get_node("%ResourceCells").get_item_icon(0)!=null,"Special recipe lost availability or source thumbnails")
	window._duplicate(); window.get_node("%ResourceName").text="Custom dome"; window.get_node("%ResourceCells").select(1)
	window.get_node("%SpecialResourceCell").pressed.emit(); await _settle(shell)
	var picker: Window = shell._maps.special_placement._picker
	_check(picker.get_parent()==window,"Stamp cell picker lost nested modal ownership")
	await _find_special(picker,-91); await _settle(shell); picker.get_node("%UseSelection").pressed.emit(); await _settle(shell)
	_check(int(window.draft().cells[1].tile)==-91 and window.get_node("%ResourceCells").get_item_icon(1)!=null,"Nested Special acceptance lost staged artwork")
	await _nested_artwork_return(shell,window)
	await resources.commit_selected(); await _settle(shell); window._use(); await _settle(shell)
	await _stamp_destination(shell._maps.land_authoring,Vector2i(20,20)); await shell._maps.land_authoring.commit_selected(); await _settle(shell)
	_check(_tiles(shell)[1820]==-91 and _tiles(shell)[1821]==-91,"Custom Special recipe did not place exact signed cells")
	var helper = shell._maps.special_placement; helper.choose_for_draft(0,"Reference field",shell._maps.paint.workspace.tiles_dock.ui.special,helper.select_placement); await _settle(shell)
	await shell._maps.document.load_map("land:0"); _check(not picker.visible and helper._origin.is_empty(),"Navigation retained a stale Special destination")
	await shell._maps.document.load_map("land:1")


func _linked_return(shell) -> void:
	var land: Control = shell._workbenches.land; var canvas: Control = land.get_node("%LandMapCanvas")
	land.get_node("%MapViewFilters").state.set_flag("actionPoints", false)
	canvas.restore_navigation_state({"zoom":2,"pan":[45,-50],"cell":[12,11],"showActionPoints":false},true)
	canvas.grab_focus(); var before: Dictionary = land.read_navigation_state()
	var helper = shell._maps.special_placement; helper.choose_for_draft(0,"Reference field",shell._maps.paint.workspace.tiles_dock.ui.special,helper.select_placement); await _settle(shell)
	var picker: Window = helper._picker; await _find_special(picker,-91); await _settle(shell)
	picker.get_node("%OpenReference").pressed.emit(); await _settle(shell)
	_check(not picker.visible and shell._navigation.can_go_back(),"Exact Special artwork navigation did not record its map origin")
	await shell._maps.document.load_map("land:0")
	await shell._navigation.navigate_back(); await _settle(shell)
	var restored: Dictionary = land.read_navigation_state()
	_check(shell._maps.document.identity=="land:1" and restored.canvas==before.canvas and restored.cells==before.cells and restored.overlays==before.overlays,
		"Back from exact artwork lost originating map, selection, zoom or pan: map=%s before=%s restored=%s" % [shell._maps.document.identity, before, restored])
	_check(canvas.has_focus() and shell._maps.document.selected_cell==Vector2i(12,11),"Map return did not restore exact selected cell and focus")


func _nested_artwork_return(shell, window: Window) -> void:
	var kept: Dictionary = window.draft(); var revision: int = shell._session_view.revision
	window.get_node("%SpecialResourceCell").pressed.emit(); await _settle(shell)
	var picker: Window = shell._maps.special_placement._picker
	await _find_special(picker,-91); await _settle(shell)
	picker.get_node("%OpenReference").pressed.emit(); await _settle(shell)
	_check(not window.visible and not picker.visible and shell._navigation.can_go_back(),"Nested artwork editing did not suspend its resource window")
	await shell._maps.document.load_map("land:0"); await shell._navigation.navigate_back(); await _settle(shell)
	_check(window.visible and window.draft()==kept and window.has_unapplied_changes() and shell._session_view.revision==revision,
		"Artwork return lost or committed the unsaved resource draft")
	_check(window.get_node("%ResourceCells").get_selected_items()==PackedInt32Array([1]) and window.get_node("%SpecialResourceCell").has_focus(),
		"Nested artwork return lost its originating cell or focus")


func _special_persistence(shell, path: String) -> void:
	var expected := _tiles(shell); await shell._project_session.save()
	var reopened: Dictionary = shell._bridge.start_project(path); _check(reopened.get("ok",false),"Special project did not reopen")
	await shell._activate_session(reopened); await shell._maps.document.load_map("land:1")
	_check(_tiles(shell)==expected,"Save/reopen lost exact Special map words")
	var resources = shell._maps.paint_resources; resources.open("stamp"); await _settle(shell)
	await resources._query("Custom dome","stamp",0); var entries: ItemList=resources._window.get_node("%Entries")
	_check(entries.item_count==1,"Reopen lost the customized Special recipe")
	if entries.item_count==1: await resources._open_entry(str(entries.get_item_metadata(0)))
	_check(resources._window.get_node("%ResourcePreview").texture!=null,"Reopen lost Special recipe artwork")
	resources._window.close()
