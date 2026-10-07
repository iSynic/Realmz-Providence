extends RefCounted

const SCRIPT_TARGET_ROUTES := {
	"message": "text.messages", "sound": "assets.sounds",
	"simple-encounter": "encounters.simple", "extra-action-point": "scripts.macros",
	"same-map-action-point": "scripts.action-points", "complex-encounter": "encounters.complex",
	"new-action-point": "scripts.action-points",
	"rogue-encounter": "encounters.rogue", "timed-encounter": "encounters.timed",
	"battle": "combat.battles", "treasure": "economy.treasure", "shop": "economy.shops",
	"item": "economy.items", "picture": "assets.pictures", "monster": "combat.monsters",
	"monster-appearance": "assets.icons",
	"player-map": "player-maps.map-records", "spell": "rules.spells", "race": "rules.races", "caste": "rules.castes",
	"text-resource": "text.text-resources", "quest": "scripts.quests",
	"option-label": "text.messages",
	"monster-library-entry": "combat.monsters",
}

signal status_changed(message: String)
signal layout_requested(tab: int)
signal history_changed(can_back: bool, can_forward: bool)
signal navigation_canceled
signal source_navigation_failed(message: String)

var active_domain := "maps"
var special_land_world_context := false
var _tabs: TabContainer
var _registry
var _operations: ProvidenceEditorOperation
var _explorer
var _layout
var _map: ProvidenceMapDocumentController
var _scripts
var _map_lifecycle
var _assets
var _media
var _issues
var _workbenches: WeakRef
var _strings: WeakRef
var _has_draft: Callable
var _guard: Callable
var _back: Array[Dictionary] = []
var _forward: Array[Dictionary] = []
var _restoring := false


func initialize(tabs: TabContainer, registry, operations: ProvidenceEditorOperation, explorer, layout) -> void:
	_tabs = tabs
	_registry = registry
	_operations = operations
	_explorer = explorer
	_layout = layout
	_explorer.domain_selected.connect(activate_domain)
	_explorer.route_requested.connect(route_requested)
	_explorer.map_requested.connect(open_map)
	_explorer.special_land_requested.connect(open_special_land.bind(true))


func configure_authoring(map: ProvidenceMapDocumentController, scripts, map_lifecycle, assets, media, issues, workbenches, strings, has_draft: Callable, guard: Callable) -> void:
	_map = map
	_scripts = scripts
	_map_lifecycle = map_lifecycle
	_assets = assets
	_media = media
	_issues = issues
	_workbenches = weakref(workbenches)
	_strings = weakref(strings)
	_has_draft = has_draft
	_guard = guard
	var guard_owner = guard.get_object()
	if guard_owner != null and guard_owner.has_signal("navigation_canceled"):
		guard_owner.navigation_canceled.connect(func(): navigation_canceled.emit())


func activate_domain(domain: String, navigate_to_default := true) -> void:
	if not ProvidenceRouteCatalog.ROUTES.has(domain): return
	_explorer.configure_domain(domain)
	active_domain = domain
	sync_selection()
	_layout.set_domain(domain)
	layout_requested.emit(_tabs.current_tab if domain == "combat" else -1)
	if not navigate_to_default: return
	if domain == "assets":
		await _guard.call(_assets.open_library.bind("scenario"), "opening Scenario Assets")
		return
	var tabs := ProvidenceRouteCatalog.tabs_for_domain(domain)
	if not tabs.is_empty() and _tabs.current_tab not in tabs: await select_tab(tabs[0])


func route_requested(identity: String, action: String, label: String) -> void:
	if action in ["asset-scenario", "asset-stock"]:
		await _guard.call(_assets.open_library.bind("scenario" if action == "asset-scenario" else "stock"), "opening Assets")
		return
	var tab: int = _registry.tab_for_route(identity)
	if tab < 0:
		status_changed.emit("%s is retained in the Providence route map; its native workbench is not migrated yet." % label.substr(4))
		return
	var destination := identity
	if identity in ["maps.special-land", "assets.special-land"]:
		destination = "assets.special-land" if action == "special-land-media" else "maps.special-land"
	await select_route(destination)
	if _tabs.current_tab != tab: return
	if action == "first-land-map": await open_first_map("land")
	elif action == "first-dungeon-map": await open_first_map("dungeon")


