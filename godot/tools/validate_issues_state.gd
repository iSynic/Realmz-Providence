extends SceneTree

const IssuesState = preload("res://src/issues_state.gd")
var _failed := false

class FixtureBridge:
	extends RefCounted
	var revision := 18
	var rows: Array = []
	var calls: Array = []
	var fail := false
	var malformed := false

	func _init() -> void:
		for index in 512:
			rows.append({"code": "reference.message.missing" if index < 501 else ("reference.picture.missing" if index < 509 else "battle.empty"),
				"entity": "extra-action-point:%d" % index, "field": "actions[4].target",
				"message": "Message %d is missing." % (900 + index), "severity": "error" if index < 509 else "warning"})

	func request(method: String, params: Dictionary) -> Dictionary:
		calls.append({"method": method, "params": params.duplicate(true)})
		if fail or method != "validation.list":
			return {"ok": false, "error": "Controlled disconnection"}
		var counts := {"errors": 0, "warnings": 0, "information": 0}
		var facets: Array = []
		for id in IssuesState.CATEGORY_IDS:
			facets.append({"id": id, "label": id, "total": 0, "errors": 0, "warnings": 0, "information": 0})
		var matching: Array = []
		var before_group := 0
		for row: Dictionary in rows:
			var severity_key: String = {"error": "errors", "warning": "warnings", "information": "information"}[row.severity]
			counts[severity_key] += 1
			if params.get("severity", "") not in ["", row.severity]:
				continue
			var query: String = params.query.to_lower()
			if not query.is_empty() and not (row.code + row.message + str(row.entity) + str(row.field)).to_lower().contains(query):
				continue
			before_group += 1
			var facet_index := 0
			if row.code == "reference.picture.missing":
				facet_index = 1
			elif row.code.begins_with("extra-code.") or row.code.begins_with("action-settings."):
				facet_index = 2
			elif not row.code.begins_with("reference."):
				facet_index = 3
			facets[facet_index].total += 1
			facets[facet_index][severity_key] += 1
			if params.category in ["", facets[facet_index].id] and params.code in ["", row.code]:
				matching.append(row)
		var selected: Variant = null
		for index in matching.size():
			if params.has("selection") and params.selection == IssuesState.selection_key(matching[index]):
				selected = index
		var offset: int = params.offset
		if params.locateSelection and selected != null:
			offset = int(selected) / int(params.limit) * int(params.limit)
		if offset >= matching.size():
			offset = maxi(0, matching.size() - 1) / int(params.limit) * int(params.limit)
		var result := {"revision": revision, "offset": offset, "limit": params.limit,
			"total": matching.size(), "items": matching.slice(offset, offset + int(params.limit)),
			"unfilteredTotal": rows.size(), "matchedBeforeGroup": before_group,
			"unfilteredCounts": counts, "categories": facets, "selectionIndex": selected}
		if malformed:
			result.items.append({"message": "Invalid row"})
		return {"ok": true, "result": result}


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var bridge := FixtureBridge.new()
	var state := IssuesState.new()
	var phases: Array = []
	var record_phase := func(): phases.append(state.status)
	state.changed.connect(record_phase)
	state.attach(bridge)
	_check(state.refresh(18) and state.page.total==512, "All groups omitted findings")
	_check(state.open_category("links"), "Links filter failed")
	_check(state.page.items.size() == 8 and state.page.total == 501 and state.page.unfilteredTotal == 512, "Loaded page replaced global counts")
	_check(state.page.unfilteredCounts == {"errors": 509, "warnings": 3, "information": 0}, "Scenario severity counts changed")
	_check(state.page_count() == 63 and state.page_number() == 1, "Page denominator is wrong")
	_check(not state.go_to_page(0) and not state.go_to_page(64), "Invalid page was accepted")
	_check(state.go_to_page(63), "Direct last page failed")
	state.select_row(3)
	_check(state.selected_finding().entity == "extra-action-point:499", "Tail selection failed")
	_check(state.set_capacity(11), "Resize failed")
	_check(state.selected_finding().entity == "extra-action-point:499" and state.page.offset == 495, "Resize did not relocate selection")
	bridge.rows.remove_at(499)
	bridge.revision = 19
	_check(state.refresh(19), "Repair refresh failed")
	_check(state.selected_finding().entity == "extra-action-point:500", "Removed finding did not select its next visible neighbor")
	_check(state.page.total == 500 and state.page.unfilteredCounts.errors == 508, "Repair retained stale counts")
	_check(state.open_category("resources") and state.page.items.size() == 8, "Category could not open")
	_check(state.open_category("links") and state.page.offset == 495, "Accordion lost the previous page")
	_check(state.toggle_category("links") and not state.expanded, "Single accordion collapse failed")
	_check(state.toggle_category("links") and state.expanded, "Accordion reopening failed")
	_check(state.set_filters(" Message 1400 ", "error"), "Global search failed")
	_check(state.page.total == 1 and state.selected_finding().entity == "extra-action-point:500", "Search was limited to loaded rows")
	_check(state.page.unfilteredCounts.errors == 508, "Filters changed the scenario summary")
	_check(state.open_category("action-settings") and state.status == "category-empty", "Empty category claimed the scenario was clean")
	_check(state.set_filters("no match") and state.status == "no-matches", "No matches state is wrong")
	_check(state.clear_filters() and state.category.is_empty() and state.page.total==511 and not state.filters_active(), "Clear filters did not reset context")
	bridge.fail = true
	_check(not state.refresh() and state.status == "failed" and state.selected_finding().is_empty() and state.page.is_empty(), "Failure borrowed a stale selected finding")
	bridge.fail = false
	_check(state.refresh(), "Retry did not recover")
	bridge.revision = 18
	_check(not state.refresh() and state.page.is_empty(), "Older revision was accepted after repair")
	bridge.revision = 20
	bridge.malformed = true
	_check(not state.refresh() and state.page.is_empty(), "Malformed page was accepted")
	bridge.malformed = false
	bridge.rows.clear()
	_check(state.refresh() and state.status == "clean" and state.selected_finding().is_empty(), "Clean state borrowed a previous target")
	state.attach(null)
	_check(not state.refresh() and state.status == "no-project" and state.query.is_empty(), "Closing project retained its context")
	_check(phases.has("checking") and phases.has("failed") and phases.has("ready"), "Loading and recovery states were not emitted")
	for call: Dictionary in bridge.calls:
		_check(call.method == "validation.list" and call.params.limit <= 128, "Routine query was not bounded and read-only")
	state.changed.disconnect(record_phase)
	if not _failed:
		print("PROVIDENCE_ISSUES_STATE_OK global=512 pages=63 repair=refreshed selection=retained stale=rejected")
	quit(1 if _failed else 0)


func _check(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error("PROVIDENCE_ISSUES_STATE_FAILED: " + message)
