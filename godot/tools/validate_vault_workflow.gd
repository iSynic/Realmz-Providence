extends SceneTree

class StartupBridge extends "res://src/native_bridge.gd":
	func bundled_classic_application_data_root() -> String: return ""
	var arguments := PackedStringArray()
	func configured_application_library_root(_explicit_root: String = "") -> String:
		return "application-fixture"
	func configured_reference_catalog_root(_explicit_root: String = "") -> String:
		return "vault-fixture"
	func _append_monster_library(value: PackedStringArray, _explicit_root: String) -> String:
		value.append("--monster-library-root"); value.append("monster-fixture")
		return "monster-fixture"
	func configured_personal_library_root() -> String:
		return "personal-fixture"
	func _start(value: PackedStringArray) -> Dictionary:
		arguments = value
		return {"ok": true}

class FixtureBridge extends RefCounted:
	var png := ""
	var applied: Dictionary = {}
	var fail := false
	var payload_unavailable := false
	var paged := false
	var requested_offsets: Array = []
	func is_project_backed() -> bool:
		return true
	func request(method: String, params: Dictionary = {}) -> Dictionary:
		match method:
			"reference-catalog.list":
				if paged:
					requested_offsets.append(params.get("offset"))
					var total := 26 if str(params.get("query", "")).is_empty() else 0
					var rows: Array = []
					for index in range(int(params["offset"]), mini(total, int(params["offset"]) + int(params["limit"]))):
						rows.append({"identity": "vault:%d" % (9000 + index), "resource": {"resourceId": 9000 + index}, "width": 32, "height": 32})
					return {"ok": true, "result": {"configured": true, "total": total, "items": rows}}
				return {"ok": true, "result": {"configured": true, "total": 1, "items": [{"identity": "vault:9000", "resource": {"resourceId": 9000}, "width": 32, "height": 32}]}}
			"reference-catalog.preview":
				return {"ok": true, "result": {"base64": png}}
			"item.list":
				if params.get("scope") != "scenario" or params.get("limit") != 32:
					return {"ok": false, "error": "Picker must request bounded scenario items"}
				return {"ok": true, "result": {"revision": 7, "total": 1, "items": [{"identity": "classic.item.902", "classicId": 902, "recordIndex": 102, "name": "Fixture figurine", "iconId": 0, "editable": true}]}}
			"scenario-item.apply-library-artwork":
				applied = params.duplicate(true)
				if payload_unavailable:
					return {"ok": false, "error": "The selected artwork could not be read. Your item is unchanged. Choose another picture."}
				return {"ok": false, "error": "The item changed. Review its current state before applying artwork."} if fail else {"ok": true, "result": {"revision": 8}}
		return {"ok": false, "error": "Unexpected fixture request: " + method}

var _result: Array = []

class PictureBridge extends RefCounted:
	var png := ""
	var scenario_present := true
	var preview_available := true
	var calls: Array[String] = []
	func request(method: String, params: Dictionary = {}) -> Dictionary:
		calls.append(method)
		if method == "item-artwork.resolve":
			if params.get("iconId") != -185:
				return {"ok": false}
			return {"ok": true, "result": {"choice": {"available": true, "ownership": "scenario" if scenario_present else "application", "targetIdentity": "signed-picture"}}}
		if method in ["icon.preview", "application-media.preview"]:
			return {"ok": true, "result": {"base64": png}} if preview_available and params.get("identity") == "signed-picture" else {"ok": false}
		return {"ok": false}


func _initialize() -> void:
	call_deferred("_run")


func _check_startup_libraries() -> bool:
	var prior_project := OS.get_environment("PROVIDENCE_PROJECT_PATH")
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	var startup := StartupBridge.new()
	startup.start_demo()
	OS.set_environment("PROVIDENCE_PROJECT_PATH", prior_project)
	if startup.arguments != PackedStringArray(["serve-demo", "--application-library-root", "application-fixture", "--reference-catalog-root", "vault-fixture", "--monster-library-root", "monster-fixture", "--personal-library-root", "personal-fixture"]) or startup.is_project_backed():
		_fail("Auxiliary startup must attach configured libraries without a saved project: " + str(startup.arguments))
		return false
	return true