func select_route(identity: String) -> void:
	if _operations.busy: return
	var tab: int = _registry.tab_for_route(identity)
	if tab < 0: return
	var special_route := identity in ["maps.special-land", "assets.special-land"]
	var context_changed := special_route and special_land_world_context != (identity == "maps.special-land")
	_issues.guard.prepare_pending_input()
	if (_tabs.current_tab != tab or context_changed) and _has_draft.call():
		await _guard.call(select_route.bind(identity), "opening " + _tabs.get_tab_title(tab))
		return
	var origin := _capture_location()
	var prior_tab := _tabs.current_tab
	if special_route: special_land_world_context = identity == "maps.special-land"
	await select_tab(tab)
	if prior_tab == _tabs.current_tab and context_changed:
		_tabs.tab_changed.emit(_tabs.current_tab)
		await _wait_for_document(tab)
		if not _restoring:
			_back.push_back(origin); _forward.clear(); _emit_history()


func request_authoring_navigation(action: Callable, destination: String) -> void:
	await _guard.call(action, destination)


func open_script_sound(native_id: int) -> void:
	await select_route("assets.sounds")
	if _registry.identity_for_tab(_tabs.current_tab) == "assets.sounds":
		await _media.sounds.open_media("sound:%d" % native_id)


func preview_script_sound(native_id: int, identity: String = "", status: String = "") -> void:
	var played := false
	if status == "application-resource":
		played = await _media.sounds.preview_application_and_play(identity)
	else:
		played = await _media.sounds.preview_and_play(identity if not identity.is_empty() else "sound:%d" % native_id)
	if not played: status_changed.emit("Sound %d has no playable preview." % native_id)


func open_script_target(kind: String, native_id: int, identity: String, context: Dictionary) -> bool:
	if str(context.get("targetStatus", "")) == "application-resource":
		return await _open_application_target(kind, native_id, identity, context)
	if kind == "map-tile" and str(context.get("targetStatus", "")) == "compatibility-resource":
		await _open_scenario_asset_target(identity, context)
		return false
	var route := _script_target_route(kind, context)
	if route.is_empty():
		status_changed.emit("No exact native authoring route is available for %s %d." % [kind.replace("-", " "), native_id])
		return false
	if _has_draft.call():
		await _guard.call(open_script_target.bind(kind, native_id, identity, context), "opening the referenced record")
		return false
	var origin := _capture_location()
	var prior_back_count := _back.size()
	var prior_back := _back.duplicate(true)
	var prior_forward := _forward.duplicate(true)
	var epoch := session_epoch()
	await select_route(route)
	if _registry.identity_for_tab(_tabs.current_tab) != route: return false
	var response := await _open_routed_script_target(kind, native_id, identity, context, route)
	if not bool(response.get("ok", false)):
		await _restore_failed_target(origin, prior_back, prior_forward, epoch)
		status_changed.emit(str(response.get("error", "The referenced record could not be opened.")))
	else:
		_record_same_route_origin(origin, prior_back_count)
		if kind == "quest" and current_view().has_method("highlight_origin"):
			if context.has("originReference"):
				current_view().highlight_reference(context.originReference)
				return true
			var state: Dictionary = origin.get("state", {})
			var slot := int(state.get("slot", -1))
			if state.get("step") is Dictionary: slot = int(state.step.get("selectedSlot", slot))
			elif state.has("result"): slot = int(state.result) * 8 + int(state.get("step", 0))
			current_view().highlight_origin(str(state.get("identity", "")), slot)
	return bool(response.get("ok", false))


func open_discovery_catalog(identity: String, scope: String, kind: String) -> void:
	if _has_draft.call():
		await _guard.call(open_discovery_catalog.bind(identity, scope, kind), "opening the linked catalog record")
		return
	var origin := _capture_location()
	if kind == "reference-string":
		await select_route("text.text-resources")
		await _workbenches.get_ref().open_reference_string(identity)
	else:
		await _assets.open_catalog_asset(identity, scope)
	_back.append(origin)
	_forward.clear()
	_emit_history()


