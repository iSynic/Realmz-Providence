extends SceneTree

const ROUTES = preload("res://src/route_catalog.gd")
var _shell


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	_shell = load("res://src/editor_shell.tscn").instantiate()
	_shell._bridge = preload("res://tools/validate_assets_corpus.gd").CorpusBridge.new("user://maintenance-chrome-test-unused.cfg")
	root.add_child(_shell)
	await process_frame
	for viewport in [Vector2i(1920, 1080), Vector2i(1600, 900)]:
		root.size = viewport
		root.content_scale_size = viewport
		await _shell._issues.request_show()
		for route in ["assets.pictures", "assets.sounds", "assets.icons", "assets.special-land", "maps.land"]:
			await _shell._navigation.select_tab(ROUTES.tab_for_route(route))
			for frame in 8: await process_frame
			_measure(route, viewport)
			if route in ["assets.pictures", "assets.sounds", "assets.icons"]: await _check_media_controls(route)
	await _check_media_selection()
	_shell.free()
	_shell = null
	for frame in 3: await process_frame
	print("PROVIDENCE_DOCUMENT_CHROME_OK")
	quit()


func _measure(route: String, viewport: Vector2i) -> void:
	var workspace: Control = _shell.get_node("Workspace")
	var bar: Control = _shell.get_node("%CommandBarHost")
	assert(bar.global_position.y >= 0 and bar.get_global_rect().end.y <= viewport.y)
	assert(workspace.get_global_rect() == Rect2(Vector2.ZERO, Vector2(viewport)), route)
	var status: Control = _shell.get_node("Workspace/StatusBar")
	assert(status.get_global_rect().end.y <= viewport.y)
	if route in ["assets.pictures", "assets.sounds", "assets.icons"]:
		var document: Control = _shell._documents.view(route)
		var viewport_control: Control = _shell.get_node("%DocumentWorkspace/DocumentViewport")
		assert(document.size.x <= viewport_control.size.x, "%s document=%s viewport=%s" % [route, document.size, viewport_control.size])


func _check_media_selection() -> void:
	var pictures = _shell._documents.view("assets.pictures")
	await _shell._navigation.select_route("assets.pictures")
	pictures.set_document({"picture": {"identity": "picture:1", "resourceId": 30128, "label": "Test picture"}})
	assert(_shell._inspector_panel.get_node("%CurrentReferenceTarget").text.contains("PICT 30128"))
	await _shell._navigation.select_route("assets.sounds")
	assert(_shell._inspector_panel.get_node("%CurrentReferenceTarget").text == "Select a Scenario Sound")
	pictures.set_document({"picture": {"identity": "picture:2", "resourceId": 30001, "label": "Hidden refresh"}})
	assert(_shell._inspector_panel.get_node("%CurrentReferenceTarget").text == "Select a Scenario Sound")
	await _shell._navigation.select_route("assets.pictures")
	assert(_shell._inspector_panel.get_node("%CurrentReferenceTarget").text.contains("PICT 30001"))
	pictures.set_pictures({"items": []}, 0)
	assert(_shell._inspector_panel.get_node("%CurrentReferenceTarget").text == "Select a Scenario Picture")
	await _shell._navigation.select_route("assets.special-land")
	assert(_shell._inspector_panel.get_node("%CurrentReferenceTarget").text == "Select a Special Land tile")


func _check_media_controls(route: String) -> void:
	var document: Control = _shell._documents.view(route)
	var viewport_control: ScrollContainer = _shell.get_node("%DocumentWorkspace/DocumentViewport")
	viewport_control.scroll_vertical = 0
	await process_frame
	var import_button: Control = document.find_child("ImportSound" if route == "assets.sounds" else "ImportPicture", true, false)
	assert(viewport_control.get_global_rect().encloses(import_button.get_global_rect()), route + " import is outside the viewport")
	viewport_control.ensure_control_visible(document.get("_apply"))
	for frame in 3: await process_frame
	assert(viewport_control.get_global_rect().encloses(document.get("_apply").get_global_rect()), route + " apply is unreachable")
	assert(_shell.get_node("%CommandBarHost").global_position.y == 0)
	viewport_control.scroll_vertical = 0
