extends RefCounted

const Decoder = preload("res://src/asset_preview_decoder.gd")
var operations: ProvidenceEditorOperation
signal rows_ready
signal artwork_ready
var _stock_previews := preload("res://src/asset_preview_cache.gd").shared()


static func page_params(state: Dictionary, offset: int) -> Dictionary:
	var params := {"query": state.query, "offset": offset, "limit": state.get("limit", 25), "status": state.get("status", "all")}
	if offset == 0 and not str(state.seek).is_empty():
		if state.scope in ["scenario", "personal"]: params["seekIdentity"] = state.seek
		elif state.scope == "stock": params["identity"] = state.seek
	if not str(state.paired).is_empty():
		params["identity"] = state.paired
		params["query"] = ""
	if not str(state.collection).is_empty(): params["collection"] = state.collection
	params["kind"] = state.kind
	params["includeChecks"] = false
	return params


func load_page(bridge: RefCounted, scope: String, params: Dictionary, apply_page: Callable, guard: Callable, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	return await operations.browse_media(bridge,
		_load_workflow.bind(bridge, scope, params, apply_page, guard), borrowed)


func _load_workflow(operation: ProvidenceEditorOperation, bridge: RefCounted, scope: String, params: Dictionary, apply_page: Callable, guard: Callable) -> Dictionary:
	_stock_previews.attach_connection(bridge)
	var method: String = {"personal": "media.library.list", "scenario": "project-asset.list", "stock": "application-media.list"}[scope]
	if scope == "scenario" and params.kind == "music": method = "media.music-slots"
	var response := await operation.request(method, params)
	if not response.get("ok", false): return response
	var page: Dictionary = response.result
	page["items"] = page.get("items", []).slice(0, int(params.get("limit", 25)))
	var previews := {}
	if not guard.call(): return _changed()
	var applied: Dictionary = apply_page.call(page, previews)
	if not applied.get("ok", false): return applied
	rows_ready.emit()
	page["thumbnailsOnly"] = true
	var pending: Array[Dictionary] = []
	for row: Dictionary in page.items:
		if not guard.call(): return _changed()
		if str(row.get("kind", "")) == "text-style-resource": continue
		if str(row.get("kind", "")) in ["text-resource", "sound"]:
			previews[str(row.identity)] = {"deferred": true}
			continue
		if str(row.get("kind", "")) == "music": previews[str(row.identity)] = {"music": true}; continue
		var key := _cache_key(scope, row, page)
		var cached: Dictionary = _stock_previews.find_preview(key)
		if not cached.is_empty():
			previews[str(row.identity)] = cached
			apply_page.call(page, previews)
			continue
		var preview_method := preview_method(scope, row)
		if preview_method.is_empty():
			previews[str(row.identity)] = {"error": "Preview unavailable."}
			continue
		pending.append({"row": row, "key": key, "method": preview_method})
	for start in range(0, pending.size(), 4):
		var response_batch := await _load_batch(operation, pending.slice(start, start + 4), page, previews, apply_page, guard)
		if not response_batch.get("ok", false): return response_batch
	if not guard.call(): return _changed()
	artwork_ready.emit()
	return apply_page.call(page, previews)


func _load_batch(operation: ProvidenceEditorOperation, batch: Array, page: Dictionary, previews: Dictionary, apply_page: Callable, guard: Callable) -> Dictionary:
	var response := await operation.request("media.thumbnails", {"items": batch.map(func(item): return {"identity": item.row.identity, "method": item.method})})
	if not response.get("ok", false): return response
	for index in batch.size():
		if not guard.call(): return _changed()
		var item: Dictionary = batch[index]
		var decoded := Decoder.decode(response.result.items[index], item.row)
		previews[str(item.row.identity)] = decoded
		_stock_previews.remember(item.key, decoded)
		apply_page.call(page, previews)
		await operation.get_tree().process_frame
	return response


static func _cache_key(scope: String, row: Dictionary, page: Dictionary, options: String = "thumbnail-96-v1") -> String:
	return "%s:%s:%s:%s:%s:%s" % [scope, str(row.get("source", "")), str(row.identity), str(row.get("blob", "revision:%s" % str(page.get("revision", "")))), JSON.stringify(row.get("media", {})).sha256_text(), options]


func read_preview(operation: ProvidenceEditorOperation, scope: String, row: Dictionary, revision: int) -> Dictionary:
	var token: int = _stock_previews.connection_token()
	var key := _cache_key(scope, row, {"revision": revision}, "original-preview-v1")
	var cached: Dictionary = _stock_previews.find_preview(key)
	if not cached.is_empty(): return {"ok": true, "decoded": cached}
	var response := await operation.request(preview_method(scope, row), {"identity": row.identity})
	if not _stock_previews.connection_current(token): return _changed()
	if response.get("ok", false):
		response["decoded"] = Decoder.decode(response, row)
		_stock_previews.remember(key, response.decoded)
	return response


static func preview_method(scope: String, row: Dictionary) -> String:
	if scope == "personal": return str(row.get("previewCommand", "personal-library.preview"))
	if scope == "stock": return "application-media.preview"
	var command: Variant = row.get("previewCommand")
	return command if command is String else ""


static func _changed() -> Dictionary:
	return {"ok": false, "stale": true, "error": "The asset search or session changed while loading. Refresh to load the current selection."}


func music_source(bridge: RefCounted, params: Dictionary) -> Dictionary:
	if bridge == null: return {"ok": false, "error": "Open a library or scenario before playing music."}
	return await operations.browse_media(bridge, func(operation):
		return await operation.request("media.music-audition.prepare", params))