func _open_application_target(kind: String, native_id: int, identity: String, context: Dictionary) -> bool:
	if kind not in ["sound", "picture", "monster-appearance", "map-tile", "text-resource"] or identity.is_empty():
		status_changed.emit("No exact Stock Assets route is available for %s %d." % [kind.replace("-", " "), native_id])
		return false
	if _has_draft.call():
		await _guard.call(open_script_target.bind(kind, native_id, identity, context), "opening the referenced stock sound")
		return false
	var origin := _capture_location()
	var response: Dictionary = await _assets.open_stock_asset(identity)
	if not bool(response.get("ok", false)):
		status_changed.emit(str(response.get("error", "The referenced stock sound could not be opened.")))
		return false
	_back.append(origin)
	_forward.clear()
	_emit_history()

	return true

func _open_scenario_asset_target(identity: String, context: Dictionary) -> void:
	if identity.is_empty():
		status_changed.emit("No exact Scenario Assets route is available for this map tile.")
		return
	if _has_draft.call():
		await _guard.call(open_script_target.bind("map-tile", 0, identity, context), "opening the referenced scenario artwork")
		return
	var origin := _capture_location()
	var response: Dictionary = await _assets.open_scenario_asset(identity)
	if not bool(response.get("ok", false)):
		status_changed.emit(str(response.get("error", "The referenced scenario artwork could not be opened.")))
		return
	_back.append(origin)
	_forward.clear()
	_emit_history()


func _script_target_route(kind: String, context: Dictionary) -> String:
	if kind in ["map", "map-tile", "random-rectangle"]:
		return "maps.land" if str(context.get("levelType", "land")) == "land" else "maps.dungeon"
	return str(SCRIPT_TARGET_ROUTES.get(kind, ""))


func _open_routed_script_target(kind: String, native_id: int, identity: String, context: Dictionary, route: String) -> Dictionary:
	var response: Dictionary = {"ok": false, "error": "The target editor cannot open this reference."}
	var view: Control = _registry.view(route)
	var workbenches = _workbenches.get_ref()
	match kind:
		"message", "option-label":
			response = await _open_string_target(kind, native_id)
		"sound":
			response = await _media.sounds.open_media(identity if not identity.is_empty() else "sound:%d" % absi(native_id))
		"simple-encounter":
			response = {"ok": await _scripts.open_source("simple-encounter", identity)}
		"extra-action-point":
			response = {"ok": await _scripts.open_source("extra-action-point", identity)}
		"same-map-action-point":
			response = {"ok": await _scripts.open_source("action-point", identity)}
		"new-action-point":
			response = {"ok":await _scripts.prepare_action_point_creation(str(context.mapIdentity),int(context.x),int(context.y))}
		"complex-encounter":
			response = await _open_complex_result(view, identity, context)
		"rogue-encounter", "timed-encounter", "battle":
			response = await view.open_native_id(absi(native_id))
		"treasure":
			if workbenches != null: response = await workbenches.treasure_commands.open_native_id(absi(native_id))
		"shop":
			if workbenches != null: response = await workbenches.shop_commands.open_native_id(absi(native_id))
		"item":
			response = {"ok": await view.open_item(identity), "error": "The referenced item is not available in this project."}
		"picture":
			response = await _media.pictures.open_media(identity if not identity.is_empty() else "picture:%d" % absi(native_id))
		"monster-appearance":
			response = await _media.icons.open_media(identity)
		"monster":
			response = await _open_monster_target(view, identity, native_id)
		"monster-library-entry":
			response = await view.open_library_target(identity)
		"map":
			var map_identity := identity if not identity.is_empty() else _map_identity_for(native_id, str(context.get("levelType", "land")))
			response = {"ok": await open_map(map_identity)}
		"map-tile":
			var destination_identity := str(context.get("mapIdentity", ""))
			response = {"ok": await open_map(destination_identity)}
		"random-rectangle":
			response = await _open_rectangle(identity)
		"player-map":
			if workbenches != null: response = await workbenches.player_map_commands.open_record(identity)
		"spell":
			response = await view.open_classic_id(absi(native_id))
		"race", "caste":
			response = await view.open_identity(identity)
		"text-resource":
			if workbenches != null:
				var group_identity := identity
				if not group_identity.begins_with("reference-string:asset:"):
					group_identity = "reference-string:asset:%s" % group_identity
				response = await workbenches.open_reference_string(group_identity)
		"quest":
			if workbenches != null: response = await workbenches.open_quest(absi(native_id))
	return response


