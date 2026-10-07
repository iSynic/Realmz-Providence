extends SceneTree


class FailedPreviewBridge extends RefCounted:
	var source
	func is_project_backed() -> bool:
		return source.is_project_backed()
	func request(method: String, params: Dictionary = {}) -> Dictionary:
		if method == "reference-catalog.preview":
			return {"ok": false, "error": "Controlled unavailable preview"}
		return source.request(method, params)


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 2:
		quit(2)
		return
	root.content_scale_size = DisplayServer.window_get_size()
	root.gui_embed_subwindows = true
	var shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(shell)
	await process_frame
	await shell._project_session.open_project(args[0])
	if not shell._session_view.connected:
		quit(2)
		return
	await shell._navigation.select_tab(4)
	shell._item_editor.open_item("classic.item.800")
	shell._item_editor.get_node("%ItemIdentifiedName").text = "Workflow test — unapplied name"
	await shell._navigation.select_tab(32)
	if not shell._unapplied_dialog.visible or shell._document_tabs.current_tab != 4:
		push_error("Expected real item draft resolution before Vault navigation")
		quit(2)
		return
	await _save(args[1] + "-draft-resolution.png")
	shell._unapplied_dialog.custom_action.emit(&"discard")
	if shell._document_tabs.current_tab != 32:
		quit(2)
		return
	var vault = shell._workbenches.vault
	vault.get_node("%PickerWindow").force_native = false
	vault.get_node("%VaultSearch").text = "9000"
	vault.get_node("%VaultSearch").text_changed.emit("9000")
	for frame in 120:
		await process_frame
		if vault._textures.has(0):
			break
	if not vault._textures.has(0):
		quit(2)
		return
	vault.get_node("%ArtworkGallery").select(0)
	vault.get_node("%ArtworkGallery").item_selected.emit(0)
	vault.get_node("%UseInItem").pressed.emit()
	var picker = vault.get_node("%ItemArtworkPicker")
	picker.get_node("%DestinationSearch").text = "800"
	picker.get_node("%DestinationSearch").text_changed.emit("800")
	picker.get_node("%DestinationItems").select(0)
	picker.get_node("%DestinationItems").item_selected.emit(0)
	# Inject only preview availability; imported item identity and revision remain real.
	picker.receive_current_picture(null, picker._preview_id)
	await _save(args[1] + "-current-unavailable.png")
	picker.apply_failed("The selected artwork could not be read. Your item is unchanged. Choose another picture.")
	await _save(args[1] + "-apply-failed.png")
	vault._close_picker()
	var failed := FailedPreviewBridge.new()
	failed.source = shell._bridge
	await vault.reload(failed)
	vault.get_node("%ArtworkGallery").select(0)
	vault.get_node("%ArtworkGallery").item_selected.emit(0)
	await process_frame
	await process_frame
	await _save(args[1] + "-proposal-unavailable.png")
	shell._bridge.stop()
	shell.queue_free()
	await process_frame
	print("PROVIDENCE_VAULT_RECOVERY_CAPTURE injected-failures embedded-review-only")
	quit(0)


func _save(path: String) -> void:
	await process_frame
	await RenderingServer.frame_post_draw
	if root.get_texture().get_image().save_png(path) != OK:
		push_error("Recovery capture failed: " + path)
		quit(1)
