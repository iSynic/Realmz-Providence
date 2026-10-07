extends SceneTree

class CaptureBridge extends "res://src/native_bridge.gd":
	var library_root := ""
	var reject_smart := false
	var lose_smart := false
	var lose_media := false
	var delay_music := false
	func configured_personal_library_root() -> String: return library_root
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method == "smart-terrain.apply" and reject_smart:
			reject_smart = false; return {"ok":false,"error":"Controlled write rejection. The reviewed mask is kept; explicitly retry or Cancel."}
		if method == "media.music-audition.prepare" and delay_music: OS.delay_msec(1000); delay_music = false
		var response: Dictionary = super._request(method, params)
		if response.get("ok", false) and (method == "smart-terrain.apply" and lose_smart or method == "media.import.commit" and lose_media):
			lose_smart = false; lose_media = false
			return {"ok":false,"outcomeUnknown":true,"error":"Controlled lost acknowledgement after the durable write. Check the original operation; no automatic retry."}
		return response

var shell: Control
var output := ""
var scratch := ""
var captures: Array = []
var timings: Array = []


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() in [3,4] and args[1].get_file().begins_with("release-polish-"))
	scratch = args[1]; output = args[2]
	DirAccess.make_dir_recursive_absolute(scratch); DirAccess.make_dir_recursive_absolute(output)
	root.gui_embed_subwindows = true
	shell = load("res://src/editor_shell.tscn").instantiate()
	shell._bridge = CaptureBridge.new(scratch.path_join("settings.cfg")); shell._bridge.library_root = scratch.path_join("library")
	root.add_child(shell); await process_frame
	var created: Dictionary = shell._bridge.create_project("release-polish", scratch.path_join("project")); assert(created.ok)
	await shell._activate_session(created); await shell._navigation.select_route("maps.land"); await settle()
	assert(shell._documents.identity_for_tab(shell._document_tabs.current_tab) == "maps.land")
	for viewport in [Vector2i(1920,1080),Vector2i(1600,900)]:
		root.size = viewport; root.content_scale_size = viewport
		await save_capture("maps-empty","maps.land",viewport)
	var started := Time.get_ticks_msec()
	var imported: Dictionary = shell._bridge.request("project.import-classic-scenario", {"directory":args[0],"expectedRevision":0,"applicationDataDirectory":ProjectSettings.globalize_path("res://bundled/realmz-reference")})
	assert(imported.ok, str(imported)); timings.append({"task":"full-classic-import","elapsedMs":Time.get_ticks_msec()-started})
	var activated: Dictionary = await shell._activate_session(shell._bridge.request("session.describe",{}))
	assert(activated.ok, str(activated)); await settle()
	var maps := preload("res://tools/release_polish_map_captures.gd").new()
	maps.initialize(shell, save_capture, settle)
	var media := preload("res://tools/release_polish_media_captures.gd").new()
	media.initialize(shell, scratch, save_capture, settle)
	for viewport in [Vector2i(1920,1080),Vector2i(1600,900)]:
		root.size = viewport; root.content_scale_size = viewport
		if args.size() == 3: await maps.capture(viewport)
		if args.size() == 3 or args[3] == "media": await media.capture(viewport)
		await _economy(viewport)
	var identity: Dictionary = shell._bridge.request("build.identity").result
	FileAccess.open(output.path_join("captures.json"),FileAccess.WRITE).store_string(JSON.stringify({"captures":captures,"timings":timings,"buildIdentity":identity,"sourceDirectory":args[0],"fixture":"Disposable full Trouble import. Smart mask cell seeding and durable-write faults are named in the capture state. No source or user project is modified."},"\t"))
	shell.free(); await process_frame
	print("PROVIDENCE_RELEASE_POLISH_CAPTURES_OK " + str(captures.size())); quit()


func _economy(viewport: Vector2i) -> void:
	print("ECONOMY_CAPTURE_BEGIN ", shell._draft_apply.has_draft(), " / ", shell._operations.requires_reopen)
	if shell._assets.library_workbench != null:
		var assets: Control = shell._assets.library_workbench
		print("ECONOMY_ORIGIN_DRAFT ", assets.get_node("%MediaDialog").visible," / gallery=",assets.get_node("%Gallery").has_unapplied_changes()," / supplied=",assets.get_node("%Supplied").has_unapplied_changes())
	for route: String in ["economy.treasure","economy.items","economy.shops"]:
		await settle(); await shell._navigation.select_route(route); await settle()
		assert(shell._session_view.connected and not shell._operations.requires_reopen, "Recovered session was not restored")
		print("ECONOMY_CAPTURE_ROUTE ", route, " / ", shell._documents.identity_for_tab(shell._document_tabs.current_tab), " / guard=",shell._unapplied_dialog.visible)
		if route == "economy.treasure":
			var opened: Dictionary = await shell._workbenches.treasure_commands.open_native_id(10)
			if not opened.ok:
				push_error(str(opened) + " · active=" + shell._documents.identity_for_tab(shell._document_tabs.current_tab)); quit(1); return
		await save_capture(route.get_slice(".",1),route,viewport)
	await shell._navigation.select_route("economy.treasure"); await settle()
	var treasure: Control = shell._documents.view("economy.treasure")
	assert((await shell._workbenches.treasure_commands.open_native_id(10)).ok)
	treasure.get_node("%Gold").text = "77"; treasure.get_node("%Gold").text_changed.emit("77")
	treasure.get_node("EconomyNavigation/ItemsTab").pressed.emit(); await process_frame
	assert(shell._unapplied_dialog.visible and shell._unapplied_dialog.dialog_text.contains("Treasure 10"))
	await save_capture("economy-dirty","economy.treasure",viewport)
	shell._unapplied_dialog.canceled.emit(); shell._unapplied_dialog.hide(); treasure.discard_draft()


func settle() -> void:
	var stable := 0
	for frame in 1800:
		await process_frame
		stable = stable + 1 if not shell._operations.busy and not shell._bridge.operation_busy() else 0
		if stable >= 4: return
	assert(false,"Capture operation did not settle")


func save_capture(state: String, route: String, viewport: Vector2i, idle := true) -> void:
	if idle: await settle()
	for frame in 4: await process_frame
	await RenderingServer.frame_post_draw
	var pixels := root.get_texture().get_image()
	var filename := "%s-%dx%d.png" % [state,viewport.x,viewport.y]
	assert(pixels.get_size() == viewport and pixels.save_png(output.path_join(filename)) == OK)
	captures.append({"state":state,"route":route,"viewport":[viewport.x,viewport.y],"file":filename,"revision":shell._session_view.revision})
