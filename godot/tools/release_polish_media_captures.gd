extends RefCounted

var shell: Control
var _scratch := ""
var _save: Callable
var _settle: Callable
var _view: Control
var _panel: Control


func initialize(editor: Control, scratch: String, capture: Callable, settle: Callable) -> void:
	shell = editor; _scratch = scratch; _save = capture; _settle = settle


func capture(viewport: Vector2i) -> void:
	await shell._assets.open_library("scenario"); await _settle.call()
	_view = shell._assets.library_workbench; _panel = _view.get_node("%Gallery")
	await _view.show_scope("scenario"); await _panel.show_kind("music")
	await _panel.refresh_selection("asset:scenario-music:1"); await _settle.call()
	var audition: Control = _panel.get_node("%MusicAudition")
	await _save.call("music-ready","assets.project-assets",viewport)
	shell._bridge.delay_music = true; audition.toggle()
	await _save.call("music-loading","assets.project-assets",viewport,false)
	var deadline := Time.get_ticks_msec() + 60000
	while not audition.get_node("%MusicAudio").playing and Time.get_ticks_msec()<deadline: await shell.get_tree().process_frame
	assert(audition.get_node("%MusicAudio").playing,"Actual imported MOD did not play")
	await _save.call("music-playing","assets.project-assets",viewport)
	audition.stop(); _panel.get_node("%OpenPreview").pressed.emit()
	await _save.call("music-nested-preview","assets.project-assets",viewport)
	_panel.get_node("%MediaPreview").cancel()
	var prior_decoder := OS.get_environment("PROVIDENCE_MUSIC_DECODER")
	OS.set_environment("PROVIDENCE_MUSIC_DECODER",_scratch.path_join("missing-decoder.exe")); audition.toggle()
	await _save.call("music-failure","assets.project-assets",viewport)
	OS.set_environment("PROVIDENCE_MUSIC_DECODER",prior_decoder)
	await _panel.refresh_selection("music-slot:3")
	await _save.call("music-empty-slot","assets.project-assets",viewport)
	await _panel.refresh_selection("asset:scenario-music:1")
	await _library_states(viewport)
	await _import_states(viewport)


func _library_states(viewport: Vector2i) -> void:
	var dialog: Window = _view.get_node("%MediaDialog")
	await dialog.open_review("transfer",shell._bridge,_view._media_commands,_panel.selection_context())
	dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	assert(not dialog.get_node("%Accept").disabled)
	await _save.call("music-transfer-review","assets.library-assets",viewport)
	if viewport.x == 1920: await dialog._accept(); await _settle.call()
	else: dialog._cancel()
	await _view.show_scope("personal"); await _panel.show_kind("music"); await _panel._select(0); await _settle.call()
	await _save.call("music-library","assets.library-assets",viewport)
	await dialog.open_review("prepare-original",shell._bridge,_view._media_commands,_panel.selection_context())
	dialog.get_node("%PrepareDelay").stop()
	await _save.call("music-copy-occupied","assets.library-assets",viewport)
	var allocation: Control = dialog.get_node("%MusicAllocation")
	allocation.get_node("%MusicSlot").select(2); allocation.get_node("%MusicSlot").item_selected.emit(2)
	await dialog._prepare(); await _save.call("music-copy-empty","assets.library-assets",viewport)
	await dialog._accept(); await _settle.call()
	await _panel._select(0)
	await dialog.open_review("prepare-original",shell._bridge,_view._media_commands,_panel.selection_context())
	dialog.get_node("%PrepareDelay").stop()
	await _save.call("music-full-allocation","assets.library-assets",viewport)
	dialog._cancel()
	var undo: Dictionary = shell._bridge.request("history.undo", {"expectedRevision":shell._session_view.revision})
	assert(undo.ok,str(undo)); shell._session_view.apply(undo.result); await _settle.call()
	await _view.show_scope("stock"); await _panel.show_kind("music")
	await _save.call("music-stock","assets.library-assets",viewport)
	await _view.show_scope("scenario"); await _panel.show_kind("music")


func _import_states(viewport: Vector2i) -> void:
	var path := _scratch.path_join("harbor.mod")
	FileAccess.open(path,FileAccess.WRITE).store_buffer(preload("res://tools/music_fixture.gd").module_bytes())
	await _panel.refresh_selection("asset:scenario-music:1")
	var dialog: Window = _view.get_node("%MediaDialog")
	await dialog.open_review("replace",shell._bridge,_view._media_commands,_panel.selection_context())
	dialog.get_node("%Path").text = path; dialog.get_node("%DraftName").text = "Harbor at Dusk"
	dialog.get_node("%PrepareDelay").stop(); await dialog._prepare(); assert(not dialog.get_node("%Accept").disabled)
	await _save.call("music-replace-review","assets.project-assets",viewport)
	FileAccess.open(path,FileAccess.WRITE).store_string("MADG unsupported controlled input")
	await dialog._prepare(); await _save.call("music-invalid-import","assets.project-assets",viewport)
	dialog._cancel()
	FileAccess.open(path,FileAccess.WRITE).store_buffer(preload("res://tools/music_fixture.gd").module_bytes())
	await dialog.open_review("replace",shell._bridge,_view._media_commands,_panel.selection_context())
	dialog.get_node("%Path").text = path; dialog.get_node("%DraftName").text = "Harbor at Dusk"
	dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	shell._bridge.lose_media = true; await dialog._accept()
	await _save.call("music-uncertain","assets.project-assets",viewport)
	dialog._cancel(); await _save.call("music-recovery-footer","assets.project-assets",viewport)
	await _view._reconcile_media(); await _settle.call()
