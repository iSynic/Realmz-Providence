extends SceneTree

var shell: Control
var workbench: Control
var output := ""
var captures: Array = []
var source_path := ""
var reverse_path := ""
var sound_path := ""
var replacement_sound_path := ""
var text_path := ""
var fixture_root := ""


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 2 or not FileAccess.file_exists(args[0].path_join("media-review-disposable.marker")):
		push_error("A marked disposable project and output directory are required."); quit(2); return
	output = args[1]
	fixture_root = args[0]
	DirAccess.make_dir_recursive_absolute(output)
	root.gui_embed_subwindows = true
	shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(shell)
	await process_frame
	await shell._project_session.open_project(args[0])
	if not shell._bridge.is_project_backed(): push_error("Review project did not open."); quit(1); return
	await shell._assets.open_library("scenario")
	workbench = shell._assets.library_workbench
	workbench.apply_theme("dark", "balanced")
	shell._document_tabs.current_tab = workbench.get_index()
	await _settle()
	await _seed_sources()
	await _settle()
	for viewport_size in [Vector2i(1920, 1080), Vector2i(1600, 900)]:
		root.size = viewport_size
		root.content_scale_size = viewport_size
		await _gallery_states(viewport_size)
		await _pair_review(viewport_size)
		await _authoring_states(viewport_size)
		await _library_states(viewport_size)
		await _preview_states(viewport_size)
		await _recovery_states(viewport_size)
		await _edge_states(viewport_size)
	await _theme_smoke()
	FileAccess.open(output.path_join("captures.json"), FileAccess.WRITE).store_string(JSON.stringify(captures, "\t"))
	shell._bridge.stop()
	print("PROVIDENCE_MEDIA_CAPTURES_OK " + str(captures.size()))
	quit()


func _gallery_states(viewport_size: Vector2i) -> void:
	var panel: Control = workbench.get_node("%Gallery")
	await _scope("scenario")
	await _select_resource("icon", 479)
	await _save("scenario-gallery", viewport_size)
	await _kind("picture")
	await _select_resource("picture", 32128)
	await _save("picture-filtered", viewport_size)
	await _kind("text-resource")
	await _select_resource("text-resource", -202)
	await _save("scrolling-text", viewport_size)
	panel.get_node("%Search").text = "No matching picture"
	await panel.reload(shell._bridge)
	await _save("no-results", viewport_size)
	await _scope("personal")
	await workbench._supplied("bag-item", "Bag of Holding")
	if panel.get_node("%Gallery").item_count > 0: await panel._select(0)
	await _save("bag-gallery", viewport_size)
	await workbench._supplied("vault-icon", "Vault of Arcana")
	if panel.get_node("%Gallery").item_count > 0: await panel._select(0)
	await _save("vault-gallery", viewport_size)
	await _scope("stock")
	await _kind("sound")
	if panel.get_node("%Gallery").item_count > 0: await panel._select(0)
	await _save("stock-sounds", viewport_size)


func _pair_review(viewport_size: Vector2i) -> void:
	var panel: Control = workbench.get_node("%Gallery")
	await _scope("scenario")
	await _select_resource("icon", 479)
	var dialog: Window = workbench.get_node("%MediaDialog")
	await dialog.open_review("replace", shell._bridge, workbench._media_commands, panel.selection_context())
	dialog.get_node("%Path").text = source_path
	dialog.get_node("%ReversePath").text = reverse_path
	dialog.get_node("%PrepareDelay").stop()
	await dialog._prepare()
	await _save("paired-replacement", viewport_size)
	dialog._cancel()


func _save(state: String, viewport_size: Vector2i) -> void:
	await _settle()
	_assert_state(state)
	for _frame in 4: await process_frame
	await RenderingServer.frame_post_draw
	var capture := root.get_texture().get_image()
	var name := "%s-%dx%d.png" % [state, viewport_size.x, viewport_size.y]
	if capture.get_size() != viewport_size or capture.save_png(output.path_join(name)) != OK:
		push_error("Native capture failed."); quit(1); return
	var gallery: ItemList = workbench.get_node("%Gallery").get_node("%Gallery")
	captures.append({"state": state, "file": name, "viewport": [viewport_size.x, viewport_size.y], "galleryBounds": str(gallery.get_global_rect()), "rows": gallery.item_count})

