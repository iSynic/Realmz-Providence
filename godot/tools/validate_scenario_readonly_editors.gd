extends SceneTree

const NativeBridge = preload("res://src/native_bridge.gd")
const ROUTES := {
	"scenario.startup": ["res://src/scenario_startup_editor.tscn", "scenario-startup.open", ["ScenarioHeader", "StartupShellForm", "StartMapSummary", "RelatedEditors", "SourceEvidence", "DisabledReason"]],
	"scenario.restrictions": ["res://src/scenario_restrictions_editor.tscn", "scenario-restrictions.open", ["ScenarioHeader", "RestrictionPresence", "PartyGates", "RestrictionMessage", "RaceChecklist", "CasteChecklist", "SourceEvidence", "DisabledReason"]],
	"scenario.contact": ["res://src/scenario_contact_editor.tscn", "scenario-contact.open", ["ScenarioHeader", "ContactFields", "DescriptionEditor", "SourceProvenance", "DisabledReason"]],
	"scenario.registration": ["res://src/scenario_security_evidence.tscn", "scenario-security.open", ["ScenarioHeader", "SecurityPolicy", "PreservedSegmentEvidence", "SecuritySegments", "SourceProvenance", "DisabledReason"]],
}


class ScenarioBridge:
	extends RefCounted
	var fail_method := ""
	var requests: Array[String] = []

	func request(method: String, _params: Dictionary = {}) -> Dictionary:
		requests.append(method)
		if method == fail_method:
			return {"ok": false, "error": "controlled %s failure" % method}
		match method:
			"scenario-startup.open":
				return _ok({"revision": 7, "startup": {"name": "The Long Road to Bywater", "recommendedPartyLevels": 4, "maximumPartyLevels": 999, "creatorUserCheck": ""}, "startLocation": {"map": "map:land:0", "coordinate": {"x": 38, "y": 42}}, "startMapResolves": true, "source": {"nativePath": "City of Bywater", "byteLength": 256}})
			"scenario-restrictions.open":
				return _ok({"revision": 7, "restrictions": {"description": "No member of the party may be an Orc or Assassin.", "maxPartySize": 6, "maxLevel": 12, "bannedRaces": ["classic.race.4"], "bannedCastes": ["classic.caste.16"]}, "source": {"nativePath": "Data RI", "byteLength": 320}})
			"race-rule.list":
				return _ok({"items": [{"identity": "classic.race.1", "classicId": 1, "name": "Human"}, {"identity": "classic.race.4", "classicId": 4, "name": "Orc"}], "total": 2, "truncated": false})
			"caste-rule.list":
				return _ok({"items": [{"identity": "classic.caste.1", "classicId": 1, "name": "Fighter"}, {"identity": "classic.caste.16", "classicId": 16, "name": "Assassin"}], "total": 2, "truncated": false})
			"scenario-contact.open":
				return _ok({"revision": 7, "contact": {"title": "City of Bywater", "version": "1.2", "date": "October 1995", "author": "Fantasoft", "email": "Not supplied", "web": "Not supplied", "fee": "Noncommercial", "description": "A long-form source-backed description used to verify wrapping and compact-width readability."}, "provenance": "source-backed", "sourcePresent": true})
			"scenario-security.open":
				return _ok({"revision": 7, "policy": "preserve-only", "editable": false, "source": {"nativePath": "City of Bywater", "byteLength": 256}, "segments": [{"index": 1, "offset": 20, "byteLength": 20, "inspectionAvailable": true, "nonzeroByteCount": 18}, {"index": 2, "offset": 40, "byteLength": 20, "inspectionAvailable": true, "nonzeroByteCount": 20}], "reason": "Registration/security bytes are retained exactly but have no certified vNext authoring codec."})
		return {"ok": false, "error": "unexpected method %s" % method}

	func _ok(result: Dictionary) -> Dictionary:
		return {"ok": true, "result": result}


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var bridge := ScenarioBridge.new()
	for route_id in ROUTES:
		var spec := ROUTES[route_id] as Array
		var surface := (load(str(spec[0])) as PackedScene).instantiate() as Control
		surface.size = Vector2(1220, 820)
		root.add_child(surface)
		await process_frame
		if str(surface.route_identity()) != route_id:
			return _fail("%s does not own its stable route identity" % route_id)
		for node_name in spec[2] as Array:
			if surface.find_child(str(node_name), true, false) == null:
				return _fail("%s is missing named region %s" % [route_id, node_name])
		if surface.get_combined_minimum_size().x > 1220.0:
			return _fail("%s exceeds compact width: %.1f" % [route_id, surface.get_combined_minimum_size().x])
		var response := await surface.reload(bridge) as Dictionary
		await process_frame
		await process_frame
		if not bool(response.get("ok", false)) or surface.current_selection() != route_id:
			return _fail("%s did not retain its bounded projection" % route_id)
		if surface.command_state(str(spec[1])) != "working" or surface.command_state("campaign.set") != "visible-disabled":
			return _fail("%s does not classify command state honestly" % route_id)
		var reason := surface.find_child("DisabledReason", true, false) as Label
		if not reason.text.begins_with("Read-only ·") or reason.text.length() > 86:
			return _fail("%s does not expose a short read-only reason" % route_id)
		if not _content_is_populated(surface, route_id):
			return
		if not await _verify_controls(surface, route_id):
			return
		if not await _verify_theme_refresh(surface):
			return
		surface.queue_free()
		await process_frame
	var failed := (load("res://src/scenario_contact_editor.tscn") as PackedScene).instantiate() as Control
	root.add_child(failed)
	await process_frame
	await failed.reload(bridge)
	if (failed.find_child("SourceEvidence", true, false) as Label).text.is_empty():
		return _fail("Contact reset test did not begin with populated source evidence")
	bridge.fail_method = "scenario-contact.open"
	var failure := await failed.reload(bridge) as Dictionary
	if bool(failure.get("ok", true)) or not str(failed.current_selection()).is_empty():
		return _fail("Scenario contact failure retained stale applied data")
	if not (failed.find_child("SourceEvidence", true, false) as Label).text.is_empty():
		return _fail("Scenario contact failure retained stale source evidence")
	var restrictions := (load(str(ROUTES["scenario.restrictions"][0])) as PackedScene).instantiate() as Control
	root.add_child(restrictions)
	await process_frame
	bridge.fail_method = "race-rule.list"
	await restrictions.reload(bridge)
	var unavailable := restrictions.find_child("RaceChecklist", true, false) as ItemList
	var missing_race := restrictions.find_child("RaceMissingReferences", true, false) as Label
	if unavailable.item_count != 1 or not missing_race.visible or not missing_race.text.contains("classic.race.4") or not unavailable.get_item_text(0).contains("Names unavailable"):
		return _fail("Unavailable rule names hid the exact banned identity or implied empty policy")
	for method in bridge.requests:
		if not method.ends_with(".open") and not method.ends_with(".list"):
			return _fail("Scenario read-only interaction sent a mutation: %s" % method)
	var real_suffix := ""
	var arguments := OS.get_cmdline_user_args()
	if not arguments.is_empty():
		if not await _exercise_real_project(str(arguments[0])):
			return
		real_suffix = " realProject=verified"
	failed.queue_free()
	restrictions.queue_free()
	await process_frame
	if not await _verify_shell_navigation():
		return
	print("PROVIDENCE_SCENARIO_READONLY_OK routes=4 keyboardDocumentWidths=920,1220 projections=4 tabCycle=guarded readOnlyInput=guarded failureReset=guarded%s" % real_suffix)
	quit(0)


