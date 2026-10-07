extends RefCounted

const REASONS := {"preferred-slot": "preferred slot", "preferred-occupied": "preferred occupied", "next-open-slot": "next open slot"}


static func load_plan(bridge, identities: Array, project_revision: int, library_revision: int, cancelled: Callable = Callable(), metrics: Dictionary = {}) -> Dictionary:
	if bridge == null or project_revision < 0 or library_revision < 0:
		return _fail("Destination plan unavailable: source revisions are not available.")
	var requested: Dictionary = {}
	for identity in identities:
		if not identity is String or identity.is_empty() or requested.has(identity):
			return _fail("Destination plan unavailable: selection identities are invalid.")
		requested[identity] = true
	if requested.is_empty():
		return _fail("Destination plan unavailable: no selected entries.")
	var rows: Dictionary = {}
	var targets: Dictionary = {}
	for offset in range(0, identities.size(), 128):
		var wait_started := Time.get_ticks_usec()
		await (Engine.get_main_loop() as SceneTree).process_frame
		metrics["planFrameWaitUsec"] = int(metrics.get("planFrameWaitUsec", 0)) + Time.get_ticks_usec() - wait_started
		if cancelled.is_valid() and cancelled.call():
			return {"ok": false, "cancelled": true}
		var started := Time.get_ticks_usec()
		var page := await _load_page(bridge, identities, requested, project_revision, library_revision, offset, metrics)
		if page.get("outcomeUnknown", false): return page
		if cancelled.is_valid() and cancelled.call():
			return {"ok": false, "cancelled": true}
		if not page.ok:
			return page
		for identity in page.rows:
			var target: int = page.rows[identity].targetId
			if rows.has(identity) or targets.has(target):
				return _fail("Destination plan unavailable: duplicate identity or target across pages.")
			rows[identity] = page.rows[identity]
			targets[target] = true
		metrics["maxStepUsec"] = maxi(int(metrics.get("maxStepUsec", 0)), Time.get_ticks_usec() - started)
		metrics["planStepUsec"] = int(metrics.get("planStepUsec", 0)) + Time.get_ticks_usec() - started
	return {"ok": true, "rows": rows, "projectRevision": project_revision, "libraryRevision": library_revision}


static func _load_page(bridge, identities: Array, requested: Dictionary, project_revision: int, library_revision: int, offset: int, metrics: Dictionary) -> Dictionary:
	var request_started := Time.get_ticks_usec()
	var response: Dictionary = await bridge.request("monster-library.population-plan", {
		"expectedRevision": project_revision, "expectedLibraryRevision": library_revision,
		"entryIds": identities, "offset": offset, "limit": 128,
	})
	metrics["planRequestUsec"] = int(metrics.get("planRequestUsec", 0)) + Time.get_ticks_usec() - request_started
	if bridge.has_method("request_metrics"):
		var request_metrics: Dictionary = bridge.request_metrics()
		for key in request_metrics:
			metrics["plan_" + key] = int(metrics.get("plan_" + key, 0)) + int(request_metrics[key])
	if not bool(response.get("ok", false)):
		return response
	var result: Dictionary = response.get("result", {})
	if result.get("format") != "providence.monster-population-plan.v1" or int(result.get("projectRevision", -1)) != project_revision or int(result.get("libraryRevision", -1)) != library_revision:
		return _fail("Destination plan unavailable: stale or unsupported projection.")
	var raw_rows: Variant = result.get("rows", [])
	if not raw_rows is Array:
		return _fail("Destination plan unavailable: invalid row collection.")
	var rows: Array = raw_rows
	if int(result.get("offset", -1)) != offset or int(result.get("total", -1)) != requested.size() or rows.size() != mini(128, requested.size() - offset):
		return _fail("Destination plan unavailable: incomplete selection projection.")
	var matched: Dictionary = {}
	var targets: Dictionary = {}
	for row in rows:
		if not row is Dictionary:
			return _fail("Destination plan unavailable: invalid row.")
		var identity := str(row.get("identity", ""))
		var raw_target: Variant = row.get("targetId")
		if not (raw_target is int or raw_target is float) or raw_target != floor(float(raw_target)):
			return _fail("Destination plan unavailable: target is not an integer.")
		var target := int(row.get("targetId", -1))
		if not requested.has(identity) or matched.has(identity) or target < 1 or target > 32767 or targets.has(target) or not REASONS.has(row.get("reason")):
			return _fail("Destination plan unavailable: mismatched identity or target.")
		matched[identity] = {"targetId": target, "reason": REASONS[row.reason]}
		targets[target] = true
	return {"ok": true, "rows": matched, "projectRevision": project_revision, "libraryRevision": library_revision}


static func _fail(message: String) -> Dictionary:
	return {"ok": false, "error": message}