func _seed_sources() -> void:
	var library_root: String = shell._bridge.configured_personal_library_root().replace("\\", "/")
	if not library_root.begins_with(fixture_root.replace("\\", "/") + "/"):
		push_error("Review library must stay inside its marked disposable project"); quit(2); return
	source_path = fixture_root.path_join("review-front.png"); reverse_path = fixture_root.path_join("review-reverse.png")
	for pair in [[source_path,"icon:479"],[reverse_path,"icon:787"]]:
		var read: Dictionary = shell._bridge.request("icon.preview", {"identity":pair[1]})
		if not read.get("ok", false): push_error("Review appearance unavailable"); quit(2); return
		FileAccess.open(pair[0], FileAccess.WRITE).store_buffer(Marshalls.base64_to_raw(read.result.base64))
	sound_path = fixture_root.path_join("review.wav")
	var wav := AudioStreamWAV.new(); wav.format = AudioStreamWAV.FORMAT_8_BITS; wav.mix_rate = 11025
	var pcm := PackedByteArray(); for index in 6000: pcm.append(int(sin(float(index)/8.0)*30)&255)
	wav.data = pcm; wav.save_to_wav(sound_path)
	replacement_sound_path = fixture_root.path_join("replacement-review.wav")
	wav.mix_rate = 22050; wav.save_to_wav(replacement_sound_path)
	text_path = fixture_root.path_join("review.txt")
	FileAccess.open(text_path, FileAccess.WRITE).store_string("Command of the Vixies\nThe party follows the stream.\n".repeat(30))
	await _seed_scenario("sound",490,sound_path)
	await _seed_scenario("special-land-tile",-30000,source_path)
	await _seed_personal("personal:media-review-ready","Hydra cameo", "ready")
	await _seed_personal("personal:media-review-original","Hydra original", "original")
	var collections: Dictionary = shell._bridge.request("personal-library.collections", {"limit":128})
	if not collections.get("result", {}).get("items", []).any(func(row): return row.identity == "collection:media-review-empty"):
		var state: Dictionary = shell._bridge.request("personal-library.describe", {})
		var created: Dictionary = shell._bridge.request("personal-library.create-collection", {"identity":"collection:media-review-empty","name":"Unsorted illustrations","expectedRevision":int(state.result.revision)})
		if not created.get("ok", false): push_error("Review collection failed"); quit(2); return


func _seed_scenario(kind: String, number: int, path: String) -> void:
	var existing: Dictionary = shell._bridge.request("project-asset.list", {"kind":kind,"limit":128})
	for row: Dictionary in existing.get("result",{}).get("items",[]):
		if row.get("classicResource", {}).get("resourceId") == number: return
	var state: Dictionary = shell._bridge.request("session.describe", {})
	var params := {"expectedRevision":int(state.result.revision),"destination":"scenario","kind":kind,"resourceId":number,"path":path,"name":"Stream ambience" if kind=="sound" else "Hydra shrine"}
	var read: Dictionary = shell._bridge.request("media.import.prepare", params)
	if not read.get("ok",false): push_error(str(read)); quit(2); return
	params["reviewHash"] = read.result.reviewHash
	var commit: Dictionary = shell._bridge.request("media.import.commit", params)
	if not commit.get("ok",false): push_error(str(commit)); quit(2)


func _seed_personal(identity: String, label: String, mode: String) -> void:
	var existing: Dictionary = shell._bridge.request("personal-library.list", {"query":identity,"limit":1})
	if not existing.get("result",{}).get("items",[]).is_empty(): return
	var state: Dictionary = shell._bridge.request("personal-library.describe", {})
	var params := {"expectedLibraryRevision":int(state.result.revision),"destination":"personal","kind":"icon","resourceId":31001,"path":source_path,"name":label,"libraryIdentity":identity,"output":mode}
	var read: Dictionary = shell._bridge.request("media.import.prepare", params)
	if not read.get("ok",false): push_error(str(read)); quit(2); return
	params["reviewHash"] = read.result.reviewHash
	var commit: Dictionary = shell._bridge.request("media.import.commit", params)
	if not commit.get("ok",false): push_error(str(commit)); quit(2)