func _verify_controls(surface: Control, route_id: String) -> bool:
	if surface.get_node("DisabledReason").get_index() >= surface.get_node("WorkbenchScroll").get_index():
		_fail("Scenario read-only status must precede the form")
		return false
	var requested: Array[int] = []
	surface.route_requested.connect(func(tab: int): requested.append(tab))
	var spells := surface.find_child("Spells", true, false) as Button
	spells.grab_focus()
	await _press_key(KEY_ENTER)
	if requested != [23] or surface.command_state("navigate.Spells") != "working" or surface.command_state("unknown.command") != "not-applicable":
		_fail("Scenario shortcut did not navigate to its declared destination")
		return false
	await _press_key(KEY_TAB)
	if root.gui_get_focus_owner() != surface.find_child("Races", true, false):
		_fail("Tab did not follow related-editor order")
		return false
	await _press_key(KEY_TAB, true)
	if root.gui_get_focus_owner() != spells:
		_fail("Shift+Tab did not reverse related-editor order")
		return false
	for width in [920, 1220]:
		surface.size.x = width
		await process_frame
		spells.grab_focus()
		if not await _verify_tab_reachability(surface, spells):
			return false
	var disclosure := surface.find_child("EvidenceDisclosure", true, false) as Button
	var details := surface.find_child("EvidenceDetails", true, false) as Control
	if details.visible:
		_fail("Scenario evidence was not initially collapsed")
		return false
	disclosure.grab_focus()
	await _press_key(KEY_SPACE)
	if not details.visible:
		_fail("Scenario evidence disclosure did not open")
		return false
	spells.grab_focus()
	if not await _verify_tab_reachability(surface, spells):
		return false
	disclosure.grab_focus()
	await _press_key(KEY_SPACE)
	if details.visible:
		_fail("Keyboard could not collapse source evidence")
		return false
	for node in surface.find_children("*", "Control", true, false):
		if not (node is LineEdit or node is TextEdit) or not node.is_visible_in_tree():
			continue
		var before: String = node.text
		node.grab_focus()
		for key in [KEY_A, KEY_BACKSPACE, KEY_DELETE, KEY_ENTER]:
			await _press_key(key)
		if node.text != before:
			_fail("Keyboard altered read-only Scenario text")
			return false
	if route_id == "scenario.restrictions":
		var list := surface.find_child("RaceChecklist", true, false) as ItemList
		list.grab_focus()
		list.select(0)
		var first := list.get_item_text(0)
		await _press_key(KEY_RIGHT)
		if list.get_selected_items() != PackedInt32Array([1]):
			_fail("Arrow navigation did not follow the paired stock checklist")
			return false
		await _press_key(KEY_SPACE)
		await _press_key(KEY_ENTER)
		if list.get_item_text(0) != first or not list.get_item_text(1).begins_with("☑"):
			_fail("Checklist selection changed immutable admission policy")
			return false
	for editor in surface.find_children("*", "TextEdit", true, false):
		if editor.get_theme_color("background_color").a != 0.0:
			_fail("Deprecated TextEdit background would paint over the Scenario focus outline")
			return false
		if editor.get_theme_color("font_readonly_color") != editor.get_theme_color("font_color") or editor.editable:
			_fail("Scenario read-only description lost readable text or became editable")
			return false
	if route_id == "scenario.startup":
		var maps: Array[String] = []
		surface.map_open_requested.connect(func(identity: String): maps.append(identity))
		var make_current := surface.find_child("MakeStartupMapCurrent", true, false) as Button
		make_current.grab_focus()
		await _press_key(KEY_ENTER)
		if maps != ["map:land:0"]:
			_fail("Startup navigation did not use the applied map identity")
			return false
		var reloader := ScenarioBridge.new()
		await surface.reload(reloader)
		await process_frame
		if root.gui_get_focus_owner() != make_current:
			_fail("Startup reload discarded valid Make Current focus")
			return false
		reloader.fail_method = "scenario-startup.open"
		await surface.reload(reloader)
		await process_frame
		if not _has_usable_focus() or root.gui_get_focus_owner() != spells:
			_fail("Failed Startup reload left no keyboard recovery focus")
			return false
		var external := Button.new()
		root.add_child(external)
		external.grab_focus()
		await surface.reload(reloader)
		await process_frame
		if root.gui_get_focus_owner() != external:
			_fail("Failed background reload stole focus from another surface")
			return false
		external.queue_free()
		await process_frame
		spells.grab_focus()
		surface.clear_selection()
		await _press_key(KEY_ENTER)
		if maps.size() != 1 or surface.command_state("scenario.startup-map.open") != "visible-disabled":
			_fail("Startup navigation retained a stale map after close")
			return false
	if route_id == "scenario.registration":
		for name in ["UnlockEditing", "ApplySecurityCodes"]:
			var action := surface.find_child(name, true, false) as Button
			if action == null or not action.disabled or action.tooltip_text.is_empty():
				_fail("Security omitted a disabled donor action or its reason")
				return false
		for name in ["CodeSegment1", "CodeSegment2"]:
			if (surface.find_child(name, true, false) as LineEdit).text != "Decoded text unavailable":
				_fail("Security displayed invented decoded segment text")
				return false
	return true


