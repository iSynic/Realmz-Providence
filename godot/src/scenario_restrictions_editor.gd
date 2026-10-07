extends ProvidenceScenarioSectionEditor

var _bans := {"race": [], "caste": []}
var _catalogs := {"race": [], "caste": []}


func _ready() -> void:
	for family in ["race", "caste"]:
		_list(family).ban_toggled.connect(_toggle_ban.bind(family))
		text_field(family.capitalize() + "Filter").text_changed.connect(_list(family).filter_choices)
	find_child("ClearRestrictions", true, false).pressed.connect(_clear_draft)
	super._ready()


func editing_nodes() -> Array:
	return [text_field("MaximumPartySize"), text_field("MaximumCharacterLevel"), text_editor("RestrictionMessage")]


func complete_projection(operation: ProvidenceEditorOperation, response: Dictionary) -> Dictionary:
	for family in ["race", "caste"]:
		var catalog := await operation.request(family + "-rule.list", {"offset": 0, "limit": 128})
		if not catalog.get("ok", false): return catalog
		response.result[family + "Catalog"] = catalog.result.get("items", [])
	return response


func render_projection(result: Dictionary) -> void:
	var policy: Dictionary = result.get("restrictions", {})
	text_field("MaximumPartySize").text = str(int(policy.get("maxPartySize", 6)))
	text_field("MaximumCharacterLevel").text = str(int(policy.get("maxLevel", 0)))
	text_editor("RestrictionMessage").text = str(policy.get("description", ""))
	for family in ["race", "caste"]:
		_bans[family] = policy.get("bannedRaces" if family == "race" else "bannedCastes", []).duplicate()
		_catalogs[family] = result.get(family + "Catalog", []).duplicate(true)
		_render_list(family)
	find_child("SourceEvidence", true, false).text = str(result.get("source", "No retained Data RI; the current policy is editable."))


func _render_list(family: String) -> void:
	var missing: Array = _list(family).set_choices(_catalogs[family], _bans[family])
	_list(family).filter_choices(text_field(family.capitalize() + "Filter").text)
	find_child(family.capitalize() + "MissingReferences", true, false).text = "Missing definitions: " + ", ".join(missing) if not missing.is_empty() else ""


func _toggle_ban(identity: String, checked: bool, family: String) -> void:
	if not can_edit(): return
	if checked and identity not in _bans[family]: _bans[family].append(identity)
	elif not checked: _bans[family].erase(identity)
	draft_changed()


func draft_params() -> Dictionary:
	var party := integer_field("MaximumPartySize", 6)
	var level := integer_field("MaximumCharacterLevel", 32767)
	if party.has("localError"): return party
	if level.has("localError"): return level
	if party.value == 0: return {"localError": "Maximum party size must be 1 through 6."}
	return {"restrictions": {"description": text_editor("RestrictionMessage").text,
		"maxPartySize": party.value, "maxLevel": level.value,
		"bannedRaces": _bans.race.duplicate(), "bannedCastes": _bans.caste.duplicate()}}


func extra_draft_token() -> Dictionary:
	return {"bans": _bans.duplicate(true)}


func clear_extra_state() -> void:
	_bans = {"race": [], "caste": []}
	_catalogs = {"race": [], "caste": []}
	for family in ["race", "caste"]:
		_list(family).clear_choices()
		text_field(family.capitalize() + "Filter").text = ""
		find_child(family.capitalize() + "MissingReferences", true, false).text = ""


func _clear_draft() -> void:
	if not can_edit(): return
	_bans = {"race": [], "caste": []}
	text_field("MaximumPartySize").text = "6"
	text_field("MaximumCharacterLevel").text = "0"
	text_editor("RestrictionMessage").text = ""
	for family in ["race", "caste"]: _render_list(family)
	draft_changed()


func _list(family: String) -> GridContainer:
	return find_child(family.capitalize() + "Checklist", true, false) as GridContainer


func set_extra_interaction(enabled: bool) -> void:
	for family in ["race", "caste"]: _list(family).set_enabled(enabled)
	find_child("ClearRestrictions", true, false).disabled = not enabled

func focus_source(_identity: String, _slot: int, field: String) -> bool:
	var family := "race" if field.begins_with("campaign.restrictions.bannedRaces[") else "caste" if field.begins_with("campaign.restrictions.bannedCastes[") else ""
	if family.is_empty(): return false
	var index := field.get_slice("[", 1).to_int()
	if index < 0 or index >= _bans[family].size(): return false
	text_field(family.capitalize() + "Filter").text = ""
	_list(family).filter_choices("")
	var control: CheckBox = _list(family).choice_for(str(_bans[family][index]))
	if control == null: return false
	find_child("WorkbenchScroll", true, false).ensure_control_visible(control)
	control.grab_focus()
	return true


func restore_extra_draft(token: Dictionary) -> void:
	_bans = token.get("bans", _bans).duplicate(true)
	for family in ["race", "caste"]: _render_list(family)