func _authoring_states(viewport_size: Vector2i) -> void:
	var panel: Control = workbench.get_node("%Gallery")
	var dialog: Window = workbench.get_node("%MediaDialog")
	await _scope("scenario"); await _select_resource("special-land-tile", -30000)
	await _save("special-land", viewport_size)
	await dialog.open_review("edit",shell._bridge,workbench._media_commands,panel.selection_context())
	dialog.get_node("%OverrideLandLook").button_pressed = true; dialog.get_node("%LandLook").value = 25
	dialog.get_node("%OverrideBaseTile").button_pressed = true; dialog.get_node("%BaseTile").value = 32
	dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	await _save("special-land-draft",viewport_size); dialog._cancel()
	await _kind("sound"); await _select_resource("sound", 490)
	await _save("scenario-sound",viewport_size)
	await dialog.open_review("replace",shell._bridge,workbench._media_commands,panel.selection_context())
	dialog.get_node("%Path").text = replacement_sound_path
	dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	await _save("sound-replacement-review",viewport_size); dialog._cancel()
	await dialog.open_review("import",shell._bridge,workbench._media_commands,{"scope":"scenario","kind":"sound"})
	dialog.get_node("%DraftName").text = "River ambience"; dialog.get_node("%Path").text = sound_path
	dialog.get_node("%Number").value = 491; dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	await _save("sound-import-review",viewport_size); dialog._cancel()
	await dialog.open_review("import",shell._bridge,workbench._media_commands,{"scope":"scenario","kind":"picture"})
	dialog.get_node("%DraftName").text = "New illustration"; dialog.get_node("%Path").text = source_path
	dialog.get_node("%Number").value = 30100
	dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	await _save("import-review",viewport_size)
	dialog.get_node("%Path").text = source_path + ".missing"
	dialog.get_node("%Path").text_changed.emit(dialog.get_node("%Path").text)
	dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	await _save("changed-import-source",viewport_size)
	dialog.get_node("%Path").text = source_path
	dialog.get_node("%Path").text_changed.emit(source_path)
	dialog.get_node("%Number").value = 32128; dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	await _save("invalid-allocation",viewport_size); dialog._cancel()
	await dialog.open_review("import",shell._bridge,workbench._media_commands,{"scope":"scenario","kind":"text-resource"})
	dialog.get_node("%DraftName").text = "Command of the Vixies"; dialog.get_node("%Path").text = text_path
	dialog.get_node("%Number").value = -30001; dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	await _save("full-text-draft",viewport_size)
	dialog.get_node("%Text").text += " Unsupported: 🐉"; dialog._changed(); dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	await _save("invalid-text",viewport_size); dialog._cancel()
	await _kind("all-text"); await _select_resource("text-style-resource", -202)
	await _save("paired-formatting",viewport_size)


func _library_states(viewport_size: Vector2i) -> void:
	var panel: Control = workbench.get_node("%Gallery")
	var dialog: Window = workbench.get_node("%MediaDialog")
	await _scope("personal"); await panel.show_collection("personal")
	await panel.refresh_selection("personal:media-review-ready")
	await _save("my-library-ready",viewport_size)
	await dialog.open_review("organize",shell._bridge,workbench._media_commands,panel.selection_context())
	await _save("current-metadata-no-op",viewport_size)
	dialog.get_node("%DraftName").text = "Forest guardian"; dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	await _save("name-collection-draft",viewport_size); dialog._cancel()
	await dialog.open_review("copy",shell._bridge,workbench._media_commands,panel.selection_context())
	dialog.get_node("%Number").value = 31002; dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	await _save("reviewed-copy",viewport_size)
	dialog.get_node("%Number").value = 479; dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	await _save("copy-conflict",viewport_size); dialog._cancel()
	await panel.refresh_selection("personal:media-review-original")
	await _save("my-library-original",viewport_size)
	await dialog.open_review("prepare-original",shell._bridge,workbench._media_commands,panel.selection_context())
	dialog.get_node("%Number").value = 31002; dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	await _save("prepare-stored-original",viewport_size); dialog._cancel()
	await _scope("scenario"); await _kind("picture"); await _select_resource("picture", 32128)
	await dialog.open_review("transfer",shell._bridge,workbench._media_commands,panel.selection_context())
	await _save("scenario-to-library",viewport_size); dialog._cancel()
	await dialog.open_review("remove",shell._bridge,workbench._media_commands,panel.selection_context())
	await _save("in-use-removal",viewport_size); dialog._cancel()


