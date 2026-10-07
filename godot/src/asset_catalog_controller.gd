extends RefCounted

const Decoder = preload("res://src/asset_preview_decoder.gd")
var operations: ProvidenceEditorOperation
var _stock_previews := preload("res://src/asset_preview_cache.gd").new()


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
	for row: Dictionary in page.items:
		if not guard.call(): return _changed()
		if str(row.get("kind", "")) == "text-style-resource": continue
		if str(row.get("kind", "")) == "music": previews[str(row.identity)] = {"music": true}; continue
		# Stock media is immutable within the adapter's loaded library connection.
		# Scenario and personal previews are never served from this cache.
		var cached := _stock_previews.find_preview(str(row.identity)) if scope == "stock" else {}
		if not cached.is_empty():
			previews[str(row.identity)] = cached
			continue
		var preview_method := _preview_method(scope, row)
		if preview_method.is_empty():
			previews[str(row.identity)] = {"error": "Preview unavailable."}
			continue
		var preview := await operation.request(preview_method, {"identity": row.identity})
		if preview.get("outcomeUnknown", false): return preview
		# Decode one bounded preview between worker waits, not a page-sized burst
		# after releasing the lease. Completion includes all displayed thumbnails.
		previews[str(row.identity)] = Decoder.decode(preview, row)
		if scope == "stock": _stock_previews.remember(str(row.identity), previews[str(row.identity)])
	if not guard.call(): return _changed()
	return apply_page.call(page, previews)


static func _preview_method(scope: String, row: Dictionary) -> String:
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
