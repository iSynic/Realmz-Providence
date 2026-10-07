extends RefCounted


static func load_range(bridge, scope: String, query: String, revision: int, first: int, last: int, cancelled: Callable = Callable(), metrics: Dictionary = {}) -> Dictionary:
	if bridge == null or revision < 0 or first < 0 or last < first:
		return {"ok": false, "error": "Library range requires a current catalog revision."}
	var items: Array = []
	var seen: Dictionary = {}
	for offset in range(first, last + 1, 128):
		var wait_started := Time.get_ticks_usec()
		await (Engine.get_main_loop() as SceneTree).process_frame
		metrics["rangeFrameWaitUsec"] = int(metrics.get("rangeFrameWaitUsec", 0)) + Time.get_ticks_usec() - wait_started
		if cancelled.is_valid() and cancelled.call():
			return {"ok": false, "cancelled": true}
		var started := Time.get_ticks_usec()
		var count := mini(128, last - offset + 1)
		var response: Dictionary = await bridge.request("monster-library.list", {"ownership": scope, "query": query, "offset": offset, "limit": count})
		metrics["rangeRequestUsec"] = int(metrics.get("rangeRequestUsec", 0)) + Time.get_ticks_usec() - started
		if bridge.has_method("request_metrics"):
			var request_metrics: Dictionary = bridge.request_metrics()
			for key in request_metrics:
				metrics["range_" + key] = int(metrics.get("range_" + key, 0)) + int(request_metrics[key])
		var validate_started := Time.get_ticks_usec()
		if response.get("outcomeUnknown", false): return response
		if cancelled.is_valid() and cancelled.call():
			return {"ok": false, "cancelled": true}
		if not bool(response.get("ok", false)):
			return response
		var result: Dictionary = response.get("result", {})
		var page: Array = result.get("items", [])
		if int(result.get("revision", -1)) != revision or int(result.get("offset", -1)) != offset or page.size() != count:
			return {"ok": false, "error": "Library changed while selecting the range. Reload and select again."}
		for item: Dictionary in page:
			var identity := str(item.get("identity", ""))
			if identity.is_empty() or seen.has(identity):
				return {"ok": false, "error": "Library range contains invalid or duplicate identities."}
			seen[identity] = true
			items.append(item.duplicate(true))
		metrics["maxStepUsec"] = maxi(int(metrics.get("maxStepUsec", 0)), Time.get_ticks_usec() - started)
		metrics["rangeValidationUsec"] = int(metrics.get("rangeValidationUsec", 0)) + Time.get_ticks_usec() - validate_started
	return {"ok": true, "items": items}
