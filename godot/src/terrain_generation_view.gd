extends PanelContainer

signal generate_requested
signal apply_requested
signal cancel_requested
signal close_requested
signal draw_requested
signal check_routes_requested
signal recovery_requested
signal invalidated
signal comparison_changed
signal route_selected(index: int)

const FAMILIES := ["water", "forest", "mountains"]
const DENSITIES := ["sparse", "balanced", "dense"]
const SHAPES := ["rectangle", "ellipse", "freehand"]
const COMBINES := ["replace", "add", "subtract"]
var context: Dictionary = {}
var mask: Array = []
var locks: Array = []
var connections: Array = []
var _plan: Dictionary = {}
var _routes: Array = []
var _busy := false
var _recovering := false
var _loading := false


func _ready() -> void:
	%GeneratePreview.pressed.connect(generate_requested.emit)
	%ApplyGeneration.pressed.connect(apply_requested.emit)
	%CancelGeneration.pressed.connect(cancel_requested.emit)
	%CloseGeneration.pressed.connect(close_requested.emit)
	%DrawGenerationArea.pressed.connect(draw_requested.emit)
	%CheckGenerationRoutes.pressed.connect(check_routes_requested.emit)
	%RecoverGeneration.pressed.connect(recovery_requested.emit)
	%GenerationBefore.toggled.connect(func(_enabled): comparison_changed.emit())
	%GenerationRoutes.item_selected.connect(func(index): _route_summary(); route_selected.emit(index))
	%AddGenerationRoute.pressed.connect(_add_route)
	%RemoveGenerationRoute.pressed.connect(_remove_route)
	%ClearGenerationLocks.pressed.connect(func(): locks.clear(); invalidate())
	%GenerationFamily.item_selected.connect(func(_index): invalidate())
	%GenerationDensity.item_selected.connect(func(_index): invalidate())
	%GenerationSeed.value_changed.connect(func(_value): invalidate())
	%GenerationNewSeed.pressed.connect(func(): %GenerationSeed.value = Crypto.new().generate_random_bytes(4).decode_u32(0))
	%GenerationTarget.item_selected.connect(func(_index): draw_requested.emit())
	for node in [%GenerationShape, %GenerationCombine]:
		node.item_selected.connect(func(_index): draw_requested.emit())
	refresh_controls()


func open(data: Dictionary, cells: Array, saved: Dictionary) -> void:
	_loading = true
	context = data.duplicate(true)
	mask = saved.get("mask", cells).duplicate(true)
	locks = saved.get("locks", []).duplicate(true)
	connections = saved.get("connections", []).duplicate(true)
	%GenerationSeed.value = int(saved.get("seed", 47))
	%GenerationFamily.select(maxi(0, FAMILIES.find(saved.get("family", "water"))))
	%GenerationDensity.select(maxi(0, DENSITIES.find(saved.get("density", "balanced"))))
	for index in FAMILIES.size():
		var rows: Array = data.get("presets", []).filter(func(row): return row.identity == FAMILIES[index])
		var available: bool = not rows.is_empty() and rows[0].get("available", false)
		if not rows.is_empty(): %GenerationFamily.set_item_text(index, str(rows[0].get("name", FAMILIES[index].capitalize())))
		%GenerationFamily.set_item_disabled(index, not available)
		%GenerationFamily.set_item_tooltip(index, "" if available else "This family needs reviewed artwork rules.")
	if %GenerationFamily.is_item_disabled(%GenerationFamily.selected):
		for index in FAMILIES.size():
			if not %GenerationFamily.is_item_disabled(index): %GenerationFamily.select(index); break
	%GenerationDestination.text = str(data.get("name", data.get("mapIdentity", "Land map")))
	%GenerationBefore.set_pressed_no_signal(false)
	_loading = false
	_busy = false; _recovering = false
	invalidate()
	show()


func draft() -> Dictionary:
	return {"tilesetId":context.get("tilesetId", ""), "atlasBlob":context.get("atlasBlob", ""),
		"mappingRevision":int(context.get("mappingRevision", 0)), "family":FAMILIES[%GenerationFamily.selected],
		"density":DENSITIES[%GenerationDensity.selected], "seed":int(%GenerationSeed.value),
		"mask":mask.duplicate(true), "locks":locks.duplicate(true), "connections":connections.duplicate(true)}


func drawing_cells() -> Array:
	return locks if %GenerationTarget.selected == 1 else mask


func shape_options() -> Dictionary:
	return {"shape":SHAPES[%GenerationShape.selected], "combine":COMBINES[%GenerationCombine.selected],
		"filled":true, "match":"connected-exact"}


func accept_selection(cells: Array) -> void:
	if %GenerationTarget.selected == 1: locks = cells.duplicate(true)
	else: mask = cells.duplicate(true)
	invalidate()


func invalidate() -> void:
	if _loading: return
	_plan.clear(); _routes.clear()
	show_routes([])
	%GenerationStatus.text = str(context.get("unavailableReason", "")) if not context.get("available", false) else "Draw an area, then Generate." if mask.is_empty() else "Generate a fresh preview before Apply."
	refresh_controls()
	invalidated.emit()


