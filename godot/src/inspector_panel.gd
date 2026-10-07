class_name ProvidenceInspectorPanel
extends PanelContainer

var _repair_source := ""
var _repair_slot := -1
var _repair_field := ""

signal repair_requested

@onready var evidence_toggle: Button = %EvidenceToggle
@onready var evidence_details: VBoxContainer = %EvidenceDetails
@onready var _target: Label = %CurrentReferenceTarget
@onready var _source: Label = %InspectorSource
@onready var _field: Label = %InspectorField
@onready var _repair_target: SpinBox = %ReferenceRepairTarget
@onready var _repair: Button = %RepairReference
@onready var _identity: Label = %InspectorIdentity
@onready var _native_family: Label = %InspectorNativeFamily
@onready var _owned_bytes: Label = %InspectorOwnedBytes


func _ready() -> void:
	_set_evidence_expanded(false)


func _on_evidence_toggled(expanded: bool) -> void:
	_set_evidence_expanded(expanded)


func _set_evidence_expanded(expanded: bool) -> void:
	evidence_toggle.button_pressed = expanded
	evidence_toggle.text = "Source Evidence  ▾" if expanded else "Source Evidence  ▸"
	evidence_details.visible = expanded


func _on_repair_pressed() -> void:
	repair_requested.emit()


func show_read_only_record(result: Dictionary, record_key: String, family: String, record_bytes: int, empty_label: String) -> void:
	var record := result.get(record_key, {}) as Dictionary
	_repair_target.editable = false
	_repair.disabled = true
	_repair.text = "No repair"
	if record.is_empty():
		_identity.text = "%s:—" % record_key
		_native_family.text = "%s / %d-byte record" % [family, record_bytes]
		_owned_bytes.text = "Select a %s" % empty_label
		_target.text = "No %s selected" % empty_label
		_source.text = "—"
		_field.text = "—"
		return
	var native_id := int(record.get("nativeId", 0))
	_identity.text = str(record.get("identity", "%s:—" % record_key))
	_native_family.text = "%s / %d-byte record" % [family, record_bytes]
	_owned_bytes.text = "record %d · bytes %d…%d" % [native_id, native_id * record_bytes, native_id * record_bytes + record_bytes - 1]
	var references := result.get("references", []) as Array
	if references.is_empty():
		_target.text = "%s has no typed targets" % empty_label
		_source.text = str(record.get("identity", "—"))
		_field.text = "—"
		return
	var chosen := references[0] as Dictionary
	for value in references:
		var candidate := value as Dictionary
		if str(candidate.get("resolution", "")) != "resolved":
			chosen = candidate
			break
	_target.text = "%s %s — %s" % [
		str(chosen.get("targetKind", "target")),
		str(chosen.get("targetId", "—")),
		str(chosen.get("resolution", "unknown")),
	]
	_source.text = str(chosen.get("source", "—"))
	_field.text = str(chosen.get("field", "—"))


func show_monster_context(context: Dictionary) -> void:
	if context.get("kind") == "monster-library-selection":
		show_monster_context({})
		_identity.text = "%d Library entries selected" % int(context.get("count", 0))
		_native_family.text = "Monster Library"
		_target.text = "Destination plan ready · copy unavailable" if bool(context.get("planAvailable", false)) else "Destination planning unavailable"
		return
	var result: Dictionary = context.get("result", {})
	var is_library := str(context.get("kind", "")) == "monster-library-entry"
	var record: Dictionary = result.get("entry", {}) if is_library else result.get("monster", {})
	_identity.text = str(record.get("identity", "No Monster selected"))
	_native_family.text = "Monster Library" if is_library else "Scenario Monsters"
	_owned_bytes.text = "Read-only inspection"
	_source.text = str(record.get("identity", "—"))
	_field.text = "—"
	_target.text = "No selection"
	if not record.is_empty():
		var references: Variant = result.get("references")
		_target.text = "%d outgoing references" % references.size() if references is Array else "Reference information unavailable"
		if is_library:
			_target.text = str(record.get("label", "Library entry")) + "\n" + _target.text
		else:
			_target.text = "%s · %s %d\n%s" % [str(record.get("displayName", "Unnamed monster")), {0: "Normal", 1: "Monster", -1: "Mega"}.get(int(result.get("setId", 0)), "Unknown set"), int(record.get("nativeId", -1)), _target.text]
	_repair_target.editable = false
	_repair.disabled = true
	_repair.text = "Not connected"


