extends SceneTree

const DialogChecks = preload("res://tools/validate_text_resource_dialog.gd")
class Bridge extends DialogChecks.TextBridge:
	func request(method: String, params: Dictionary = {}) -> Dictionary:
		if method == "reference.used-by":
			requests.append({"method":method,"params":params.duplicate(true)})
			var items: Array = []
			for index in range(int(params.offset),mini(int(params.offset)+128,129)):
				items.append({"source":"extra-action-point:%d" % (index+1),"field":"actions[3].target","targetKind":"text-resource","targetId":"-202"})
			return {"ok":true,"result":{"items":items,"total":129,"offset":params.offset,"truncated":int(params.offset)+items.size()<129}}
		var response := super.request(method,params)
		if method=="text-resource.open" and response.get("ok",false):
			response.result["textBlob"] = str(text.hash())
			response.result["styleBlob"] = "unchanged-formatting"
		return response

var _dialog: Window
var _bridge := Bridge.new()
var _opened: Array = []
var _previews: Array = []
func _initialize() -> void: call_deferred("_run")
func _run() -> void:
	root.size = Vector2i(1600,900)
	root.gui_embed_subwindows = true
	_dialog = preload("res://src/text_resource_dialog.tscn").instantiate()
	root.add_child(_dialog)
	_dialog.configure_link_actions(func(reference): _opened.append(reference),func(id): _previews.append(id))
	assert((await _dialog.open_text(_bridge,"text:-202")).ok)
	await _dialog._open_uses(0)
	assert(_dialog.get_node("%UsesWindow").visible and _dialog.get_node("%UseList").item_count==128)
	assert(not _dialog.get_node("%UseNext").disabled and _dialog.get_node("%UsePrevious").disabled)
	await _dialog._open_uses(128)
	assert(_dialog.get_node("%UseList").item_count==1 and _dialog.get_node("%UseNext").disabled)
	assert(_dialog.get_node("%UseList").get_item_text(0)=="XAP 129 · Step 4")
	await _draft("A retained navigation draft")
	_dialog._open_use(0)
	assert(_opened.is_empty() and _dialog.get_node("%Discard").visible)
	_dialog.get_node("%Discard").hide()
	_dialog.get_node("%Discard").canceled.emit()
	assert(_dialog.visible and _dialog.editor.text=="A retained navigation draft")
	await _dialog._open_uses(128)
	_dialog._open_use(0)
	var revision := _bridge.revision
	await _dialog._apply_and_continue()
	assert(_opened.size()==1 and _opened[0].source=="extra-action-point:129")
	assert(_bridge.revision==revision+1 and not _dialog.visible)
	assert((await _dialog.open_text(_bridge,"text:-202")).ok)
	_dialog.get_node("%RebuiltPreview").pressed.emit()
	assert(_previews==[-202] and not _dialog.visible and _bridge.revision==revision+1)
	await _failures()
	await _format_conflict()
	_dialog.free()
	print("PROVIDENCE_TEXT_LINKS_OK bounded-callers exact-source dirty-apply-discard-cancel preview-departure failed-write format-conflict stale-destination")
	quit()
func _draft(text: String) -> void:
	_dialog.editor.text=text
	_dialog.editor.text_changed.emit()
	await _dialog.get_node("%StyleWorkbench")._inspect()
func _failures() -> void:
	assert((await _dialog.open_text(_bridge,"text:-202")).ok)
	await _draft("Failure keeps the entire draft")
	await _dialog._open_uses(0)
	_dialog._open_use(0)
	_bridge.failure="Controlled durable rejection"
	var revision := _bridge.revision
	await _dialog._apply_and_continue()
	assert(_dialog.visible and _dialog.editor.text=="Failure keeps the entire draft")
	assert(_opened.size()==1 and _bridge.revision==revision)
	_bridge.failure=""
	_dialog.discard_draft()
	_dialog.get_node("%Discard").confirmed.emit()
	assert(_opened.size()==1)
func _format_conflict() -> void:
	assert((await _dialog.open_text(_bridge,"text:-202")).ok)
	var styles = _dialog.get_node("%StyleWorkbench")
	_dialog.editor.select(0,0,0,3)
	styles.get_node("%StyleBold").toggled.emit(true)
	styles.get_node("%ApplySelection").pressed.emit()
	await styles._inspect()
	_bridge.text="Saved text changed while this draft was open"
	_bridge.revision+=1
	await _dialog.apply_text()
	assert(_dialog.get_node("%ReviewCurrent").visible)
	await _dialog.review_current()
	assert(_dialog.get_node("%UseCurrent").disabled and styles.has_formatting_changes())
	_dialog.get_node("%LoadSaved").pressed.emit()
	assert(_dialog.get_node("%ReplaceDraft").visible)
	_dialog.get_node("%ReplaceDraft").hide()
	_dialog.get_node("%ReplaceDraft").canceled.emit()
	assert(styles.has_formatting_changes())
	_dialog._load_saved_version()
	assert(_dialog.editor.text==_bridge.text and not _dialog.has_unapplied_changes())
	assert(not styles.get_node("%StyleBold").button_pressed)
	_dialog.discard_draft()
