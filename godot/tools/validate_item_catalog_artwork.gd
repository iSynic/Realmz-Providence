extends SceneTree

var _bridge: ProvidenceNativeBridge
var _operations: ProvidenceEditorOperation
var _view: ProvidenceItemEditor
var _controller := preload("res://src/item_workbench_controller.gd").new()
var _played_sound: Dictionary = {}


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 1)
	root.size = Vector2i(1600, 900)
	_bridge = ProvidenceNativeBridge.new(args[0].path_join("thumbnail-settings.cfg"))
	assert(_bridge.start_project(args[0]).get("ok", false))
	_operations = ProvidenceEditorOperation.new(); root.add_child(_operations)
	_view = load("res://src/item_editor.tscn").instantiate(); root.add_child(_view); _view.size = Vector2(1600, 900)
	_controller.initialize(_view, _operations, func(): return {}, func(response): return response.get("ok", false))
	_controller.attach_session(_bridge)
	_view.get_node("%StockSource").pressed.emit(); await _idle()
	_view.get_node("%Weapons").pressed.emit(); await _idle()
	assert((await _controller.open_item("classic.item.1")).get("ok", false))
	await _idle()
	_check_stock()
	await _stock_sound()
	await _missing_and_stale()
	_controller.dispose(); _bridge.stop(); _view.queue_free(); _operations.queue_free(); await process_frame
	print("PROVIDENCE_ITEM_CATALOG_ARTWORK_OK real-eight-stock-previews exact-ID missing-placeholder no-fallback current-draft-preserved stale-session continuous-form anchor-thumb focus-reveal")
	quit()


func _check_stock() -> void:
	var list := _view.get_node("%ItemCollection")
	assert(list.item_count == 8)
	for index in 8:
		var row := list.get_child(index)
		assert(row.get_node("Margin/Body/Thumbnail/Picture").texture != null)
		assert(not row.get_node("Margin/Body/Thumbnail/Placeholder").visible)
		assert(row.get_node("Margin/Body/Id/Value").text == str(index + 1))
	assert(_view.get_node("%ItemPicture").texture != null)
	assert(_view.selected_definition().classicId == 1 and not _view.has_unapplied_changes())
	assert(not _view.form.find_child("PlaySound", true, false).disabled, "Protected Stock sound is still previewable")
	_view.set_locked(true)
	assert(_view.form.find_child("PlaySound", true, false).disabled)
	_view.set_locked(false)


func _stock_sound() -> void:
	_controller.configure_navigation(Callable(), Callable(), func(value: int, identity: String, status: String): _played_sound = {"value": value, "identity": identity, "status": status})
	_view.form.find_child("PlaySound", true, false).pressed.emit()
	await _idle()
	assert(_played_sound.get("value") == 36 and not str(_played_sound.get("identity", "")).is_empty())
	assert(_played_sound.identity == "classic-application:family-jewels:snd:636" and _played_sound.status == "application-resource")
	assert(not _view.has_unapplied_changes() and _view.selected_definition().classicId == 1)


func _missing_and_stale() -> void:
	var definition := _view.selected_definition()
	var rows := _view.catalog_items()
	rows[0].iconId = 32760
	_view.show_catalog({"items": rows, "total": 199, "revision": _view.draft.revision})
	await _idle()
	var row := _view.get_node("%ItemCollection").get_child(0)
	assert(row.get_node("Margin/Body/Thumbnail/Picture").texture == null)
	assert(row.get_node("Margin/Body/Thumbnail/Placeholder").text == "!")
	assert(not row.get_node("Margin/Body/Thumbnail").tooltip_text.is_empty())
	assert(_view.selected_definition() == definition and not _view.has_unapplied_changes())
	_view.form.show_section("Special"); await process_frame; await process_frame
	var scroll: ScrollContainer = _view.form.get_node("BodyScroll")
	assert(scroll.scroll_vertical > 0 and scroll.get_v_scroll_bar().value == scroll.scroll_vertical)
	var name: LineEdit = _view.form.control_for("name")
	name.grab_focus(); await process_frame; await process_frame
	assert(scroll.scroll_vertical < 250, "Tab/focus reveals earlier controls in the continuous form")
	for section in ["Identity", "Equipment", "Special", "Restrictions"]:
		assert(_view.form.get_node("BodyScroll/Sections/" + section).visible)
	rows[0].iconId = 0
	_view.show_catalog({"items": rows, "total": 199, "revision": _view.draft.revision})
	_controller.attach_session(null)
	await process_frame; await process_frame
	assert(_view.get_node("%ItemCollection").item_count == 0 and _view.selected_definition().is_empty())
	assert(_view.get_node("%ItemPicture").texture == null, "Session replacement removes the previous item's hero artwork")
	assert(_view.get_node("%PicturePlaceholder").visible and _view.get_node("%PicturePlaceholder").text == "—")
	assert(_view.get_node("%ArtworkNotice").text == "No artwork selected")


func _idle() -> void:
	var stable := 0
	for frame in 900:
		await process_frame
		stable = stable + 1 if not _operations.busy and not _bridge.operation_busy() else 0
		if stable >= 5: return
	assert(false, "Bounded thumbnail operation did not settle")