func show_rule_record(result: Dictionary) -> void:
	var rule := result.get("rule", {}) as Dictionary
	var sourced_spell := result.get("spell", {}) as Dictionary
	if rule.is_empty() and not sourced_spell.is_empty():
		rule = sourced_spell.get("definition", {}) as Dictionary
	_repair_target.editable = false
	_repair.disabled = true
	_repair.text = "No repair"
	if rule.is_empty():
		_identity.text = "rule:—"
		_native_family.text = "Rules / source projection"
		_owned_bytes.text = "Select a rule record"
		_target.text = "No rule selected"
		_source.text = "—"
		_field.text = "—"
		return
	var identity := str(rule.get("id", ""))
	var family := "Data Race" if identity.begins_with("classic.race.") else ("Data Caste" if identity.begins_with("classic.caste.") else "Data Spell")
	var record_bytes := 408 if family == "Data Race" else (576 if family == "Data Caste" else 30)
	var row := maxi(0, int(rule.get("classicId", 1)) - 1) if family != "Data Spell" else int(rule.get("recordIndex", 0))
	_identity.text = identity
	_native_family.text = "%s / %d-byte record" % [family, record_bytes]
	_owned_bytes.text = "row %d · bytes %d…%d" % [row, row * record_bytes, row * record_bytes + record_bytes - 1]
	var references := result.get("references", []) as Array
	var used_by := result.get("usedBy", []) as Array
	_target.text = "%d outgoing · %d used by" % [references.size(), used_by.size()]
	var source := result.get("source", {}) as Dictionary
	_source.text = str(source.get("nativePath", sourced_spell.get("source", identity)))
	_field.text = "Read-only bounded projection"


func show_scenario_section(result: Dictionary, route_id: String) -> void:
	_repair_target.editable = false
	_repair.disabled = true
	_repair.text = "No repair"
	var labels := {"scenario.startup": "Startup Info", "scenario.restrictions": "Restrictions", "scenario.contact": "Contact Info", "scenario.registration": "Security"}
	_identity.text = route_id
	_native_family.text = labels.get(route_id, "Scenario")
	_owned_bytes.text = "Read-only source evidence"
	_target.text = "Field-link inspection is not available here yet"
	var source_value: Variant = result.get("source")
	var source := source_value as Dictionary if source_value is Dictionary else {}
	_source.text = str(source.get("nativePath", "Canonical campaign metadata"))
	_field.text = "No field selected"


func show_message(message: Dictionary, used_by: Array) -> void:
	var native_id := int(message.get("nativeId", 0))
	_identity.text = str(message.get("identity", "message:—"))
	_native_family.text = "Data SD2 / Str255"
	_owned_bytes.text = "record %d · 256 bytes" % native_id
	if used_by.is_empty():
		clear_reference("No incoming typed references")
	else:
		show_reference(used_by[0] as Dictionary)


func show_option_label(label: Dictionary, used_by: Array) -> void:
	var native_id := int(label.get("nativeId", 0))
	_identity.text = str(label.get("identity", "option-label:—"))
	_native_family.text = "Data OD / 25-byte option label"
	_owned_bytes.text = "record %d · bytes %d…%d" % [native_id, native_id * 25, native_id * 25 + 24]
	if used_by.is_empty(): clear_reference("No incoming typed references")
	else: show_reference(used_by[0] as Dictionary)


func show_quest(quest: Dictionary, used_by: Array) -> void:
	var id := int(quest.get("id", 0))
	_identity.text = str(quest.get("identity", "quest:—"))
	_native_family.text = "Classic Quest Flag / Providence author metadata"
	_owned_bytes.text = "runtime slot %d · label and note are not exported" % id
	if used_by.is_empty(): clear_reference("No incoming typed references")
	else: show_reference(used_by[0] as Dictionary)


func show_item(item: Dictionary, known_references: Array) -> void:
	if item.is_empty():
		_identity.text = "classic.item.—"
		_native_family.text = "Data NI / 100-byte itemattr"
		_owned_bytes.text = "Select an item"
		clear_reference("No item selected")
		return
	var identity := str(item.get("id", "classic.item.—"))
	var record_index := int(item.get("classicId", 800)) - 800
	_identity.text = identity
	_native_family.text = "Data NI / 100-byte itemattr + STR# 800–802"
	_owned_bytes.text = "record %d · bytes 0…55, 70…99" % record_index
	var candidates: Array = []
	for item_reference in known_references:
		var reference := item_reference as Dictionary
		if str(reference.get("source", "")) == identity:
			candidates.append(reference)
	if candidates.is_empty():
		clear_reference("No outgoing typed item references")
		return
	var chosen := candidates[0] as Dictionary
	for item_reference in candidates:
		var candidate := item_reference as Dictionary
		if str(candidate.get("resolution", "")) != "resolved":
			chosen = candidate
			break
	show_reference(chosen)


