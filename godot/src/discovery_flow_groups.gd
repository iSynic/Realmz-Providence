extends RefCounted

var groups: Dictionary = {}
var representatives: Dictionary = {}
var visible: Dictionary = {}
var _model
var _adjacent: Dictionary = {}
var _indices: Dictionary = {}
var _low: Dictionary = {}
var _stack: Array = []
var _on_stack: Dictionary = {}
var _index := 0

func build(model) -> void:
	_model = model
	groups.clear(); representatives.clear(); visible.clear()
	_adjacent.clear(); _indices.clear(); _low.clear(); _stack.clear(); _on_stack.clear(); _index = 0
	for id in model.nodes: _adjacent[id] = []
	for edge: Dictionary in model.edges.values():
		if edge.relationship == "call": _adjacent[edge.source].append(edge.target)
	for id in model.nodes:
		if not _indices.has(id): _visit(id)
	_encounters()
	_dense_callers()
	for id in model.nodes:
		if not representatives.has(id) or model.revealed.has(id):
			representatives[id] = id
			visible[id] = model.nodes[id]
	for id in groups:
		var group: Dictionary = groups[id]
		group.shown = group.members.filter(func(member): return representatives[member] == id)
		if group.shown.is_empty(): continue
		visible[id] = group.row

func _visit(id: String) -> void:
	_indices[id] = _index; _low[id] = _index; _index += 1
	_stack.append(id); _on_stack[id] = true
	for next: String in _adjacent[id]:
		if not _indices.has(next):
			_visit(next)
			_low[id] = mini(_low[id], _low[next])
		elif _on_stack.has(next): _low[id] = mini(_low[id], _indices[next])
	if _low[id] != _indices[id]: return
	var members: Array = []
	while not _stack.is_empty():
		var member: String = _stack.pop_back()
		_on_stack.erase(member)
		members.append(member)
		if member == id: break
	if members.size() > 1 and not members.any(func(member): return _model.same_selection(_model.nodes[member].selection, _model.root)):
		_add("cycle-group", members)

func _encounters() -> void:
	for id in _model.nodes:
		var row: Dictionary = _model.nodes[id]
		if row.kind not in ["simple-encounter", "complex-encounter"] or representatives.has(id): continue
		var members: Array = [id]
		for other in _model.nodes:
			if str(_model.nodes[other].selection.identity).begins_with(str(row.selection.identity) + ":result:") and not representatives.has(other): members.append(other)
		if members.size() > 1 and not _model.same_selection(row.selection, _model.root): _add("encounter-group", members, id)

func _dense_callers() -> void:
	var layers: Dictionary = {}
	for id in _model.nodes:
		var row: Dictionary = _model.nodes[id]
		if representatives.has(id) or _model.same_selection(row.selection, _model.root): continue
		var key := "%s:%d" % [row.kind, row.depth]
		if not layers.has(key): layers[key] = []
		layers[key].append(id)
	for members: Array in layers.values():
		if members.size() >= 8: _add("caller-group", members)

func _add(kind: String, members: Array, primary := "") -> void:
	members.sort_custom(func(a, b): return str(_model.nodes[a].selection.identity).naturalnocasecmp_to(str(_model.nodes[b].selection.identity)) < 0)
	var id := "group:" + kind + ":" + str(members[0])
	var base: Dictionary = _model.nodes[primary if not primary.is_empty() else members[0]].duplicate(true)
	base.groupTitle = preload("res://src/discovery_flow_canvas.gd").caption(base) if kind == "encounter-group" else ("Call cycle" if kind == "cycle-group" else "%d loaded %s records" % [members.size(), str(base.kind).replace("extra-action-point", "XAP")])
	base.kind = kind if kind != "encounter-group" else base.kind
	if kind == "cycle-group": base.label = " ↔ ".join(members.map(func(member): return preload("res://src/discovery_flow_canvas.gd").caption(_model.nodes[member])))
	if kind == "caller-group": base.label = "Loaded members only.\nFind or choose a member to inspect."
	groups[id] = {"members":members, "shown":[], "row":base, "primary":primary}
	for member in members: representatives[member] = id

func count() -> int:
	var total := 0
	for group: Dictionary in groups.values(): total += group.shown.size()
	return total