func present(plan: Dictionary) -> void:
	_plan = plan.duplicate(true)
	show_routes(plan.get("routes", []))
	%GenerationStatus.text = ("READY · %d changed · exact joins\n" % plan.get("paintedCells", []).size() if plan.get("outcome", "") == "success" else "") + str(plan.get("reason", ""))
	refresh_controls()


func show_routes(routes: Array) -> void:
	_routes = routes.duplicate(true)
	var selected: PackedInt32Array = %GenerationRoutes.get_selected_items()
	%GenerationRoutes.clear()
	for index in connections.size():
		var pair: Dictionary = connections[index]
		var status := str(routes[index].get("status", "unchecked")) if index < routes.size() else "unchecked"
		%GenerationRoutes.add_item("A %d,%d → B %d,%d · %s" % [pair.from.x, pair.from.y, pair.to.x, pair.to.y, status.capitalize()])
		%GenerationRoutes.set_item_tooltip(index, str(routes[index].get("reason", "Generate or Check Routes.")) if index < routes.size() else "Generate or Check Routes.")
	if not connections.is_empty():
		var index := mini(selected[0], connections.size() - 1) if not selected.is_empty() else 0
		%GenerationRoutes.select(index); route_selected.emit(index)
	_route_summary()
	refresh_controls()


func _route_summary() -> void:
	var route := selected_route()
	%GenerationRouteSummary.visible = not route.is_empty()
	if route.is_empty(): return
	var pair: Dictionary = route.connection
	var status := str(route.status).capitalize()
	var text := "A %d,%d → B %d,%d · %s" % [pair.from.x, pair.from.y, pair.to.x, pair.to.y, status]
	if route.status != "connected":
		var problems: Array = route.get("problematicCells", [])
		if not problems.is_empty(): text += "\nInspect %d,%d. " % [problems[0].x, problems[0].y]
		else: text += "\n"
		text += str(route.get("reason", "")) + " Adjust endpoints or repair passage, then check again."
	%GenerationRouteSummary.text = text


func selected_route() -> Dictionary:
	var indices: PackedInt32Array = %GenerationRoutes.get_selected_items()
	return _routes[indices[0]] if not indices.is_empty() and indices[0] < _routes.size() else {}


func display_plan() -> Dictionary:
	if %GenerationBefore.button_pressed: return {"protectedCells":locks, "originalMask":mask, "generationPreview":true}
	var result := _plan.duplicate(true)
	result.protectedCells = _plan.get("protectedCells", locks)
	result.originalMask = mask
	result.generationPreview = true
	return result


func showing_before() -> bool:
	return %GenerationBefore.button_pressed


func can_apply() -> bool:
	return not _busy and not _recovering and _plan.get("canApply", false)


func review_hash() -> String:
	return str(_plan.get("reviewHash", ""))


func set_busy(busy: bool, recovering := false) -> void:
	_busy = busy; _recovering = recovering
	refresh_controls()


func show_failure(message: String) -> void:
	%GenerationStatus.text = message
	refresh_controls()


func refresh_controls() -> void:
	if not is_node_ready(): return
	var disabled := _busy or _recovering
	for node in [%GenerationFamily, %GenerationDensity, %GenerationNewSeed, %GenerationTarget,
		%GenerationShape, %GenerationCombine, %DrawGenerationArea, %ClearGenerationLocks,
		%AddGenerationRoute, %RemoveGenerationRoute, %CheckGenerationRoutes]: node.disabled = disabled
	for node in [%GenerationSeed, %RouteFromX, %RouteFromY, %RouteToX, %RouteToY]: node.editable = not disabled
	%GeneratePreview.disabled = disabled or not context.get("available", false) or mask.is_empty()
	%ApplyGeneration.disabled = not can_apply()
	%GenerationBefore.disabled = disabled or _plan.is_empty()
	%CancelGeneration.disabled = _recovering
	%CloseGeneration.disabled = _recovering
	%CancelGeneration.text = "Stop" if _busy else "Cancel"
	%RecoverGeneration.visible = _recovering
	%RecoverGeneration.disabled = _busy
	%AddGenerationRoute.disabled = disabled or connections.size() >= 32
	%CheckGenerationRoutes.disabled = disabled or connections.is_empty()
	%RemoveGenerationRoute.disabled = disabled or %GenerationRoutes.get_selected_items().is_empty()
	%GenerationSelectionCount.text = "%d selected · %d protected" % [mask.size(), _plan.get("protectedCells", locks).size()]


func _add_route() -> void:
	if _busy or _recovering or connections.size() >= 32: return
	connections.append({"from":{"x":int(%RouteFromX.value),"y":int(%RouteFromY.value)},
		"to":{"x":int(%RouteToX.value),"y":int(%RouteToY.value)}})
	invalidate()


func _remove_route() -> void:
	var selected: PackedInt32Array = %GenerationRoutes.get_selected_items()
	if _busy or _recovering or selected.is_empty(): return
	connections.remove_at(selected[0]); invalidate()