func show_encounter(encounter: Dictionary, references: Array, known_references: Array) -> void:
	if encounter.is_empty():
		_identity.text = "simple-encounter:—"
		_native_family.text = "Data ED / 426-byte simple encounter"
		_owned_bytes.text = "Select an encounter"
		clear_reference("No simple encounter selected")
		return
	var identity := str(encounter.get("identity", "simple-encounter:—"))
	var native_id := int(encounter.get("nativeId", 0))
	_identity.text = identity
	_native_family.text = "Data ED / 426-byte simple encounter"
	_owned_bytes.text = "record %d · bytes %d…%d" % [native_id, native_id * 426, native_id * 426 + 425]
	var candidates := references
	if candidates.is_empty():
		for item_reference in known_references:
			var reference := item_reference as Dictionary
			if str(reference.get("source", "")) == identity:
				candidates.append(reference)
	if candidates.is_empty():
		clear_reference("Encounter has no typed targets")
		return
	var chosen := candidates[0] as Dictionary
	for item_reference in candidates:
		var candidate := item_reference as Dictionary
		if str(candidate.get("resolution", "")) != "resolved":
			chosen = candidate
			break
	show_reference(chosen)


func show_extra_action_point(extra_action_point: Dictionary, references: Array, known_references: Array) -> void:
	if extra_action_point.is_empty():
		_identity.text = "extra-action-point:—"
		_native_family.text = "Data ED3 / 40-byte door record"
		_owned_bytes.text = "Select an Extra Action Point"
		clear_reference("No Extra Action Point selected")
		return
	var identity := str(extra_action_point.get("identity", "extra-action-point:—"))
	var native_id := int(extra_action_point.get("nativeId", 0))
	_identity.text = identity
	_native_family.text = "Data ED3 / 40-byte door record"
	_owned_bytes.text = "record %d · bytes %d…%d" % [native_id, native_id * 40, native_id * 40 + 39]
	var candidates := references
	if candidates.is_empty():
		for item_reference in known_references:
			var reference := item_reference as Dictionary
			if str(reference.get("source", "")) == identity:
				candidates.append(reference)
	if candidates.is_empty():
		clear_reference("Extra Action Point has no typed targets")
		return
	var chosen := candidates[0] as Dictionary
	for item_reference in candidates:
		var candidate := item_reference as Dictionary
		if str(candidate.get("resolution", "")) != "resolved":
			chosen = candidate
			break
	show_reference(chosen)


func show_action_point(action_point: Dictionary, references: Array, known_references: Array) -> void:
	if action_point.is_empty():
		_identity.text = "action-point:—"
		_native_family.text = "Data DD / 40-byte Action Point record"
		_owned_bytes.text = "Select an Action Point"
		clear_reference("No Action Point selected")
		return
	var identity := str(action_point.get("identity", "action-point:—"))
	var absolute_record := int(action_point.get("levelIndex", 0)) * 100 + int(action_point.get("recordIndex", 0))
	_identity.text = identity
	_native_family.text = "Data DD / 40-byte Action Point record"
	_owned_bytes.text = "record %d · bytes %d…%d" % [absolute_record, absolute_record * 40, absolute_record * 40 + 39]
	var candidates := references
	if candidates.is_empty():
		for item_reference in known_references:
			var reference := item_reference as Dictionary
			if str(reference.get("source", "")) == identity:
				candidates.append(reference)
	if candidates.is_empty():
		clear_reference("Action Point has no typed targets")
		return
	var chosen := candidates[0] as Dictionary
	for item_reference in candidates:
		var candidate := item_reference as Dictionary
		if str(candidate.get("resolution", "")) != "resolved":
			chosen = candidate
			break
	show_reference(chosen)


func show_global_macro(hook_row: Dictionary) -> void:
	if hook_row.is_empty():
		_identity.text = "global-macro:—"
		_native_family.text = "Global / 30 signed-short slots"
		_owned_bytes.text = "5 source-backed hooks · 10 owned bytes"
		clear_reference("Select a Global Macro hook")
		return
	var hook := str(hook_row.get("hook", "hook"))
	_identity.text = "global-macro:%s" % hook
	_native_family.text = "Global / 60-byte lifecycle hook table"
	_owned_bytes.text = "bytes %d…%d" % [
		int(hook_row.get("byteStart", 0)),
		int(hook_row.get("byteEnd", 0)) - 1,
	]
	var reference_value: Variant = hook_row.get("reference", null)
	var reference := reference_value as Dictionary if reference_value is Dictionary else {}
	if reference.is_empty():
		clear_reference("Hook is unassigned")
	else:
		show_reference(reference)


