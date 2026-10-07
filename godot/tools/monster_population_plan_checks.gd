extends RefCounted

const Plan = preload("res://src/monster_population_plan.gd")

class PlanBridge:
	extends RefCounted
	var calls: Array = []
	var defect := ""
	func request(method: String, params: Dictionary) -> Dictionary:
		calls.append({"method": method, "params": params.duplicate(true)})
		var rows: Array = [
			{"identity": "library:b", "targetId": 156, "reason": "preferred-occupied"},
			{"identity": "library:a", "targetId": 155, "reason": "next-open-slot"},
		]
		var result := {"format": "providence.monster-population-plan.v1", "projectRevision": 4, "libraryRevision": 2, "offset": 0, "total": 2, "rows": rows}
		match defect:
			"revision": result.projectRevision = 5
			"library": result.libraryRevision = 3
			"identity": rows[0].identity = "library:other"
			"duplicate": rows[0].identity = "library:a"
			"target": rows[0].targetId = 155
			"missing": rows.pop_back()
			"reason": rows[0].reason = "guessed"
			"fraction": rows[0].targetId = 155.5
			"text": rows[0].targetId = "156"
			"collection": result.rows = {}
		return {"ok": true, "result": result}


static func verify(tree: SceneTree, check: Callable) -> void:
	var bridge := PlanBridge.new()
	var plan := await Plan.load_plan(bridge, ["library:a", "library:b"], 4, 2)
	check.call(plan.ok and plan.rows["library:a"].targetId == 155, "Population plan did not map exact identities independently of row order")
	check.call(bridge.calls[0].method == "monster-library.population-plan" and bridge.calls[0].params.expectedRevision == 4 and bridge.calls[0].params.expectedLibraryRevision == 2 and bridge.calls[0].params.limit == 128, "Plan request lost bounds or revision guards")
	for defect in ["revision", "library", "identity", "duplicate", "target", "missing", "reason", "fraction", "text", "collection"]:
		bridge.defect = defect
		check.call(not (await Plan.load_plan(bridge, ["library:a", "library:b"], 4, 2)).ok, "Invalid population projection accepted: " + defect)
	var calls := bridge.calls.size()
	check.call(not (await Plan.load_plan(bridge, ["library:a"], -1, 2)).ok and bridge.calls.size() == calls, "Unknown project revision dispatched a plan")
	bridge.defect = ""
	var cancelled := await Plan.load_plan(bridge, ["library:a", "library:b"], 4, 2, func(): return true)
	check.call(cancelled.get("cancelled", false) and bridge.calls.size() == calls and not cancelled.has("rows"), "Cancelled plan dispatched work or published targets")
	cancelled = await Plan.load_plan(bridge, ["library:a", "library:b"], 4, 2, func(): return bridge.calls.size() > calls)
	check.call(cancelled.get("cancelled", false) and bridge.calls.size() == calls + 1 and not cancelled.has("rows"), "Cancellation during a request published stale targets")
	var selection := load("res://src/monster_library_selection.tscn").instantiate() as Control
	tree.root.add_child(selection)
	selection.set_items([{"identity": "library:a", "label": "Fixture A"}, {"identity": "library:b", "label": "Fixture B"}])
	selection.set_plan(plan)
	check.call(selection.get_node("SelectedRows").get_child(0).get_node("Target").text == "Monster 155\nnext open slot", "Source plan did not reach the selected-row target")
	selection.set_plan({"ok": false, "error": "Revision changed"})
	check.call(selection.get_node("SelectedRows").get_child(0).get_node("Target").text == "Destination plan unavailable", "Failed refresh retained stale destination")
	check.call(selection.get_node("Header/CopySelected").disabled, "Plan presentation enabled population")
	selection.queue_free()
	await tree.process_frame
