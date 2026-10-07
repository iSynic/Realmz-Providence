extends RefCounted

const PreviewDecoder = preload("res://src/asset_preview_decoder.gd")

signal projection_applied(projection: Dictionary)
signal status_changed(message: String)

var refresh_affected: Callable
var _prefix: String
var _view: Control
var _operations: ProvidenceEditorOperation
var _read_context: Callable
var _accept_read: Callable
var _accept_draft: Callable
var _bridge: RefCounted
var _generation := 0
var _thumbnail_limit := 0


func initialize(prefix: String, view: Control, operations: ProvidenceEditorOperation, read_context: Callable, accept_read: Callable, accept_draft: Callable) -> void:
	_prefix = prefix
	_view = view
	_operations = operations
	_read_context = read_context
	_accept_read = accept_read
	_accept_draft = accept_draft
	_thumbnail_limit = 0 if prefix == "sound" else (24 if prefix == "picture" else 48)
	_view.commit_handler = update_metadata
	_view.import_handler = import_media


func attach_session(bridge: RefCounted) -> void:
	_generation += 1
	_bridge = bridge
	_view.discard_draft()
	_set_catalog({"items": [], "total": 0, "missingTargets": []}, "")


func teardown() -> void:
	attach_session(null)
	_view.set_compile_available(false, "Open a persistent Providence project to compile scenario resources.")


func dispose() -> void:
	_generation += 1
	# The Assets owner holds media-open capabilities; release the reverse link.
	refresh_affected = Callable()
	_view.commit_handler = Callable()
	_view.import_handler = Callable()
	for connection in projection_applied.get_connections(): projection_applied.disconnect(connection.callable)
	for connection in status_changed.get_connections(): status_changed.disconnect(connection.callable)


func refresh_workbench(operation: ProvidenceEditorOperation = null) -> Dictionary:
	return await _reload_response("", operation)


func reload(preferred_identity: String = "") -> Dictionary:
	var response := await _reload_response(preferred_identity)
	_accept_read.call(response)
	return response


func _reload_response(preferred: String, operation: ProvidenceEditorOperation = null) -> Dictionary:
	var allowed := _read_allowed()
	if not allowed.ok: return allowed
	return await _operations.run_workflow(_bridge, "Load scenario resources", _reload_workflow.bind(preferred, _guard()), operation)


func open_media(identity: String) -> Dictionary:
	var response := _read_allowed()
	if response.ok and not identity.is_empty():
		response = await _operations.run_workflow(_bridge, "Open scenario resource", _open_workflow.bind(identity, _guard()))
	_view.restore_catalog_selection()
	_accept_read.call(response)
	return response


func preview_and_play(identity: String) -> bool:
	var response := await open_media(identity)
	return bool(response.get("ok", false)) and bool(_view.play_preview())


func preview_application_and_play(identity: String) -> bool:
	if _prefix != "sound" or _bridge == null or identity.is_empty(): return false
	var response := await _operations.run_workflow(
		_bridge,
		"Preview stock sound",
		func(operation): return await operation.request("application-media.preview", {"identity": identity}),
	)
	var decoded := PreviewDecoder.decode(response, {})
	var stream: AudioStreamWAV = decoded.get("audio")
	if stream == null: return false
	_view.set_preview_stream(stream)
	return bool(_view.play_preview())


func stop_preview() -> void:
	_view.stop_preview()


func import_media(payload: Dictionary) -> Dictionary:
	return await _submit("import", payload, "", false)


func update_metadata(payload: Dictionary) -> Dictionary:
	return await _submit("update", payload, str(payload.get("identity", "")), true)


func update_resource(identity: String, label: String, resource_id: int) -> Dictionary:
	return await update_metadata({"identity": identity, "label": label, "resourceId": resource_id})


func update_tile(identity: String, label: String, resource_id: int, landlook: Variant, base_tile: Variant) -> Dictionary:
	return await update_metadata({"identity": identity, "label": label, "resourceId": resource_id,
		"landlook": landlook, "baseTile": base_tile})


func remove_media(identity: String) -> Dictionary:
	return await _submit("remove", {"identity": identity}, "", false)


func _submit(action: String, payload: Dictionary, preferred: String, draft: bool) -> Dictionary:
	if _bridge == null: return {"ok": false, "error": "Open a project before editing resources."}
	if action != "update" and _view.has_unapplied_changes():
		var retained := {"ok": false, "draftKept": true, "error": "Apply or discard the resource draft before importing or removing resources."}
		_accept_read.call(retained)
		return retained
	var params := payload.duplicate(true)
	params["expectedRevision"] = int(_read_context.call().revision)
	var response := await _operations.run_workflow(_bridge, action.capitalize() + " scenario resource",
		_mutation_workflow.bind(action, params, preferred, _guard()))
	var accepted: bool = (_accept_draft if draft else _accept_read).call(response)
	if accepted:
		var message := "%s applied · revision %d" % [action.capitalize(), int(_read_context.call().revision)]
		if response.has("viewRefreshError"): message += "; the view could not refresh. " + str(response.viewRefreshError)
		elif action == "remove" and _prefix == "special-land": message += "; used map cells are now explicit Problems"
		status_changed.emit(message)
	return response


