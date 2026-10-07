extends RefCounted

# Presentation vocabulary from the pinned donor monsterReferenceModel.ts; no resolution or mutation ownership.
const FORMS := {32: "Pummel", 33: "Claw", 34: "Bite", 35: "Not Used", 36: "Not Used", 37: "Not Used", 38: "Punch / Kick", 39: "Club", 40: "Slime", 41: "Sting"}
const SPECIALS := ["No Special Attacks", "Cause Fear", "Paralyze", "Curse", "Stupify", "Entangle", "Poison", "Confuse", "Drain Spell Points", "Drain Experience", "Charm", "Fire Damage", "Cold Damage", "Electric Damage", "Chemical Damage", "Mental Damage", "Cause Disease", "Cause Age", "Cause Blindness", "Turn to Stone"]
const RANDOM_WEAPONS := ["swords", "clubs", "clubs / spears", "axes", "small swords / small axes", "clubs / flails / spears", "spears / pole weapons", "axes / spears", "swords / dagger / cutlass / nunchucka"]


static func display(path: String, value: int) -> String:
	if path == "canSummon":
		return "%d = %s" % [value, {0: "No", 1: "Yes", -1: "Is a NPC"}.get(value, "Unknown")]
	if path == "deathMacro":
		return "0 · No monster macro" if value == 0 else "%d · Extra Action Point" % value
	if path == "weapon":
		if value >= -9 and value <= -1: return "%d · Random %s" % [value, RANDOM_WEAPONS[-value - 1]]
		return "0 · No weapon" if value == 0 else "%d · Weapon label unavailable" % value
	if path == "requiredWeapon":
		var code := posmod(value, 256)
		return "%d · %s" % [value, {0: "All weapons", 255: "Blunt only", 254: "Sharp only"}.get(code, "Weapon %d" % code)]
	if path.begins_with("spells."):
		return "0 · No spell" if value == 0 else "%d · Spell label unavailable" % value
	if path.begins_with("items."):
		return "0 · No item" if value == 0 else "%d · Item label unavailable" % value
	if path.begins_with("attacks.") and path.ends_with(".2"):
		return "%d · %s" % [value, FORMS.get(value, "Unknown form")]
	if path.begins_with("attacks.") and path.ends_with(".3"):
		return "%d · %s" % [value, SPECIALS[value] if value >= 0 and value < SPECIALS.size() else "Unknown special"]
	return ""


static func compact(path: String, value: int) -> String:
	if path.begins_with("attacks."):
		if path.ends_with(".2"):
			return "%d\n%s" % [value, FORMS.get(value, "Unknown")]
		if path.ends_with(".3"):
			return "%d\n%s" % [value, "None" if value == 0 else (SPECIALS[value] if value > 0 and value < SPECIALS.size() else "Unknown")]
	var label := display(path, value)
	return label.trim_prefix("0 · ") if value == 0 else label


static func choices(path: String) -> Dictionary:
	if path == "canSummon": return {0: "No", 1: "Yes", -1: "Is a NPC"}
	if path.begins_with("attacks.") and path.ends_with(".2"): return FORMS
	if path.begins_with("attacks.") and path.ends_with(".3"):
		var result := {}
		for index in SPECIALS.size(): result[index] = SPECIALS[index]
		return result
	return {}
