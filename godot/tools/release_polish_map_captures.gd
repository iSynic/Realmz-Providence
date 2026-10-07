extends RefCounted

var shell: Control
var _save: Callable
var _settle: Callable


func initialize(editor: Control, capture: Callable, settle: Callable) -> void:
	shell = editor; _save = capture; _settle = settle


func capture(viewport: Vector2i) -> void:
	await shell._navigation.open_map("land:0"); await _settle.call()
	var chrome = shell._maps.chrome; var sidebar: Control = shell._map_context_sidebar
	chrome.land_inspector.restore(); await chrome.request_tool("paint")
	await _save.call("land-paint","maps.land",viewport)
	sidebar.open_map_picker(); await _save.call("map-picker","maps.land",viewport)
	sidebar.search.text = "99999"; sidebar.search.text_changed.emit(sidebar.search.text)
	await _save.call("map-picker-empty","maps.land",viewport)
	sidebar.search.text = ""; sidebar.search.text_changed.emit(""); sidebar.get_node("%MapPicker").hide()
	chrome.land_inspector.collapse(); await _save.call("inspector-collapsed","maps.land",viewport)
	chrome.land_inspector.restore(); chrome.land_inspector.get_node("%InspectorChooser").show_popup()
	await _save.call("inspector-chooser","maps.land",viewport)
	chrome.land_inspector.get_node("%InspectorChooser").get_popup().hide()
	await chrome.request_tool("shapes"); await _save.call("paint-options","maps.land",viewport)
	shell._maps.land_authoring._options.close()
	await _smart_states(viewport)
	await shell._navigation.open_map("dungeon:0"); await _settle.call()
	await chrome.request_tool("paint")
	await _save.call("dungeon-draw","maps.dungeon",viewport)
	chrome.dungeon_inspector.collapse(); await _save.call("dungeon-collapsed","maps.dungeon",viewport)
	chrome.dungeon_inspector.restore()


func _smart_states(viewport: Vector2i) -> void:
	# Deliberate disposable fixture: reviewed stock Landlook and a bounded mixed mask.
	var opened: Dictionary = shell._bridge.request("map.open",{"identity":"land:0"})
	var runtime: Dictionary = opened.result.map.runtime.duplicate(true)
	runtime.landlook = 0; runtime.tilesetId = "classic.landlook.0"
	await _mutate("map-runtime.set",{"identity":"land:0","metadata":_integers(runtime)})
	var mask: Array = []
	for y in range(30,34):
		for x in range(30,34):
			await _mutate("map.update-cell",{"identity":"land:0","x":x,"y":y,"tile":-3112 if x==31 and y==31 else 1})
			mask.append({"x":x,"y":y})
	await shell._maps.document.load_map("land:0"); await _settle.call()
	shell._workbenches.land.select_cell(31,31)
	var canvas: Control = shell._workbenches.land.get_node("%LandMapCanvas"); canvas.zoom_working()
	var smart = shell._maps.smart_terrain
	await smart.open(); smart.view.accept_mask(mask)
	await _save.call("smart-mask","maps.land",viewport)
	await smart.review(); await _save.call("smart-reviewed","maps.land",viewport)
	if smart.view.review_is_current():
		shell._bridge.reject_smart = true; await smart.commit_selected()
		await _save.call("smart-known-failure","maps.land",viewport)
		shell._bridge.lose_smart = true; await smart.commit_selected()
		await _save.call("smart-uncertain","maps.land",viewport)
		shell._maps.chrome.land_inspector.collapse()
		await _save.call("smart-collapsed-recovery","maps.land",viewport)
		await smart.check_original(); await _settle.call(); shell._maps.chrome.land_inspector.restore()
	else: smart.discard_draft()
	await smart.open(); smart.view.get_node("%TerrainFamily").select(2)
	smart.view.accept_mask([{"x":40,"y":40}]); await smart.review()
	await _save.call("smart-unresolved","maps.land",viewport)
	smart.discard_draft()


func _mutate(method: String, params: Dictionary) -> void:
	await _settle.call(); params.expectedRevision = shell._session_view.revision
	var response: Dictionary = shell._bridge.request(method,params)
	assert(response.ok,str(response)); shell._session_view.apply(response.result)


func _integers(value: Variant) -> Variant:
	if value is float: return int(value)
	if value is Array: return value.map(_integers)
	if value is Dictionary:
		var result := {}
		for key in value: result[key] = _integers(value[key])
		return result
	return value
