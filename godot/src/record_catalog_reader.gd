extends RefCounted


static func load_all(request: Callable, method: String, current: Callable, query: Dictionary = {}) -> Dictionary:
	if not current.call(): return _changed()
	var params := query.duplicate(true)
	params.erase("seekIdentity"); params.erase("seekNativeId")
	params.offset = 0; params.limit = 128
	var response: Dictionary = await request.call(method, params)
	if not response.get("ok", false): return response
	if not current.call(): return _changed()
	var result: Dictionary = response.result.duplicate(true)
	var items: Array = result.get("items", []).duplicate(true)
	var total := int(result.get("total", items.size()))
	var revision = result.get("revision")
	if total < items.size() or total > 65536 or items.size() > 128 or int(result.get("offset", 0)) != 0: return _inconsistent()
	while items.size() < total:
		if not current.call(): return _changed()
		params.offset = items.size()
		var page: Dictionary = await request.call(method, params)
		if not page.get("ok", false): return page
		if not current.call(): return _changed()
		var rows: Array = page.result.get("items", [])
		if rows.is_empty() or rows.size() > 128 or int(page.result.get("offset", params.offset)) != params.offset or int(page.result.get("total", total)) != total or page.result.get("revision") != revision:
			return _inconsistent()
		items.append_array(rows)
	if not current.call() or items.size() != total: return _inconsistent()
	result.items = items
	result.truncated = false
	response.result = result
	return response


static func _changed() -> Dictionary:
	return {"ok":false,"connectionChanged":true,"error":"The record browser changed while loading."}


static func _inconsistent() -> Dictionary:
	return {"ok":false,"error":"The record catalog changed while loading. Reload it before choosing a record."}