func _verify_shell_navigation() -> bool:
	var shell := (load("res://src/editor_shell.tscn") as PackedScene).instantiate() as Control
	root.add_child(shell)
	for viewport in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport
		root.content_scale_size = viewport
		var previous := root.gui_get_focus_owner()
		if previous != null:
			previous.release_focus()
		shell._navigation.select_tab(26)
		await process_frame
		await process_frame
		if root.gui_get_focus_owner() != null:
			_fail("Programmatic route selection created unsolicited keyboard focus")
			return false
		var tabs: TabContainer = shell.get("_document_tabs")
		var routes: Array = shell._domain_navigation.buttons()
		var contact := routes[2] as Button
		contact.grab_focus()
		await _press_key(KEY_ENTER)
		if tabs.current_tab != 28 or not _has_usable_focus() or root.gui_get_focus_owner() != contact:
			_fail("Scenario sidebar navigation lost keyboard focus at %s" % viewport)
			return false
		var page := tabs.get_current_tab_control()
		(page.find_child("RestrictionsTab", true, false) as Button).grab_focus()
		await _press_key(KEY_ENTER)
		if tabs.current_tab != 27 or not _has_usable_focus() or root.gui_get_focus_owner() != tabs.get_current_tab_control().find_child("RaceChecklist", true, false):
			_fail("Scenario family navigation lost keyboard focus at %s" % viewport)
			return false
		page = tabs.get_current_tab_control()
		(page.find_child("Spells", true, false) as Button).grab_focus()
		await _press_key(KEY_ENTER)
		if tabs.current_tab != 23 or not _has_usable_focus() or root.gui_get_focus_owner() != tabs.get_current_tab_control().find_child("SpellSearch", true, false):
			_fail("Related editor navigation lost keyboard focus at %s" % viewport)
			return false
		await _press_key(KEY_TAB)
		if not _has_usable_focus():
			_fail("Related editor could not continue keyboard navigation")
			return false
	shell.queue_free()
	await process_frame
	return true


