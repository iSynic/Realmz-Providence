extends VBoxContainer

var _identity := ""


func _ready() -> void:
	clear_projection()


func set_projection(result: Dictionary, replacement_id := -1) -> bool:
	clear_projection()
	var entry: Dictionary = result.get("entry", {})
	if str(entry.get("identity", "")).is_empty() or str(entry.get("ownership", "")) != "built-in" or not bool(result.get("protected", false)):
		(%PreviewStatus as Label).text = "No built-in reference selected."
		return false
	_identity = str(entry.get("identity", ""))
	var template: Dictionary = entry.get("template", {})
	(%EntryName as Label).text = str(entry.get("label", ""))
	(%Description as Label).text = str(entry.get("description", ""))
	(%ReplaceScenario as Button).text = "Replace Scenario %d" % replacement_id if replacement_id >= 0 else "Replace Scenario"
	for value in find_children("Value", "Label", true, false):
		var key := str(value.get_meta("field", ""))
		value.text = str(int(template[key])) if template.has(key) else "—"
	var attacks: Array = template.get("attacks", [])
	for index in 5:
		var values: Array = attacks[index] if index < attacks.size() and attacks[index] is Array else []
		var table := $StatsAndAttacks/LibraryAttacks/Body/AttackTable
		(table.get_node("Damage%d" % index) as Label).text = "%d–%d" % [int(values[0]), int(values[1])] if values.size() >= 2 else "—"
		(table.get_node("Form%d" % index) as Label).text = str(int(values[2])) if values.size() >= 3 else "—"
		(table.get_node("Special%d" % index) as Label).text = str(int(values[3])) if values.size() >= 4 else "—"
	var slots: Dictionary = result.get("slotPreview", {})
	%Spells.set_slots(template.get("spells"), "Spell", "No spells", slots.get("spells"))
	%Items.set_slots(template.get("items"), "Item", "No items", slots.get("items"))
	var money: Array = template.get("money", [])
	for index in 3:
		var label := get_node("%" + ["Gold", "Gems", "Jewelry"][index]) as Label
		label.text = str(int(money[index])) if index < money.size() else "—"
	(%PreviewStatus as Label).text = "Protected reference · read-only · appearance not loaded"
	return true


func set_appearance(appearance: Dictionary) -> void:
	(%Portrait as TextureRect).texture = appearance.get("texture")
	(%PreviewStatus as Label).text = "Protected reference · read-only · " + str(appearance.get("status", "Appearance unavailable."))


func current_identity() -> String:
	return _identity


func set_reward_art(art: Array) -> void:
	for slot in 3:
		var icon := get_node("%" + ["GoldIcon", "GemsIcon", "JewelryIcon"][slot]) as TextureRect
		icon.texture = art[slot].get("texture") if art.size() == 3 else null
		icon.tooltip_text = str(art[slot].get("status", "Artwork unavailable")) if art.size() == 3 else "Artwork unavailable"


func clear_projection() -> void:
	_identity = ""
	set_reward_art([])
	(%EntryName as Label).text = "No library entry selected."
	(%Description as Label).text = ""
	(%Portrait as TextureRect).texture = null
	(%ReplaceScenario as Button).text = "Replace Scenario"
	for value in find_children("Value", "Label", true, false):
		value.text = "—"
	for index in 5:
		for part in ["Damage", "Form", "Special"]:
			($StatsAndAttacks/LibraryAttacks/Body/AttackTable.get_node("%s%d" % [part, index]) as Label).text = "—"
	%Spells.clear_rows()
	%Items.clear_rows()
	for node_name in ["Gold", "Gems", "Jewelry"]:
		(get_node("%" + node_name) as Label).text = "—"
	(%PreviewStatus as Label).text = "Read-only library preview."