func _open_rectangle(identity: String) -> Dictionary:
	var response := await _map.read_rectangle(identity)
	if not response.get("ok", false): return response
	if not await open_map(str(response.result.map.identity)): return {"ok":false,"error":"The rectangle's map could not be opened."}
	var rectangle: Dictionary = response.result.randomRectangle
	_map.reveal_region(str(rectangle.identity).get_slice(":rect:", 1).to_int())
	return response


func _record_same_route_origin(origin: Dictionary, prior_back_count: int) -> void:
	if origin.is_empty() or _back.size() != prior_back_count: return
	var current := _capture_location()
	if current.is_empty() or current == origin: return
	_back.push_back(origin)
	_forward.clear()
	_emit_history()


func _open_monster_target(view: Control, identity: String, native_id: int) -> Dictionary:
	var set_id := 0
	var parts := identity.split(":")
	if parts.size() >= 3: set_id = int(parts[1])
	return await view.open_monster_target(set_id, absi(native_id))


func _map_identity_for(native_index: int, level_type: String) -> String:
	for map: Dictionary in _map.maps:
		if int(map.get("nativeIndex", -1)) == absi(native_index) and str(map.get("levelType", "land")) == level_type:
			return str(map.get("identity", ""))
	return ""


func open_script_source(reference: Dictionary) -> void:
	if _operations.busy: return
	if _has_draft.call():
		await _guard.call(open_script_source.bind(reference.duplicate(true)), "opening the exact calling field")
		return
	var epoch := session_epoch()
	if not await preload("res://src/source_navigation.gd").open(self, reference) and session_epoch() == epoch:
		source_navigation_failed.emit("The caller could not be opened. Its link and your origin are kept.")

func _restore_failed_target(origin: Dictionary, prior_back: Array, prior_forward: Array, epoch: int) -> void:
	if epoch != session_epoch(): return
	_restoring = true
	var restored := await _restore_location(origin)
	_restoring = false
	if epoch != session_epoch(): return
	_back.assign(prior_back)
	_forward.assign(prior_forward)
	_emit_history()
	if not restored: status_changed.emit("The target read failed; the original document could not be refreshed. Your history is kept.")


func current_view() -> Control:
	return _tabs.get_current_tab_control()


func _identity_last_integer(identity: String) -> int:
	for index in range(identity.get_slice_count(":") - 1, -1, -1):
		var part := identity.get_slice(":", index)
		if part.is_valid_int(): return int(part)
	var tail := identity.get_slice(".", identity.get_slice_count(".") - 1)
	return int(tail) if tail.is_valid_int() else -1


func select_tab(index: int) -> void:
	if _operations.busy or index < 0 or index >= _tabs.get_tab_count(): return
	if _registry.identity_for_tab(index) == "linter.issues":
		_issues.request_show()
		return
	_issues.guard.prepare_pending_input()
	if _tabs.current_tab != index and _has_draft.call():
		activate_domain(ProvidenceRouteCatalog.domain_for_tab(_tabs.current_tab, active_domain), false)
		sync_selection()
		await _guard.call(select_tab.bind(index), "opening " + _tabs.get_tab_title(index))
		return
	var origin := _capture_location()
	preload("res://src/readonly_editor_registry.gd").select_tab(_tabs, index)
	sync_selection()
	# Connection startup can precede a transport lease (standalone Library).
	# Wait for the document refresh itself before opening a linked record.
	await _wait_for_document(index)
	if not _restoring and not origin.is_empty() and int(origin.get("tab", -1)) != _tabs.current_tab:
		_back.push_back(origin)
		_forward.clear()
		_emit_history()