func _has_usable_focus() -> bool:
	var focused := root.gui_get_focus_owner()
	return focused != null and focused.is_visible_in_tree() and focused.focus_mode == Control.FOCUS_ALL and not (focused is BaseButton and focused.disabled)


func _verify_theme_refresh(surface: Control) -> bool:
	var original := surface.theme
	for color in [Color("152535"), Color("e9dfc5")]:
		var candidate := original.duplicate() as Theme
		for type in ["LineEdit", "TextEdit"]:
			candidate.set_color("font_color", type, color)
			candidate.set_stylebox("normal", type, StyleBoxFlat.new())
		surface.theme = candidate
		await process_frame
		await process_frame
		for field in surface.find_children("*", "Control", true, false):
			if not (field is LineEdit or field is TextEdit):
				continue
			var readonly_color := "font_uneditable_color" if field is LineEdit else "font_readonly_color"
			if field.get_theme_color(readonly_color) != color or field.get_theme_stylebox("read_only") != field.get_theme_stylebox("normal"):
				_fail("Read-only field retained stale theme values: %s" % field.name)
				return false
			if field.editable:
				_fail("Theme refresh enabled read-only Scenario authoring")
				return false
	surface.theme = original
	await process_frame
	await process_frame
	for field in surface.find_children("*", "Control", true, false):
		if not (field is LineEdit or field is TextEdit):
			continue
		var color_name := "font_uneditable_color" if field is LineEdit else "font_readonly_color"
		if field.get_theme_color(color_name) != field.get_theme_color("font_color") or field.get_theme_stylebox("read_only") != field.get_theme_stylebox("normal"):
			_fail("Restoring the original theme left stale read-only styling: %s" % field.name)
			return false
	return true


