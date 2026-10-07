extends "res://tools/capture_player_scenario.gd"

class LegacyBridge extends "res://src/native_bridge.gd":
	var projection: Dictionary
	var unknown := false
	var sources := [{"nativePath":"Original Marker","blob":"controlled-source-a","byteLength":319},{"nativePath":"Preserved Alternate","blob":"controlled-source-b","byteLength":320}]
	func _request(method: String, _params: Dictionary) -> Dictionary:
		match method:
			"scenario-security.open": return {"ok":true,"result":projection.duplicate(true)}
			"scenario-security.source-list": return {"ok":true,"result":{"revision":3,"items":sources,"total":2,"offset":0,"limit":64}}
			"scenario-security.source-preview":
				var result := projection.duplicate(true)
				result.merge({"sourceSelectionRequired":false,"decodingAvailable":true,"segment1":"p38beta","segment2":"p38delta"},true)
				return {"ok":true,"result":result}
			"scenario-security.validate": return {"ok":true,"result":{"valid":true}}
			"scenario-security.update": return {"ok":false,"outcomeUnknown":unknown,"error":"Controlled write outcome · retain this draft and resolve the original result."}
			_: return {"ok":false,"error":"Controlled unavailable response"}


func _run() -> void:
	create_timer(60).timeout.connect(func(): push_error("Recovery capture timed out"); quit(1))
	root.content_scale_size = DisplayServer.window_get_size(); root.gui_embed_subwindows = true
	_out = OS.get_environment("PROVIDENCE_CAPTURE_PATH"); DirAccess.make_dir_recursive_absolute(_out)
	_editor = load("res://src/editor_shell.tscn").instantiate(); root.add_child(_editor)
	for _frame in 4: await process_frame
	await _editor._project_session.open_project(OS.get_environment("PROVIDENCE_CAPTURE_PROJECT"))
	while _editor._operations.busy: await _editor._operations.completed
	await _editor._navigation.select_route("scenario.registration")
	while _editor._operations.busy: await _editor._operations.completed
	var view: Control = _editor._workbenches.scenario_sections[3]
	var fixture := LegacyBridge.new()
	fixture.projection = view.applied.duplicate(true)
	fixture.projection.merge({"revision":3,"sourceSelectionRequired":true,"decodingAvailable":false,"segment1":"","segment2":"","reason":"Choose the retained original startup file before editing Security."},true)
	view.configure_operations(_editor._operations,func(): return fixture)
	view.controller.configure_authoring(func(_response: Dictionary): pass)
	assert((await view.refresh_workbench()).get("ok",false))
	await _capture("scenario.registration","controlled-source-required",view)
	var picker: Window = view.get_node("StartupSourcePicker")
	picker.begin(view,view.find_child("ChooseOriginalSource",true,false))
	while _editor._operations.busy: await _editor._operations.completed
	for _frame in 4: await process_frame
	picker.get_node("%SourceChoices").select(0); await picker._preview(0)
	await _capture("scenario.registration","controlled-source-picker",view)
	picker.hide(); picker.confirmed.emit()
	view.find_child("UnlockEditing",true,false).pressed.emit()
	view.text_field("CodeSegment1").text = "Retained local draft"; view.draft_changed()
	await view.controller.validate()
	fixture.unknown = true
	await view.controller.apply()
	await _capture("scenario.registration","controlled-uncertain-write",view)
	FileAccess.open(_out.path_join("controlled-%dx%d.json" % [DisplayServer.window_get_size().x,DisplayServer.window_get_size().y]),FileAccess.WRITE).store_string(JSON.stringify({"states":_receipts,"evidenceKind":"Controlled legacy and uncertain-outcome presentation. Executable real-source preservation is protected separately by adapter tests."},"  "))
	fixture.stop(); _editor._bridge.stop(); _editor.free()
	print("PROVIDENCE_PLAYER_SCENARIO_RECOVERY_CAPTURE_OK"); quit()