func _mutation_workflow(operation: ProvidenceEditorOperation, action: String, params: Dictionary, preferred: String, guard: Dictionary) -> Dictionary:
	var response := await operation.request(_prefix + "." + action, params)
	if not response.get("ok", false): return response
	# The native acknowledgement follows its durable checkpoint. A subsequent
	# projection failure must never turn this into a rejected or retried edit.
	if int(guard.generation) != _generation:
		response["viewRefreshError"] = "The resource document session changed."
		return response
	if action == "update": _view.accept_saved_metadata(params)
	projection_applied.emit(response.result)
	var identity := str(response.result.get("identity", preferred)) if action != "remove" else ""
	var refreshed := await _reload_workflow(operation, identity, guard)
	if refreshed.get("ok", false) and refresh_affected.is_valid():
		# A removal can originate in the unified gallery while this resource view
		# is hidden. Its visible origin must finish refreshing within the same lease.
		refreshed = await refresh_affected.call(operation)
	if not refreshed.get("ok", false):
		response["viewRefreshError"] = str(refreshed.get("error", "Reload the resource document."))
		if refreshed.get("outcomeUnknown", false): response["outcomeUnknown"] = true
	return response


func _reload_workflow(operation: ProvidenceEditorOperation, preferred: String, guard: Dictionary) -> Dictionary:
	var response := await operation.request(_prefix + ".list", {"offset": 0, "limit": 128})
	if not response.get("ok", false): return response
	var page: Dictionary = response.result
	var identity: String = _view.catalog_identity(page.get("items", []), preferred)
	var opened := {"ok": true}
	if not identity.is_empty():
		opened = await _read_media(operation, identity)
		if not opened.get("ok", false): return opened
	var thumbnails := await _read_thumbnails(operation, page.get("items", []), identity, opened.get("preview", {}))
	if not thumbnails.get("ok", false): return thumbnails
	var unchanged := _check_guard(guard)
	if not unchanged.ok: return unchanged
	_set_catalog(page, identity)
	if opened.has("document"): _apply_media(opened)
	for key in thumbnails.previews:
		var preview: Dictionary = thumbnails.previews[key]
		_view.set_thumbnail_base64(key, str(preview.get("base64", "")), str(preview.get("mimeType", "image/png")))
	status_changed.emit("Scenario resources loaded")
	return response


func _open_workflow(operation: ProvidenceEditorOperation, identity: String, guard: Dictionary) -> Dictionary:
	var response := await _read_media(operation, identity)
	if not response.get("ok", false): return response
	var unchanged := _check_guard(guard)
	if not unchanged.ok: return unchanged
	_apply_media(response)
	return response


func _read_media(operation: ProvidenceEditorOperation, identity: String) -> Dictionary:
	var opened := await operation.request(_prefix + ".open", {"identity": identity})
	if not opened.get("ok", false): return opened
	var preview := await operation.request(_prefix + ".preview", {"identity": identity})
	if preview.get("outcomeUnknown", false): return preview
	# Unsupported previews do not prevent metadata editing or repair of the resource.
	return {"ok": true, "document": opened.result, "preview": preview.get("result", {})}


func _read_thumbnails(operation: ProvidenceEditorOperation, items: Array, selected: String, selected_preview: Dictionary) -> Dictionary:
	var previews := {}
	for index in mini(items.size(), _thumbnail_limit):
		var row: Dictionary = items[index]
		if not row.get("hasPreview", false): continue
		var identity := str(row.get("identity", ""))
		if identity == selected:
			previews[identity] = selected_preview
			continue
		var response := await operation.request(_prefix + ".preview", {"identity": identity})
		if response.get("outcomeUnknown", false): return response
		if response.get("ok", false): previews[identity] = response.result
	return {"ok": true, "previews": previews}


func _apply_media(response: Dictionary) -> void:
	_view.set_document(response.document)
	var preview: Dictionary = response.preview
	if _prefix == "sound":
		_view.set_preview_pcm8_base64(str(preview.get("pcm8Base64", "")), int(preview.get("sampleRate", 0)))
	else:
		_view.set_preview_base64(str(preview.get("base64", "")), str(preview.get("mimeType", "image/png")))
	_view.restore_catalog_selection()


func _set_catalog(page: Dictionary, identity: String) -> void:
	var blocked := _view.is_blocking_signals()
	_view.set_block_signals(true)
	var revision := int(_read_context.call().revision)
	match _prefix:
		"picture": _view.set_pictures(page, revision, identity)
		"sound": _view.set_sounds(page, revision, identity)
		"icon": _view.set_icons(page, revision, identity)
		"special-land": _view.set_tiles(page, revision, identity)
	_view.set_block_signals(blocked)
	if identity.is_empty() and _prefix != "special-land": _view.present_selection()


func _read_allowed() -> Dictionary:
	if _bridge == null: return {"ok": false, "error": "Open a project before loading resources."}
	if _view.has_unapplied_changes():
		return {"ok": false, "draftKept": true, "error": "Apply or discard the resource draft before refreshing or changing selection."}
	return {"ok": true}


func _guard() -> Dictionary:
	return {"generation": _generation, "state": _view.read_state()}


func _check_guard(guard: Dictionary) -> Dictionary:
	if guard.generation != _generation:
		return {"ok": false, "connectionChanged": true, "error": "The resource document session changed before loading finished."}
	if guard.state != _view.read_state():
		return {"ok": false, "draftKept": true, "error": "The resource draft or search changed while loading. Your changes are kept."}
	return {"ok": true}
