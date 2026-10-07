extends RefCounted


static func load_all(request: Callable, method: String, current: Callable) -> Dictionary:
	var response: Dictionary = await request.call(method, {"offset": 0, "limit": 128})
	if not response.get("ok", false): return response
	var result: Dictionary = response.result.duplicate(true)
	var items: Array = result.get("items", []).duplicate(true)
	var total := int(result.get("total", items.size()))
	var revision = result.get("revision")
	if total < items.size() or total > 65536: return _inconsistent()
	while items.size() < total:
		if not current.call(): return {"ok":false,"connectionChanged":true,"error":"The record browser changed while loading."}
		var page: Dictionary = await request.call(method, {"offset":items.size(),"limit":128})
		if not page.get("ok", false): return page
		var rows: Array = page.result.get("items", [])
		if rows.is_empty() or int(page.result.get("total", total)) != total or page.result.get("revision") != revision:
			return _inconsistent()
		items.append_array(rows)
	if not current.call() or items.size() != total: return _inconsistent()
	result.items = items
	result.truncated = false
	response.result = result
	return response


static func _inconsistent() -> Dictionary:
	return {"ok":false,"error":"The record catalog changed while loading. Reload it before choosing a record."}