func show_picture(picture: Dictionary) -> void:
	if picture.is_empty():
		_identity.text = "picture:—"
		_native_family.text = "Scenario.rsrc / PICT"
		_owned_bytes.text = "whole named resource payload"
		clear_reference("Select a Scenario Picture")
		return
	_identity.text = str(picture.get("identity", "picture:—"))
	_native_family.text = "Scenario.rsrc / PICT %d" % int(picture.get("resourceId", 0))
	_owned_bytes.text = "%d compiled payload bytes" % int(picture.get("classicPayloadBytes", 0))
	_source.text = "authored image import"
	_field.text = "classicResource"
	_target.text = "PICT %d — ready" % int(picture.get("resourceId", 0))
	_repair_source = ""
	_repair_slot = -1
	_repair_field = ""
	_repair_target.editable = false
	_repair.disabled = true
	_repair.text = "No repair action required"


func show_sound(sound: Dictionary) -> void:
	if sound.is_empty():
		_identity.text = "sound:—"
		_native_family.text = "Scenario.rsrc / snd "
		_owned_bytes.text = "whole named resource payload"
		clear_reference("Select a Scenario Sound")
		return
	_identity.text = str(sound.get("identity", "sound:—"))
	_native_family.text = "Scenario.rsrc / snd %d" % int(sound.get("resourceId", 0))
	_owned_bytes.text = "%d compiled payload bytes" % int(sound.get("classicPayloadBytes", 0))
	_source.text = "authored WAV import"
	_field.text = "classicResource"
	_target.text = "snd %d — ready" % int(sound.get("resourceId", 0))
	_repair_source = ""
	_repair_slot = -1
	_repair_field = ""
	_repair_target.editable = false
	_repair.disabled = true
	_repair.text = "No repair action required"


func show_icon(icon: Dictionary) -> void:
	if icon.is_empty():
		_identity.text = "icon:—"
		_native_family.text = "Scenario.rsrc / cicn"
		_owned_bytes.text = "whole named resource payload"
		clear_reference("Select a Scenario Icon")
		return
	_identity.text = str(icon.get("identity", "icon:—"))
	_native_family.text = "Scenario.rsrc / cicn %d" % int(icon.get("resourceId", 0))
	_owned_bytes.text = "%d compiled payload bytes" % int(icon.get("classicPayloadBytes", 0))
	_source.text = "authored image import · 32 × 32 output"
	_field.text = "classicResource"
	_target.text = "cicn %d — ready" % int(icon.get("resourceId", 0))
	_repair_source = ""
	_repair_slot = -1
	_repair_field = ""
	_repair_target.editable = false
	_repair.disabled = true
	_repair.text = "No repair action required"


func show_reference(reference: Dictionary) -> void:
	var source := str(reference.get("source", "—"))
	var field := str(reference.get("field", "—"))
	var target_id := str(reference.get("targetId", "—"))
	var target_kind := str(reference.get("targetKind", "target")).replace("-", " ").capitalize()
	var resolution := str(reference.get("resolution", "missing"))
	_source.text = _friendly_source(source)
	_field.text = _friendly_field(field)
	_target.text = "%s %s — %s" % [target_kind, target_id, resolution]
	_repair_source = source
	_repair_slot = -1
	_repair_field = field
	if field.begins_with("actions["):
		_repair_slot = field.get_slice("[", 1).get_slice("]", 0).to_int()
	var can_retarget := _repair_slot >= 0 or field == "promptMessage"
	var last_target_part := target_id.get_slice_count(":") - 1
	var target_native_id := target_id.get_slice(":", last_target_part).to_int()
	_repair_target.value = max(target_native_id, 0)
	_repair_target.editable = can_retarget
	_repair.disabled = not can_retarget
	_repair.text = "Retarget %s" % target_kind if can_retarget else "No repair action available"


func clear_reference(message: String) -> void:
	_source.text = "—"
	_field.text = "—"
	_target.text = message
	_repair_source = ""
	_repair_slot = -1
	_repair_field = ""
	_repair_target.editable = false
	_repair.disabled = true
	_repair.text = "No repair action available"


func _friendly_source(source: String) -> String:
	if source.begins_with("extra-action-point:"):
		return "Extra Action Point %03d" % source.get_slice(":", 1).to_int()
	if source.begins_with("action-point:"): return "Selected Action Point"
	return source


func _friendly_field(field: String) -> String:
	if field.begins_with("actions["):
		return "Step %d target" % (field.get_slice("[", 1).get_slice("]", 0).to_int() + 1)
	if field == "promptMessage": return "Encounter prompt"
	return field


func repair_request() -> Dictionary:
	if _repair.disabled or _repair_source.is_empty(): return {}
	return {"source": _repair_source, "field": _repair_field, "slot": _repair_slot, "targetNativeId": int(_repair_target.value)}
