extends RefCounted

var _view: ProvidencePlayerMapsEditor
var _resource: Window
var _map: Window
var _searching := false
var _pending: Dictionary = {}


func initialize(view: ProvidencePlayerMapsEditor, resource: Window, map: Window) -> void:
	_view = view; _resource = resource; _map = map
	view.get_node("%ChooseMarker").pressed.connect(func(): choose_resource("marker", view.get_node("%ChooseMarker")))
	view.get_node("%ChoosePicture").pressed.connect(func(): choose_resource("picture", view.get_node("%ChoosePicture")))
	view.get_node("%ChooseText").pressed.connect(func(): choose_resource("scrollingText", view.get_node("%ChooseText")))
	view.get_node("%ChooseTarget").pressed.connect(choose_map)
	_resource.search_requested.connect(func(query: Dictionary, generation: int): _search("resource", query, generation))
	_map.search_requested.connect(func(query: Dictionary, generation: int): _search("map", query, generation))
	_resource.preview_requested.connect(_preview)
	_resource.accepted.connect(_accept_resource)
	_resource.open_requested.connect(_open_resource)
	_map.accepted.connect(_accept_map)


func cancel() -> void:
	if _resource != null and _resource.visible: _resource.cancel()
	if _map != null and _map.visible: _map.cancel()
	_pending.clear()


func choose_resource(field: String, focus: Control) -> void:
	if not _view.can_edit() or _view.controller == null: return
	var current := int(_view.get_node("%MarkerIcon").value) if field == "marker" else int(_view.get_node("%PlayerMapPictureId").value) if field == "picture" else int(_view.get_node("%PlayerMapShow").value)
	var token := _view.draft_token()
	_resource.begin({"field": field, "currentValue": current, "label": field,
		"destination": "Player Map %d · %s" % [int(token.record.nativeId), "Marker slot %d" % (int(token.slot) + 1) if field == "marker" else field],
		"token": token, "allowNone": field == "marker", "picturePreview": field != "scrollingText", "requireAppearancePair": false}, focus)


func choose_map() -> void:
	if not _view.can_edit() or _view.controller == null: return
	_map.begin({"destination": "Player Map %d · Target map" % int(_view.current_player_map().nativeId),
		"current": _view.target_identity(), "levelType": "dungeon" if _view.get_node("%PlayerMapDungeon").button_pressed else "land",
		"description": "Use this exact source map for this Player Map draft.", "token": _view.draft_token()}, _view.get_node("%ChooseTarget"))


func _matches(context: Dictionary) -> bool:
	return not context.is_empty() and _view.can_edit() and context.get("token") == _view.draft_token()


func _search(kind: String, query: Dictionary, generation: int) -> void:
	var picker: Window = _resource if kind == "resource" else _map
	_pending = {"kind": kind, "query": query.duplicate(true), "generation": generation, "context": picker.context.duplicate(true)}
	if _searching: return
	_searching = true
	while not _pending.is_empty():
		var pending := _pending.duplicate(true); _pending.clear()
		picker = _resource if pending.kind == "resource" else _map
		if not _matches(pending.context) or not picker.visible: continue
		var params: Dictionary = {"expectedRevision": pending.context.token.revision, "query": pending.query}
		var method := "player-map.resources.list"
		if pending.kind == "map":
			method = "map.catalog"; params = pending.query.duplicate(true)
			params["currentIdentity"] = pending.context.current
			params["seekCurrent"] = int(params.offset) == 0 and str(params.query).is_empty()
		var response: Dictionary = await _view.controller.query(method, params)
		if response.get("busy", false):
			if _pending.is_empty(): _pending = pending
			await _view.get_tree().process_frame; continue
		if _matches(pending.context): picker.receive_page(response, int(pending.generation))
	_searching = false


func _preview(choice: Dictionary, generation: int) -> void:
	var context: Dictionary = _resource.context.duplicate(true)
	if not _matches(context) or not choice.get("available", false): return
	while _view.controller.is_busy():
		await _view.get_tree().process_frame
		if not _matches(context) or generation != _resource.generation: return
	var response: Dictionary = await _view.controller.query("player-map.resource.preview", {"expectedRevision": context.token.revision, "field": context.field, "value": int(choice.value)})
	if _matches(context): _resource.receive_resource(response, generation, int(choice.value))


func _accept_resource(choice: Dictionary, context: Dictionary) -> void:
	if not _matches(context) or not choice.get("available", false): return
	var value := int(choice.value)
	if context.field == "marker":
		_view.get_node("%MarkerIcon").value = value
		_view.arm_marker_paint()
		return
	if value == int(context.currentValue): return
	if context.field == "picture": _view.get_node("%PlayerMapPictureId").value = value
	elif value < 0: _view.get_node("%PlayerMapShow").value = value


func _accept_map(identity: String, context: Dictionary) -> void:
	if not _matches(context) or identity == _view.target_identity(): return
	var parts := identity.split(":")
	if parts.size() != 2 or parts[0] != context.get("levelType", "land") or not parts[1].is_valid_int(): return
	var index := int(parts[1])
	if index < 0 or identity != "%s:%d" % [parts[0], index]: return
	_view.get_node("%PlayerMapLevel").value = index


func _open_resource(choice: Dictionary, context: Dictionary) -> void:
	if not _matches(context) or not choice.get("available", false) or choice.get("targetIdentity") == null: return
	cancel()
	_view.resource_open_requested.emit(str(choice.targetIdentity), str(choice.ownership), "text" if context.field == "scrollingText" else "picture" if context.field == "picture" else "icon")
