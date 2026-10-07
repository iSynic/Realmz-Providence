extends SceneTree


func _initialize() -> void:
	call_deferred("_capture")


func _capture() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() not in [2, 3] or (args.size() == 3 and args[2] not in ["result", "conflict"]):
		push_error("Expected disposable project directory, output PNG prefix and optional result|conflict")
		quit(2)
		return
	root.content_scale_size = DisplayServer.window_get_size()
	root.gui_embed_subwindows = true
	var shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(shell)
	await process_frame
	await shell._project_session.open_project(args[0])
	if not shell._session_view.connected:
		push_error("Capture project could not open")
		quit(2)
		return
	await shell._navigation.select_tab(32)
	var vault = shell._workbenches.vault
	# Composite review boards intentionally include the dialog in the root image.
	vault.get_node("%PickerWindow").force_native = false
	vault.get_node("%VaultSearch").text = "900"
	vault.get_node("%VaultSearch").text_changed.emit("900")
	for frame in 120:
		await process_frame
		if vault._textures.size() == vault._rows.size() and not vault._rows.is_empty():
			break
	if not vault._textures.has(0):
		push_error("Real Vault artwork preview is required")
		quit(2)
		return
	vault.get_node("%ArtworkGallery").select(0)
	vault.get_node("%ArtworkGallery").item_selected.emit(0)
	vault.get_node("%UseInItem").grab_focus()
	await RenderingServer.frame_post_draw
	var gallery_error := root.get_texture().get_image().save_png(args[1] + "-gallery.png")
	vault.get_node("%UseInItem").pressed.emit()
	var picker = vault.get_node("%ItemArtworkPicker")
	picker.get_node("%DestinationSearch").text = "no matching destination 987654321"
	picker.get_node("%DestinationSearch").text_changed.emit("no matching destination 987654321")
	if not picker.get_node("%ApplyArtwork").disabled or picker.get_node("%DestinationItems").item_count != 0:
		push_error("No-match state retained an applicable destination")
		quit(2)
		return
	await process_frame
	await RenderingServer.frame_post_draw
	if root.get_texture().get_image().save_png(args[1] + "-no-match.png") != OK:
		quit(1)
		return
	picker.get_node("%DestinationSearch").text = "801"
	picker.get_node("%DestinationSearch").text_changed.emit("801")
	picker.get_node("%DestinationItems").select(0)
	picker.get_node("%DestinationItems").item_selected.emit(0)
	await process_frame
	await RenderingServer.frame_post_draw
	var picker_error := root.get_texture().get_image().save_png(args[1] + "-picker.png")
	if args.size() == 3:
		if args[2] == "conflict":
			var changed: Dictionary = shell._bridge.request("history.undo", {"expectedRevision": picker._revision})
			if not bool(changed.get("ok", false)):
				push_error("Conflict capture requires disposable project history")
				quit(2)
				return
			picker.get_node("%ApplyArtwork").pressed.emit()
			if not picker._requires_review or not picker.get_node("%ApplyArtwork").disabled:
				push_error("Stale artwork apply was not blocked")
				quit(2)
				return
			await process_frame
			await RenderingServer.frame_post_draw
			if root.get_texture().get_image().save_png(args[1] + "-conflict.png") != OK:
				quit(1)
				return
			picker.get_node("%ReviewCurrentItem").pressed.emit()
			picker.get_node("%DestinationItems").select(0)
			picker.get_node("%DestinationItems").item_selected.emit(0)
			await process_frame
			await RenderingServer.frame_post_draw
			if root.get_texture().get_image().save_png(args[1] + "-review.png") != OK:
				quit(1)
				return
		if picker.get_node("%ApplyArtwork").disabled:
			push_error("Capture requires an applicable destination")
			quit(2)
			return
		picker.get_node("%ApplyArtwork").pressed.emit()
		if shell._document_tabs.current_tab != 4:
			push_error("Artwork apply did not return to Items")
			quit(2)
			return
		await process_frame
		await RenderingServer.frame_post_draw
		var result_error := root.get_texture().get_image().save_png(args[1] + "-result.png")
		if result_error != OK:
			quit(1)
			return
		var actual_bridge = shell._bridge
		shell._bridge = preload("res://tools/validate_save_failure.gd").FailingBridge.new()
		await shell._project_session.save()
		shell._bridge = actual_bridge
		await process_frame
		await RenderingServer.frame_post_draw
		if root.get_texture().get_image().save_png(args[1] + "-save-failure-injected.png") != OK:
			quit(1)
			return
		if root.content_scale_size.x == 1600:
			await shell._undo()
			shell._item_editor.open_item("classic.item.801")
			await process_frame
			await RenderingServer.frame_post_draw
			if root.get_texture().get_image().save_png(args[1] + "-undo.png") != OK:
				quit(1)
				return
			await shell._redo()
			await shell._project_session.save()
			if shell._item_editor.get_node("%SaveActions").visible:
				push_error("Successful Save did not clear recovery actions")
				quit(2)
				return
			await shell._project_session.open_project(args[0])
			await shell._navigation.select_tab(4)
			shell._item_editor.open_item("classic.item.801")
			if int(shell._item_editor.selected_definition().get("iconId", 0)) != 9000:
				push_error("Saved artwork did not reopen")
				quit(2)
				return
			await process_frame
			await RenderingServer.frame_post_draw
			if root.get_texture().get_image().save_png(args[1] + "-reopened.png") != OK:
				quit(1)
				return
	print("PROVIDENCE_VAULT_CAPTURE viewport=%s rows=%d gallery=%d picker=%d embedded-window-for-capture" % [root.content_scale_size, vault._rows.size(), gallery_error, picker_error])
	shell.queue_free()
	await process_frame
	quit(0 if gallery_error == OK and picker_error == OK else 1)