func _press_key(code: Key, backwards := false) -> void:
	for down in [true, false]:
		var event := InputEventKey.new()
		event.keycode = code
		event.unicode = 97 if code == KEY_A else 0
		event.pressed = down
		event.shift_pressed = backwards
		root.push_input(event)
		await process_frame


func _verify_tab_reachability(surface: Control, start: Control) -> bool:
	var visited: Array[Control] = [start]
	var closed := false
	for step in range(100):
		await _press_key(KEY_TAB)
		var focused := root.gui_get_focus_owner()
		if focused == start:
			closed = true
			break
		if focused == null or visited.has(focused):
			_fail("Scenario Tab traversal lost focus or entered a short cycle at %s" % (surface.get_path_to(focused) if focused != null else NodePath("<none>")))
			return false
		visited.append(focused)
	if not closed:
		_fail("Scenario Tab traversal did not return within its bounded control count")
		return false
	for node in surface.find_children("*", "Control", true, false):
		var control := node as Control
		if not control.is_visible_in_tree() or control.focus_mode != Control.FOCUS_ALL:
			continue
		if control is BaseButton and (control as BaseButton).disabled:
			continue
		if not visited.has(control):
			_fail("Keyboard cannot reach %s" % surface.get_path_to(control))
			return false
	return true


func _content_is_populated(surface: Control, route_id: String) -> bool:
	match route_id:
		"scenario.startup":
			if (surface.find_child("ScenarioName", true, false) as LineEdit).text != "The Long Road to Bywater" or (surface.find_child("RecommendedLevel", true, false) as LineEdit).text != "4" or not (surface.find_child("StartMapStatus", true, false) as Label).text.begins_with("Resolved"):
				_fail("Startup projection did not populate donor fields")
				return false
		"scenario.restrictions":
			var races := surface.find_child("RaceChecklist", true, false) as ItemList
			var castes := surface.find_child("CasteChecklist", true, false) as ItemList
			for checklist in [races, castes]:
				checklist.force_update_list_size()
				var second: Rect2 = checklist.get_item_rect(1)
				if second.position.y != checklist.get_item_rect(0).position.y or second.position.x < checklist.size.x * 0.45:
					_fail("Restriction choices must occupy two balanced columns without wrapping: %s in %s" % [second, checklist.size])
					return false
			if races.max_columns != 2 or castes.max_columns != 2 or str(races.get_item_metadata(0)).is_empty():
				_fail("Restriction checklists lost paired columns or stable row identities")
				return false
			if races.item_count != 2 or castes.item_count != 2 or not races.get_item_text(1).begins_with("☑") or not castes.get_item_text(1).begins_with("☑"):
				_fail("Restriction projection did not render complete donor checklists")
				return false
			if races.is_item_disabled(0) or castes.is_item_disabled(0):
				_fail("Read-only restriction values were dimmed as disabled data")
				return false
		"scenario.contact":
			if (surface.find_child("ContactTitle", true, false) as LineEdit).text != "City of Bywater" or (surface.find_child("ContactDescription", true, false) as TextEdit).text.is_empty():
				_fail("Contact projection did not populate release metadata")
				return false
		"scenario.registration":
			var segments := surface.find_child("SecuritySegments", true, false) as ItemList
			if segments.item_count != 2 or not segments.get_item_text(0).contains("BYTES 20…39"):
				_fail("Security projection did not retain byte-segment evidence")
				return false
	return true


func _exercise_real_project(project_path: String) -> bool:
	var bridge := NativeBridge.new()
	var started := bridge.start_project(project_path)
	if not bool(started.get("ok", false)):
		_fail(str(started.get("error", "Real project could not be opened.")))
		return false
	for route_id in ROUTES:
		var spec := ROUTES[route_id] as Array
		var surface := (load(str(spec[0])) as PackedScene).instantiate() as Control
		root.add_child(surface)
		await process_frame
		var response := await surface.reload(bridge) as Dictionary
		if not bool(response.get("ok", false)) or surface.current_selection() != route_id:
			_fail("Real project did not populate %s" % route_id)
			bridge.stop()
			return false
	bridge.stop()
	return true


func _fail(message: String) -> void:
	push_error("PROVIDENCE_SCENARIO_READONLY_FAILED: %s" % message)
	quit(1)
