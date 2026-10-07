extends RefCounted

const ACTIONS := ["Acrobatic Act", "Detect Trap", "Disarm Trap", "Hear Noise", "Force Lock", "Move Silently", "Pick Lock", "Pick Pocket"]
const LABELS := {"modifiers": "modifier", "successCodes": "success result", "failureCodes": "failure result", "successText": "success string", "failureText": "failure string", "successSounds": "success sound", "failureSounds": "failure sound", "typeFlags": "available", "lowDamage": "Low trap damage", "highDamage": "High trap damage", "spell": "Trap spell", "percent": "Chance", "door": "Extra Action Point", "requiredLevel": "Required level", "requiredRandomRect": "Random rectangle", "requiredX": "Exact X", "requiredY": "Exact Y", "locationKind": "Position"}


static func populate(tree: Tree, applied: Dictionary, draft: Dictionary) -> void:
	tree.clear(); tree.create_item()
	for column in range(3): tree.set_column_title(column, ["Field", "Currently applied", "Your retained draft"][column])
	tree.set_column_expand(0, false); tree.set_column_custom_minimum_width(0, 290)
	for key in draft:
		if key in ["identity", "nativeId", "authored"]: continue
		var old: Variant = applied.get(key)
		var next: Variant = draft[key]
		if old is Array and next is Array:
			for slot in range(next.size()):
				if not preload("res://src/document_value_equality.gd").equal(old[slot], next[slot]): _row(tree, _label(key, slot), old[slot], next[slot])
		elif not preload("res://src/document_value_equality.gd").equal(old, next): _row(tree, str(LABELS.get(key, key.capitalize())), old, next)


static func _label(key: String, slot: int) -> String:
	if key == "prompts": return ["Trap prompt string", "Trap sound", "Trap spell power"][slot]
	if key == "promptSounds": return ["Opening sound", "Open Lock magic / level", "Disarm magic / level"][slot]
	if key == "typeFlags" and slot >= 8: return "Affects acting Rogue only" if slot == 8 else "Is trapped"
	return ACTIONS[slot] + " · " + str(LABELS.get(key, key.capitalize()))


static func _row(tree: Tree, label: String, old: Variant, next: Variant) -> void:
	var item := tree.create_item(tree.get_root())
	item.set_text(0, label); item.set_tooltip_text(0, label)
	for entry in [[1, old], [2, next]]:
		var value: String = ("Yes" if entry[1] else "No") if entry[1] is bool else (str(int(entry[1])) if entry[1] is float else str(entry[1]))
		item.set_text(entry[0], value); item.set_tooltip_text(entry[0], value)