func _wait_for_document(index: int) -> void:
	var controller = _registry.controller(_registry.identity_for_tab(index))
	while _tabs.is_inside_tree() and (_operations.busy or (controller != null and controller.refresh_in_progress())):
		await _tabs.get_tree().process_frame


func can_go_back() -> bool:
	return not _back.is_empty()


func can_go_forward() -> bool:
	return not _forward.is_empty()


func clear_history() -> void:
	_back.clear()
	_forward.clear()
	_emit_history()


func navigate_back() -> void:
	await _navigate_history(_back, _forward, "Back")


func navigate_forward() -> void:
	await _navigate_history(_forward, _back, "Forward")


func _navigate_history(source: Array[Dictionary], destination: Array[Dictionary], label: String) -> void:
	if _operations.busy or source.is_empty(): return
	if _has_draft.call():
		await _guard.call(_navigate_history.bind(source, destination, label), "returning with " + label)
		return
	var current: Dictionary = _capture_location()
	var target: Dictionary = source.pop_back()
	_restoring = true
	var restored: bool = await _restore_location(target)
	_restoring = false
	if restored:
		if not current.is_empty(): destination.push_back(current)
		status_changed.emit("%s to %s" % [label, target.get("route", "document")])
	else:
		source.push_back(target)
	_emit_history()


func _capture_location() -> Dictionary:
	if _tabs == null or _tabs.current_tab < 0: return {}
	var route := str(_registry.identity_for_tab(_tabs.current_tab))
	var view: Control = _registry.view(route)
	if view == null: view = _tabs.get_current_tab_control()
	var state: Dictionary = {}
	if view != null:
		if view.has_method("read_navigation_state"): state = view.read_navigation_state()
		elif view.has_method("read_state"):
			var candidate: Variant = view.read_state()
			if candidate is Dictionary: state = candidate
	return {"tab": _tabs.current_tab, "route": route, "domain": active_domain, "state": state.duplicate(true)}


func _restore_location(location: Dictionary) -> bool:
	var tab := int(location.get("tab", -1))
	var route := str(location.get("route", ""))
	activate_domain(str(location.get("domain", active_domain)), false)
	if route in ["maps.special-land", "assets.special-land"]:
		await select_route("maps.special-land" if location.get("state", {}).get("worldContext", false) else "assets.special-land")
	else: await select_tab(tab)
	if _tabs.current_tab != tab: return false
	var state := location.get("state", {}) as Dictionary
	if route in ["maps.land","maps.dungeon"] and not str(state.get("identity","")).is_empty():
		return await _map.restore_location(state)
	if route in ["scripts.action-points", "scripts.macros", "encounters.simple", "encounters.complex"]:
		return await _scripts.restore_location(route, state)
	if route in ["assets.pictures", "assets.sounds", "assets.icons"] and not str(state.get("identity", "")).is_empty():
		return await _assets.restore_location(route, state)
	if route == "text.text-resources":
		var workbenches = _workbenches.get_ref()
		return workbenches != null and await workbenches.restore_reference_location(state)
	var view: Control = _registry.view(route)
	if view == null: view = _tabs.get_current_tab_control()
	if view != null and view.has_method("restore_navigation_state"):
		return bool(await view.restore_navigation_state(state))
	return true


func _asset_source_slot(field: String) -> int:
	var pattern := RegEx.new()
	pattern.compile("(?:results\\[(\\d+)\\].*)?actions\\[(\\d+)\\]")
	var result := pattern.search(field)
	if result == null: return -1
	return result.get_string(2).to_int() + (result.get_string(1).to_int() * 8 if not result.get_string(1).is_empty() else 0)


func _emit_history() -> void:
	history_changed.emit(can_go_back(), can_go_forward())


func sync_selection() -> void:
	var library_selected: bool = is_instance_valid(_assets.library_workbench) and _tabs.get_current_tab_control() == _assets.library_workbench
	_explorer.select_route(_registry.identity_for_tab(_tabs.current_tab), library_selected, _map.is_dungeon, special_land_world_context)


