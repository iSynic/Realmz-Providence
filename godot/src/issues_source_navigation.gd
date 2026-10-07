extends RefCounted

const Presentation = preload("res://src/issues_presentation.gd")
const Routes = preload("res://src/route_catalog.gd")
const DOCUMENTS := {
	"extra-action-point": ["scripts.macros", "extra-action-point.open", "extraActionPoint"],
	"simple-encounter": ["encounters.simple", "encounter.open-simple", "encounter"],
	"complex-encounter": ["encounters.complex", "encounter.open-complex", "encounter"],
	"action-point": ["scripts.action-points", "action-point.open", "actionPoint"],
}
const READONLY_DOCUMENTS := {"battle": "combat.battles", "treasure": "economy.treasure", "shop": "economy.shops"}


static func destination(finding: Dictionary) -> Dictionary:
	var described := preload("res://src/diagnostic_destination.gd").describe(finding)
	if not described.is_empty():
		described["tab"] = Routes.tab_for_route(described.route)
		described["nativeId"] = preload("res://src/source_navigation.gd").last_integer(described.identity)
		if is_settings_finding(finding): described["repair"] = true
		return described
	var identity: Variant = finding.get("entity")
	if not identity is String or identity.is_empty():
		return {}
	var parts: PackedStringArray = identity.split(":")
	if parts.size() < 2 or not parts[-1].is_valid_int() or parts[-1].to_int() < 0:
		return {}
	var kind := parts[0]
	if kind == "action-point":
		if parts.size() != 4 or parts[1] not in ["land", "dungeon"] or not parts[2].is_valid_int() or parts[2].to_int() < 0:
			return {}
	elif parts.size() != 2:
		return {}
	if is_settings_finding(finding) and kind in ["extra-action-point", "simple-encounter", "action-point", "complex-encounter"]:
		return {"tab": Routes.tab_for_route("linter.issues"), "kind": kind, "identity": identity, "nativeId": parts[-1].to_int(), "editable": true, "repair": true}
	if DOCUMENTS.has(kind):
		return {"tab": Routes.tab_for_route(DOCUMENTS[kind][0]), "kind": kind, "identity": identity, "nativeId": parts[-1].to_int(), "editable": true}
	if READONLY_DOCUMENTS.has(kind):
		return {"tab": Routes.tab_for_route(READONLY_DOCUMENTS[kind]), "kind": kind, "identity": identity, "nativeId": parts[-1].to_int(), "editable": false}
	return {}


static func is_settings_finding(finding: Dictionary) -> bool:
	var code := str(finding.get("code", ""))
	return Presentation.action_slot(finding) >= 0 and (code.begins_with("action-settings.") or code.begins_with("extra-code.opcode-92."))


static func open(tabs: TabContainer, select_document: Callable, open_script: Callable, finding: Dictionary, target: Dictionary, navigation = null) -> bool:
	if navigation != null:
		return await preload("res://src/source_navigation.gd").open(navigation, {"source":finding.get("entity", ""), "field":finding.get("field", "")})
	var kind: String = target.kind
	await select_document.call(int(target.tab))
	if tabs.current_tab != int(target.tab): return false
	var editor: Control = tabs.get_current_tab_control()
	if READONLY_DOCUMENTS.has(kind):
		var result: Dictionary = await editor.open_native_id(int(target.nativeId))
		return bool(result.get("ok", false))
	if not await open_script.call(kind, str(target.identity)): return false
	if tabs.get_current_tab_control() != editor: return false
	return await editor.focus_source(str(target.identity), Presentation.action_slot(finding), str(finding.get("field", "")))