func _preview_states(viewport_size: Vector2i) -> void:
	var panel: Control = workbench.get_node("%Gallery")
	await _scope("scenario"); await _kind("text-resource"); await _select_resource("text-resource", -202)
	panel._open_preview(); await _save("full-text-preview",viewport_size); panel.get_node("%MediaPreview").cancel()
	await _kind("sound"); await _select_resource("sound", 490)
	panel._open_preview(); await _save("sound-preview",viewport_size); panel.get_node("%MediaPreview").cancel()
	await shell._navigation.open_script_target("item",800,"classic.item.800",{})
	await shell._assets.choose_item_artwork()
	if is_instance_valid(shell._assets.chooser):
		var prior := workbench
		workbench = shell._assets.chooser
		await _scope("stock")
		var chooser_panel: Control = workbench.get_node("%Gallery")
		if chooser_panel.get_node("%Gallery").item_count>0: await chooser_panel._select(0)
		await _save("nested-item-chooser",viewport_size)
		await shell._assets.cancel_item_artwork()
		workbench = prior
	await shell._assets.open_library("scenario")


func _recovery_states(viewport_size: Vector2i) -> void:
	var dialog: Window = workbench.get_node("%MediaDialog")
	await dialog.open_review("import",shell._bridge,workbench._media_commands,{"scope":"scenario","kind":"picture"})
	dialog.get_node("%Path").text = source_path; dialog.get_node("%DraftName").text = "Retained illustration"
	dialog.get_node("%Number").value = 30100; dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	var saved := FileAccess.get_file_as_bytes(source_path)
	FileAccess.open(source_path,FileAccess.WRITE).store_string("Unreadable reviewed source")
	await dialog._accept()
	await _save("known-write-failure",viewport_size)
	FileAccess.open(source_path,FileAccess.WRITE).store_buffer(saved)
	# Render the real recovery controls; durable receipt behavior is exercised separately by the dropped-reply native lane.
	workbench._media_commands._pending = {"domain":"project","context":{},"intent":{},"projectPath":fixture_root}
	workbench._media_commands.recovery_changed.emit(true)
	workbench._media_commands.status_changed.emit("Outcome unconfirmed. Browse without editing, then Reconcile stored state.")
	dialog._set_read_only(true); dialog.get_node("%Accept").disabled = true; dialog.get_node("%Review").disabled = true
	dialog.get_node("%Impact").text = "Outcome unconfirmed. Submitted values are locked. Close to browse, then Reconcile stored state; no mutation will be retried."
	dialog.title = "Outcome unconfirmed / submitted values retained"; dialog.get_node("%Title").text = dialog.title
	dialog.get_node("%Cancel").text = "Close"
	await _save("unknown-submitted-locked",viewport_size); dialog._cancel()
	await _scope("scenario")
	await _save("unknown-browsing-reconcile",viewport_size)
	workbench._media_commands._pending.clear(); workbench._media_commands.recovery_changed.emit(false)


func _edge_states(viewport_size: Vector2i) -> void:
	var panel: Control = workbench.get_node("%Gallery")
	await _scope("personal")
	await panel.show_collection("collection:media-review-empty")
	await _save("empty-collection", viewport_size)
	await panel.show_collection("personal")
	var asset: Dictionary = shell._bridge.request("personal-library.open", {"identity":"personal:media-review-original"}).result.asset
	var library: String = shell._bridge.configured_personal_library_root()
	var blob := library.path_join("blobs/sha256").path_join(str(asset.original).trim_prefix("sha256:"))
	if not blob.replace("\\", "/").begins_with(fixture_root.replace("\\", "/") + "/"): push_error("Unowned review blob"); quit(2); return
	var bytes := FileAccess.get_file_as_bytes(blob)
	DirAccess.remove_absolute(blob)
	await panel.refresh_selection("personal:media-review-original")
	await _save("missing-library-source", viewport_size)
	FileAccess.open(blob, FileAccess.WRITE).store_buffer(bytes)
	await _scope("scenario")
	var dialog: Window = workbench.get_node("%MediaDialog")
	await dialog.open_review("import", shell._bridge, workbench._media_commands, {"scope":"scenario","kind":"picture"})
	dialog.get_node("%DraftName").text = "River illustration"; dialog.get_node("%Path").text = source_path
	dialog._busy_state(true)
	await _save("loading-review", viewport_size)
	dialog._busy_state(false); dialog._cancel()


