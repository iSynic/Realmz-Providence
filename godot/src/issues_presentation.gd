extends RefCounted

const SOURCE_NAMES := {
	"message": "Message", "extra-action-point": "Extra AP", "simple-encounter": "Simple Encounter",
	"complex-encounter": "Complex Encounter", "rogue-encounter": "Rogue Encounter",
	"battle": "Battle", "shop": "Shop", "treasure": "Treasure", "monster": "Monster",
	"timed-encounter":"Timed Encounter", "race":"Race", "caste":"Caste", "spell":"Spell", "item":"Item", "option-label":"Encounter choice text", "text-resource":"Scrolling text", "picture": "Picture", "sound": "Sound", "icon": "Icon", "player-map": "Player Map",
}

const TYPE_NAMES := {
	"battle.empty": "Empty battles", "battle.runtime-monster-limit": "Too many battle monsters",
	"action-settings.missing": "Missing action settings",
	"source.partial-record.preserved": "Incomplete trailing records",
	"source.shop-records.quarantined": "Preserved shop records",
	"source.race-table.quarantined": "Preserved race table",
	"complex-encounter.word.empty": "Empty word responses",
	"complex-encounter.action.no-groups": "Encounter actions without groups",
	"complex-encounter.item.result-without-target": "Item results without an item",
	"complex-encounter.spell.result-without-target": "Spell results without a spell",
	"rogue-encounter.trap.no-effect": "Traps without an effect",
	"rogue-encounter.damage.inverted": "Reversed damage ranges",
	"timed-encounter.percent.out-of-range": "Timed encounter chance outside range",
	"timed-encounter.location.invalid-level": "Invalid timed encounter location",
}


static func type_label(code: String) -> String:
	if TYPE_NAMES.has(code): return TYPE_NAMES[code]
	if code.begins_with("reference."):
		var kind := code.get_slice(".", 1).replace("-", " ")
		return "%s %s" % [code.get_slice(".", 2).capitalize(), kind]
	return code.replace(".", " · ").replace("-", " ").capitalize()


static func source_label(finding: Dictionary) -> String:
	var entity: Variant = finding.get("entity")
	if not entity is String or entity.is_empty():
		return "Scenario"
	var parts: PackedStringArray = entity.split(":")
	var label := "Scenario record"
	if parts[0] == "action-point" and parts.size() == 4:
		label = "Action Point %s · %s %s" % [parts[3], parts[1].capitalize(), parts[2]]
	elif SOURCE_NAMES.has(parts[0]) and parts.size() >= 2:
		label = "%s %s" % [SOURCE_NAMES[parts[0]], parts[-1]]
	elif entity.begins_with("classic."):
		label = entity.get_slice(".", 1).capitalize()+" "+entity.get_slice(".", 2)
	elif entity == "global":
		label = "Global Macros"
	elif entity.begins_with("classic-source:"):
		label = "Retained source · "+entity.trim_prefix("classic-source:")
	var slot := action_slot(finding)
	if slot >= 0:
		label += " · Result %d · Step %d" % [slot/8+1,slot%8+1] if entity.begins_with("complex-encounter:") or str(finding.get("field","")).begins_with("results[") else " · Step %d" % (slot+1)
	elif finding.get("field") == "promptMessage":
		label += " · Prompt"
	return label


static func action_slot(finding: Dictionary) -> int:
	return preload("res://src/source_navigation.gd").action_slot(str(finding.get("field", "")))

static func message(finding: Dictionary) -> String:
	var text:=str(finding.get("message",""))
	var field:=str(finding.get("field",""))
	if action_slot(finding)>=0 and text.begins_with(field+" "): return "This step "+text.trim_prefix(field+" ")
	return text


static func guidance(finding: Dictionary, destination: Dictionary) -> String:
	if finding.has("preservationReason"): return str(finding.preservationReason)
	if destination.is_empty():
		return "This problem has no available editor destination."
	if not str(destination.get("reason", "")).is_empty(): return str(destination.reason)
	var code := str(finding.get("code", ""))
	if code.begins_with("reference."):
		var kind := code.get_slice(".", 1).replace("-", " ")
		return "Choose an existing %s or change this reference." % kind
	if code.begins_with("action-settings.") or code.begins_with("extra-code.opcode-92."):
		return "Complete the settings for this action."
	return "Open the source to review and correct this problem."
