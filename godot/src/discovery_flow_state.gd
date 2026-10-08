extends RefCounted

# Expansion ownership is presentation state. Shared records survive collapsing a branch.
var root: Dictionary = {}
var nodes: Dictionary = {}
var edges: Dictionary = {}
var groups: Dictionary = {}
var positions: Dictionary = {}
var manual_positions: Dictionary = {}
var group_positions: Dictionary = {}
var nodes_locked := true
var selected := ""
var edge := ""
var source_edge := ""
var occurrence_filter: Array = []
var step := -1
var steps_expanded := false
var inspector_tab := "steps"
var categories: Array = ["calls", "checks", "changes", "uses", "eligibility"]
var depth := 2
var direction := "both"
var summaries: Dictionary = {}
var revealed: Dictionary = {}
var viewport := {"zoom":1.0, "scroll":Vector2.ZERO}
var limited := false

func reset(selection: Dictionary) -> void:
	root = selection.duplicate(true)
	nodes.clear()
	edges.clear()
	groups.clear()
	positions.clear()
	manual_positions.clear()
	group_positions.clear()
	nodes_locked = true
	selected = ""
	edge = ""
	source_edge = ""
	occurrence_filter.clear()
	step = -1
	steps_expanded = false
	inspector_tab = "steps"
	summaries.clear()
	revealed.clear()
	limited = false
	viewport = {"zoom":1.0, "scroll":Vector2.ZERO}

func merge_page(page: Dictionary, group: String, origin := "", direction := "both") -> void:
	if not groups.has(group): groups[group] = {"nodes":{}, "edges":{}, "origin":origin, "frontiers":[], "limited":false}
	var owner: Dictionary = groups[group]
	var origin_depth := int(nodes.get(origin, {}).get("depth", 0))
	for row: Dictionary in page.nodes:
		if not nodes.has(row.id):
			if nodes.size() >= 200:
				limited = true
				owner.limited = true
				continue
			row = row.duplicate(true)
			row.depth = origin_depth + int(row.depth)
			nodes[row.id] = row
		owner.nodes[row.id] = true
	for row: Dictionary in page.edges:
		if not nodes.has(row.source) or not nodes.has(row.target): continue
		if not edges.has(row.id) and edges.size() >= 600:
			limited = true
			owner.limited = true
			continue
		edges[row.id] = row.duplicate(true)
		owner.edges[row.id] = true
	owner.frontiers = page.get("frontiers", []).duplicate(true)
	owner.direction = direction
	owner.limited = owner.limited or page.get("limitReached", false)
	limited = limited or page.get("limitReached", false)
	if selected.is_empty():
		for id in nodes:
			if same_selection(nodes[id].selection, root): selected = id
	place_new_nodes()

func place_new_nodes() -> void:
	var ordered := nodes.keys()
	ordered.sort_custom(_record_order)
	for id in ordered:
		if positions.has(id): continue
		var layer := int(nodes[id].depth)
		var count := 0
		for placed in positions:
			if nodes.has(placed) and int(nodes[placed].depth) == layer: count += 1
		positions[id] = Vector2(layer * 268, count * 180)

func _record_order(a: String, b: String) -> bool:
	var left: Dictionary = nodes[a]
	var right: Dictionary = nodes[b]
	if left.kind != right.kind: return str(left.kind) < str(right.kind)
	if str(left.nativeId).is_valid_int() and str(right.nativeId).is_valid_int() and int(left.nativeId) != int(right.nativeId):
		return int(left.nativeId) < int(right.nativeId)
	return str(left.selection.identity).naturalnocasecmp_to(str(right.selection.identity)) < 0

func collapse(origin: String) -> void:
	for key in groups.keys():
		if key != "initial" and groups[key].origin == origin: groups.erase(key)
	# Only expansions connected to the initial view retain ownership. A child
	# must not keep its vanished parent alive through its own root record.
	var live := {"initial":true}
	var kept_nodes: Dictionary = groups.get("initial", {}).get("nodes", {}).duplicate()
	var kept_edges: Dictionary = groups.get("initial", {}).get("edges", {}).duplicate()
	var changed := true
	while changed:
		changed = false
		for key in groups:
			if not live.has(key) and kept_nodes.has(groups[key].origin):
				live[key] = true
				kept_nodes.merge(groups[key].nodes)
				kept_edges.merge(groups[key].edges)
				changed = true
	for key in groups.keys():
		if not live.has(key): groups.erase(key)
	for id in nodes.keys():
		if not kept_nodes.has(id): nodes.erase(id)
	for id in edges.keys():
		if not kept_edges.has(id): edges.erase(id)
	if not nodes.has(selected): selected = nodes.keys()[0] if not nodes.is_empty() else ""
	if not edges.has(edge): edge = ""
	limited = groups.values().any(func(owner): return owner.get("limited", false))

func can_collapse(id: String) -> bool:
	for key in groups:
		if key != "initial" and groups[key].origin == id: return true
	return false

func related() -> Array:
	var result: Array = []
	for row: Dictionary in edges.values():
		if row.source == selected or row.target == selected: result.append(row)
	result.sort_custom(func(a, b): return str(a.id) < str(b.id))
	return result

func snapshot() -> Dictionary:
	return {"root":root.duplicate(true), "nodes":nodes.duplicate(true), "edges":edges.duplicate(true),
		"groups":groups.duplicate(true), "positions":positions.duplicate(), "selected":selected,
		"manual_positions":manual_positions.duplicate(), "group_positions":group_positions.duplicate(), "nodes_locked":nodes_locked,
		"edge":edge, "step":step, "steps_expanded":steps_expanded, "inspector_tab":inspector_tab, "categories":categories.duplicate(),
		"source_edge":source_edge, "occurrence_filter":occurrence_filter.duplicate(),
		"depth":depth, "direction":direction, "summaries":summaries.duplicate(true), "revealed":revealed.duplicate(),
		"viewport":viewport.duplicate(), "limited":limited}

func source_reference() -> Dictionary:
	if edges.has(edge): return _occurrence_source(edge)
	var summary: Dictionary = summaries.get(selected, {})
	for row: Dictionary in summary.get("steps", []):
		if int(row.slot) == step:
			return {"source":row.source, "field":row.field, "slot":row.slot, "callerContext":row.get("callerContext"), "flowSelection":nodes[selected].selection.duplicate(true)}
	if edges.has(source_edge): return _occurrence_source(source_edge)
	return {}

func _occurrence_source(id: String) -> Dictionary:
	var occurrence: Dictionary = edges[id]
	var reference: Dictionary = occurrence.reference.duplicate(true)
	var owner := owning_node(occurrence)
	if nodes.has(owner): reference.flowSelection = nodes[owner].selection.duplicate(true)
	return reference

func owning_node(occurrence: Dictionary) -> String:
	return occurrence.target if occurrence.relationship == "state-check" else occurrence.source

func selected_step_edges() -> Array:
	return edges.values().filter(func(occurrence): return owning_node(occurrence) == selected and preload("res://src/source_navigation.gd").action_slot(occurrence.reference.field) == step)

func restore(value: Dictionary) -> void:
	for key in value: set(key, value[key].duplicate(true) if value[key] is Dictionary or value[key] is Array else value[key])

static func same_selection(a: Dictionary, b: Dictionary) -> bool:
	for key in ["identity", "scope", "entryPosition", "throughPosition", "callerContext"]:
		if a.get(key, "scenario" if key == "scope" else null) != b.get(key, "scenario" if key == "scope" else null): return false
	return true