func _run() -> void:
	root.size = Vector2i(1600, 900)
	if not _check_startup_libraries(): return
	var vault = load("res://src/vault_editor.tscn").instantiate()
	var window: Window = vault.get_node("%PickerWindow")
	if not window.force_native or not window.transient or not window.exclusive or window.visible:
		push_error("Vault picker must start hidden and use an exclusive native child window")
		quit(1)
		return
	if DisplayServer.get_name() == "headless":
		root.gui_embed_subwindows = true
		window.force_native = false
	root.add_child(vault)
	vault.artwork_applied.connect(func(projection, record_index): _result = [projection, record_index])
	var bridge := FixtureBridge.new()
	var image := Image.create(32, 32, false, Image.FORMAT_RGBA8)
	image.fill(Color.WHITE)
	bridge.png = Marshalls.raw_to_base64(image.save_png_to_buffer())
	var pictures := PictureBridge.new()
	pictures.png = bridge.png
	var signed_picture: Texture2D = (await preload("res://src/item_artwork_lookup.gd").resolve(pictures.request, -185)).get("texture")
	if signed_picture == null or signed_picture.get_width() != 32 or pictures.calls != ["item-artwork.resolve", "icon.preview"]:
		_fail("signed item picture must use the core-resolved scenario resource")
		return
	pictures.calls.clear()
	pictures.preview_available = false
	if (await preload("res://src/item_artwork_lookup.gd").resolve(pictures.request, -185)).get("texture") != null or pictures.calls != ["item-artwork.resolve", "icon.preview"]:
		_fail("missing scenario preview must not fall back to different application artwork")
		return
	pictures.calls.clear()
	pictures.scenario_present = false
	pictures.preview_available = true
	if (await preload("res://src/item_artwork_lookup.gd").resolve(pictures.request, -185)).get("texture") == null or pictures.calls != ["item-artwork.resolve", "application-media.preview"]:
		_fail("absent scenario key must allow exact signed application artwork")
		return
	pictures.calls.clear()
	if (await preload("res://src/item_artwork_lookup.gd").resolve(pictures.request, 0)).get("texture") != null or not pictures.calls.is_empty():
		_fail("no-picture sentinel must not request media")
		return
	await vault.reload(bridge)
	await process_frame
	await process_frame
	vault.get_node("%ArtworkGallery").item_selected.emit(0)
	if vault.get_node("%UseInItem").disabled:
		_fail("loaded artwork did not enable Use in Item")
		return
	vault.get_node("%UseInItem").pressed.emit()
	var picker = vault.get_node("%ItemArtworkPicker")
	await process_frame
	if DisplayServer.get_name() != "headless" and window.is_embedded():
		_fail("rendered picker must use a native window")
		return
	if window.gui_get_focus_owner() != picker.get_node("%DestinationSearch"):
		_fail("opening picker must focus destination search")
		return
	for reverse in [false, true]:
		for expected in (["DestinationItems", "CancelArtwork", "ApplyArtwork", "DestinationSearch"] if not reverse else ["ApplyArtwork", "CancelArtwork", "DestinationItems", "DestinationSearch"]):
			_key(window, KEY_TAB, reverse)
			await process_frame
			if window.gui_get_focus_owner() != picker.get_node("%" + expected):
				_fail("Tab traversal expected %s, received %s (reverse=%s, applyDisabled=%s, selection=%s)" % [expected, window.gui_get_focus_owner(), reverse, picker.get_node("%ApplyArtwork").disabled, picker._selected])
				return
			if expected == "ApplyArtwork":
				_key(window, KEY_ENTER)
				await process_frame
				if not window.visible or not bridge.applied.is_empty():
					_fail("focused unavailable Apply must not execute")
					return
	_key(window, KEY_ENTER)
	await process_frame
	if window.gui_get_focus_owner() != picker.get_node("%DestinationItems"):
		_fail("submitting search must move focus to destinations")
		return
	_key(window, KEY_ESCAPE)
	await process_frame
	if window.visible or root.gui_get_focus_owner() != vault.get_node("%UseInItem"):
		_fail("Escape must close picker and return focus to its opener")
		return
	vault.get_node("%UseInItem").pressed.emit()
	window.close_requested.emit()
	await process_frame
	if window.visible or root.gui_get_focus_owner() != vault.get_node("%UseInItem") or not bridge.applied.is_empty():
		_fail("closing the picker window must return focus without applying artwork")
		return
	vault.get_node("%UseInItem").pressed.emit()
	picker.get_node("%DestinationItems").item_selected.emit(0)
	bridge.payload_unavailable = true
	var proposal: Texture2D = picker.get_node("%ProposedPicture").texture
	picker.get_node("%ApplyArtwork").pressed.emit()
	if not _result.is_empty() or not window.visible or picker._pending or picker._selected.get("recordIndex") != 102 or picker.get_node("%ProposedPicture").texture != proposal or not picker.get_node("%PickerStatus").text.contains("Not applied.") or not picker.get_node("%PickerStatus").text.contains("Choose another picture."):
		_fail("payload loss must retain the destination and proposal with recovery guidance")
		return
	if picker.get_node("%CancelArtwork").disabled:
		_fail("payload loss must allow returning to choose different artwork")
		return
	bridge.payload_unavailable = false
	if not picker.get_node("%ApplyArtwork").disabled or picker.get_node("%ProposedCaption").text != "Selected artwork — not applied" or picker.get_node("%CancelArtwork").text != "Choose another picture":
		_fail("unavailable proposal requires explicit return instead of blind retry")
		return
	picker.get_node("%CancelArtwork").pressed.emit()
	if window.visible or root.gui_get_focus_owner() != vault.get_node("%UseInItem"):
		_fail("Choose another picture must return to the gallery with focus")
		return
	vault.get_node("%UseInItem").pressed.emit()
	picker.get_node("%DestinationItems").item_selected.emit(0)
	bridge.fail = true
	picker.get_node("%ApplyArtwork").pressed.emit()
	if not _result.is_empty() or not picker.get_node("%ApplyArtwork").disabled:
		_fail("conflict must retain the picker without navigation")
		return
	picker.get_node("%ReviewCurrentItem").pressed.emit()
	picker.get_node("%DestinationItems").item_selected.emit(0)
	bridge.fail = false
	picker.get_node("%ApplyArtwork").pressed.emit()
	if bridge.applied != {"identity": "vault:9000", "recordIndex": 102, "expectedRevision": 7} or _result != [{"revision": 8}, 102]:
		_fail("artwork command or returned item identity changed")
		return
	if vault.get_node("%PickerWindow").visible:
		_fail("successful apply must close the picker")
		return
	vault.clear()
	if not vault.get_node("%UseInItem").disabled:
		_fail("clearing a project must clear its selection")
		return
	var valid_png := bridge.png
	bridge.png = ""
	await vault.reload(bridge)
	vault.get_node("%ArtworkGallery").item_selected.emit(0)
	if vault.get_node("%ArtworkDimensions").text != "Loading picture…":
		_fail("selected pending preview must explain loading")
		return
	await process_frame
	await process_frame
	if not vault.get_node("%UseInItem").disabled or vault.get_node("%SelectedArtwork").texture != null or vault.get_node("%ArtworkDimensions").text != "Picture unavailable. Choose another picture.":
		_fail("failed proposed preview must explain recovery without substituting artwork")
		return
	bridge.png = valid_png
	if vault.get_node("%ArtworkGallery").get_item_icon(0) == null or not vault.get_node("InspectorInset/Selection/Zoom/One").disabled:
		_fail("unavailable cards must retain preview geometry and disable zoom")
		return
	bridge.paged = true
	await vault.reload(bridge)
	vault.get_node("%ArtworkGallery").select(0)
	vault.get_node("%ArtworkGallery").item_selected.emit(0)
	vault.get_node("%ShowMoreArtwork").pressed.emit()
	if vault._rows.size() != 26 or vault._selected != 0 or not vault.get_node("%ArtworkGallery").is_selected(0) or vault.get_node("%ShowMoreArtwork").visible or bridge.requested_offsets != [0, 25]:
		_fail("Show More must append a bounded page and preserve selection")
		return
	vault.get_node("%VaultSearch").text = "no match"
	vault.get_node("%VaultSearch").text_changed.emit("no match")
	await process_frame
	await process_frame
	if not vault._rows.is_empty() or not vault._textures.is_empty() or vault._selected != -1 or not vault.get_node("%UseInItem").disabled:
		_fail("search must clear prior pages, previews and selection")
		return
	vault.queue_free()
	await process_frame
	print("PROVIDENCE_VAULT_WORKFLOW_OK controlled-adapter-responses")
	quit(0)


func _fail(message: String) -> void:
	push_error("PROVIDENCE_VAULT_WORKFLOW_FAILED: " + message)
	quit(1)


func _key(window: Window, keycode: Key, shift := false) -> void:
	for pressed in [true, false]:
		var event := InputEventKey.new()
		event.keycode = keycode
		event.shift_pressed = shift
		event.pressed = pressed
		window.push_input(event)