func open_first_map(level_type: String) -> void:
	for map: Dictionary in _map.maps:
		if str(map.get("levelType", "land")) == level_type:
			await open_map(str(map.get("identity", "")))
			return
	status_changed.emit("This project contains no %s map." % level_type)


func open_map(identity: String) -> bool:
	if identity.is_empty() or _operations.busy: return false
	if _has_draft.call():
		await _guard.call(open_map.bind(identity), "opening the linked map")
		return false
	var epoch := session_epoch()
	var route := "maps.dungeon" if identity.begins_with("dungeon:") else "maps.land"
	await select_route(route)
	if session_epoch()!=epoch or _registry.identity_for_tab(_tabs.current_tab)!=route: return false
	var loaded := await _map.load_map(identity)
	if not loaded.get("ok", false) or session_epoch()!=epoch or _map.identity!=identity: return false
	await _scripts.reload_action_points_for_map(identity)
	if session_epoch()!=epoch: return false
	status_changed.emit("Opened %s" % identity)
	return true

func session_epoch() -> int:
	return _map.session_epoch() if _map!=null else -1


func open_special_land(from_world: bool) -> void:
	await select_route("maps.special-land" if from_world else "assets.special-land")


func open_map_action_points() -> void:
	if _map.identity.is_empty():
		status_changed.emit("Select a map before opening its Action Points.")
		return
	await select_route("scripts.action-points")
	if _registry.identity_for_tab(_tabs.current_tab) == "scripts.action-points": await _scripts.reload_action_points_for_map(_map.identity)


func create_map(level_type: String) -> void:
	if _operations.busy: return
	if _has_draft.call():
		await _guard.call(create_map.bind(level_type), "creating a map")
		return
	await _map_lifecycle.review_create_map(level_type)


func duplicate_map(source: String) -> void:
	if _operations.busy: return
	if _has_draft.call():
		await _guard.call(duplicate_map.bind(source), "duplicating a map")
		return
	await _map_lifecycle.review_duplicate_map(source)


func show_created_map(identity: String) -> bool:
	var route := "maps.dungeon" if _map.is_dungeon else "maps.land"
	await select_route(route)
	if _registry.identity_for_tab(_tabs.current_tab) != route: return false
	await _scripts.reload_action_points_for_map(identity)
	return not _operations.requires_reopen


func _open_complex_result(view: Control, identity: String, context: Dictionary) -> Dictionary:
	var opened: bool = await _scripts.open_source("complex-encounter", identity)
	if opened and int(context.get("encounterResult", -1)) >= 0: view.select_result(int(context.encounterResult))
	return {"ok": opened}


func _open_string_target(kind: String, native_id: int) -> Dictionary:
	var strings = _strings.get_ref()
	if strings == null: return {"ok": false, "error": "The string editor is unavailable."}
	if kind == "option-label": return await strings.open_option_label(absi(native_id))
	await strings.open_native(absi(native_id))
	return {"ok": strings.selected_identity() == "message:%d" % absi(native_id)}

func open_diagnostic_asset(identity: String, scope: String) -> bool:
	if _operations.busy: return false
	if _has_draft.call():
		await _guard.call(open_diagnostic_asset.bind(identity,scope), "opening the linked artwork or text")
		return false
	var epoch:=session_epoch()
	var origin:=_capture_location()
	var response: Dictionary=await _assets.open_catalog_asset(identity,scope)
	if session_epoch()!=epoch or not response.get("ok",false): return false
	_back.append(origin); _forward.clear(); _emit_history()
	return true

func describe_source(reference: Dictionary) -> Dictionary:
	var destination:=preload("res://src/diagnostic_destination.gd").describe(reference)
	if destination.is_empty(): return destination
	var view: Control=_registry.view(destination.route)
	if view!=null and view.has_method("supports_source_field"):
		destination.exact=not str(destination.field).is_empty() and view.supports_source_field(str(destination.field))
		destination.reason="" if destination.exact else "Open the owning record; this field has no direct focus control."
	return destination

func current_route() -> String:
	return str(_registry.identity_for_tab(_tabs.current_tab))
