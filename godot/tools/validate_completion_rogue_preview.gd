extends SceneTree

var opened: Dictionary = {}

func _initialize() -> void:
	create_timer(30.0).timeout.connect(func(): push_error("Rogue preview check timed out"); quit(1))
	call_deferred("_run")

func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 2 and FileAccess.file_exists(args[0].path_join("assets-corpus-disposable.marker")))
	var bridge := ProvidenceNativeBridge.new(args[0].path_join("rogue-preview.cfg"))
	assert(bridge.start_project(args[0]).get("ok",false))
	var response: Dictionary = bridge.request("encounter.open-complex",{"identity":"complex-encounter:3"})
	assert(response.get("ok",false) and not response.result.roguePreview.is_empty())
	var view = load("res://src/complex_encounter_editor.tscn").instantiate()
	root.add_child(view); await process_frame
	var actions: Dictionary = bridge.request("action-definition.list", {"limit":128})
	assert(actions.get("ok",false))
	view.set_action_catalog(actions.result)
	view.set_document(response.result)
	assert(not view._rogue_preview.text.contains("unavailable") and not view.get_node("%OpenRogue").disabled)
	view.semantic_target_open_requested.connect(func(kind,id,identity,context): opened={"kind":kind,"id":id,"identity":identity,"context":context})
	view.get_node("%OpenRogue").pressed.emit()
	assert(opened.identity == response.result.roguePreview.identity and opened.context.returnIdentity == "complex-encounter:3")
	var catalog: Dictionary = bridge.request("encounter.list-rogue",{"offset":0,"limit":64})
	assert(catalog.get("ok",false))
	view._picker_kind = "rogue-encounter"; view._response_items = catalog.result.items
	view._accept_response(0)
	assert(not view._rogue_preview.text.contains("unavailable") and not view.get_node("%OpenRogue").disabled)
	var missing: Dictionary = response.result.duplicate(true)
	missing.roguePreview = {}; view.set_document(missing)
	assert(view._rogue_preview.text.contains("unavailable") and view.get_node("%OpenRogue").disabled)
	view.set_document(response.result)
	assert(not view._rogue_preview.text.contains("unavailable") and not view.has_unapplied_changes())
	var file := FileAccess.open(args[1],FileAccess.WRITE)
	file.store_string(JSON.stringify({"checks":["Real imported initial Rogue preview resolves; chooser acceptance resolves; absent target remains unavailable; return restores clean imported document"]},"\t")); file.close()
	view.free(); bridge.stop()
	print("PROVIDENCE_COMPLETION_ROGUE_PREVIEW_OK initial chooser missing exact-return")
	quit()