func _theme_smoke() -> void:
	root.size = Vector2i(1600,900); root.content_scale_size = root.size
	for mode in ["light", "dark", "high-contrast"]:
		for density in ["balanced", "compact"]:
			workbench.apply_theme(mode,density)
			await _scope("scenario")
			await _select_resource("icon", 479)
			await _save("smoke-" + mode + "-" + density, root.size)
	workbench.apply_theme("dark","balanced")


func _settle() -> void:
	for _frame in 4: await process_frame
	while shell._operations.busy: await process_frame
	await process_frame


func _scope(scope: String) -> void:
	await _settle()
	await workbench.show_scope(scope)
	await _settle()


func _kind(kind: String) -> void:
	await _settle()
	await workbench.get_node("%Gallery").show_kind(kind)
	await _settle()
	assert(workbench.get_node("%Gallery").selected_asset_kind() == kind)


func _select_resource(kind: String, number: int) -> void:
	await _settle()
	var rows: Dictionary = shell._bridge.request("project-asset.list", {"kind":kind,"limit":128})
	assert(rows.get("ok", false))
	for row: Dictionary in rows.result.items:
		if row.get("classicResource", {}).get("resourceId") != number: continue
		var panel: Control = workbench.get_node("%Gallery")
		var selected: Dictionary = await panel.refresh_selection(str(row.identity))
		assert(selected.get("ok", false) and panel.selected_asset_identity() == str(row.identity))
		return
	push_error("Review resource missing: %s %d" % [kind, number]); quit(2)


func _assert_state(state: String) -> void:
	var panel: Control = workbench.get_node("%Gallery")
	var dialog: Window = workbench.get_node("%MediaDialog")
	if state in ["scenario-gallery", "picture-filtered", "scrolling-text", "paired-formatting"]: assert(not panel.selection_context().is_empty())
	if state == "picture-filtered": assert(panel._rows.all(func(row): return row.kind == "picture"))
	if state in ["no-results", "empty-collection"]: assert(panel.get_node("%Gallery").item_count == 0 and panel.get_node("%ReplaceScenario").disabled and panel.get_node("%AddToLibrary").disabled)
	if state == "paired-formatting": assert(panel._pairing.get("status") == "ready")
	if state in ["full-text-preview", "sound-preview"]: assert(panel.get_node("%MediaPreview").visible)
	if state in ["invalid-text", "invalid-allocation", "known-write-failure"]: assert(dialog.get_node("%OutputDetails").text.is_empty())
	if state == "sound-import-review": assert(dialog.get_node("%SourceDetails").text.contains("Hz") and dialog.get_node("%OutputDetails").text.contains("8-bit unsigned PCM"))
	if state == "sound-replacement-review": assert(dialog.get_node("%SourceDetails").text.contains("11025 Hz") and dialog.get_node("%OutputDetails").text.contains("22050 Hz"))
	if state == "changed-import-source": assert(dialog.get_node("%Current").texture == null and dialog.get_node("%CurrentText").text.is_empty() and dialog.get_node("%OutputDetails").text.is_empty() and dialog.get_node("%Accept").disabled)
	if state == "full-text-draft": assert(dialog.get_node("%OutputDetails").text.contains("MacRoman") and dialog.get_node("%OutputDetails").text.contains("Unformatted TEXT"))
	if state == "current-metadata-no-op": assert(dialog.get_node("%Accept").disabled and not dialog.get_node("%Impact").text.contains("Loading"))
	if state == "unknown-browsing-reconcile":
		var button: Control = workbench.get_node("%ReconcileMedia")
		assert(button.is_visible_in_tree() and Rect2(Vector2.ZERO, Vector2(root.size)).encloses(button.get_global_rect()))
