extends RefCounted

# Labels mirror the pinned Providence rules catalog; values always come from bounded projections.
const RACE_ATTRIBUTES := ["Brawn", "Knowledge", "Judgement", "Agility", "Vitality", "Luck"]
const HIT_TARGETS := ["Magic Using", "Undead", "Demonic / Devil", "Reptilian", "Very Evil", "Intelligent", "Giant Size", "Non-Humanoid"]
const RESISTANCE_TYPES := ["Charm", "Heat", "Cold", "Electrical", "Chemical", "Mental", "Magical", "Special"]
const SPELL_CLASSES := ["Sorcerer", "Priest", "Enchanter", "Special", "Custom"]
const SPELL_TARGET_TYPES := ["Multi Open Space", "Multi Target", "Single Target", "Fixed Size", "Area × Power", "Target Self", "Ray", "Target Party", "Single Open", "All Friendly", "All Enemies", "Special"]
const SPELL_DAMAGE_TYPES := ["Charm", "Heat", "Cold", "Electrical", "Chemical", "Mental", "Magical", "Special", "Weapon", "Miscellaneous"]
const STANDARD_RACES := ["Human", "Shadow Elf", "Elf", "Orc", "Furfoot", "Gnome", "Dwarf", "Half Elf", "Half Orc", "Goblin", "Hobgoblin", "Kobold", "Vampire", "Lizard Man", "Brownie", "Pixie", "Leprechaun", "Demon", "Cathoon"]
const STANDARD_CASTES := ["Fighter", "Monk", "Crusader", "Archer", "Rogue", "Sorcerer", "Priest", "Enchanter", "Evoker", "Cardinal", "Cabalist", "Berzerker", "Bard", "Fencer", "Marksman", "Assassin", "Dabbler", "Battle Mage", "Warlock", "Minstrel"]
const RACE_DESCRIPTORS := ["Short Race", "Elvish", "Half Breed", "Goblinoid", "Reptilian", "Nether Worldly", "Goodly Race", "Neutral Race", "Evil Race"]
const ITEM_CATEGORIES := [
	"Small Blunt Weapons", "Medium Blunt Weapons", "Large Blunt Weapons", "Very Small Bladed Weapons",
	"Small Bladed Weapons", "Medium Bladed Weapons", "Large Bladed Weapons", "Very Large Bladed Weapons",
	"Staffs", "Spears", "Pole Arms", "Ninja Style Weapons", "Normal Bows", "Cross Bows", "Darts",
	"Flasks Of Oil", "Throwing Knife", "Whips", "Quiver", "Waist / Belt", "Neck / Necklace", "Caps",
	"Soft Helm", "Small Helm", "Large Helm", "Small Shield", "Med Shield", "Large Shield", "Bracers",
	"Cloth Gloves", "Leather Gloves", "Metal Gloves", "Cloak / Cape", "Robe", "Padded Armor",
	"Leather Armor", "Chain Armor", "Banded Armor", "Plate Armor", "Soft Boots", "Hard Boots",
	"Throwing Hammer", "Throwing Stars", "Misc. Blunt Weapon", "Misc. Bladed Weapon", "Misc. Large Weapon",
	"Misc. Missile Weapon", "Misc. Item", "Scroll Case", "Broach / Pin", "Ring", "Potion",
	"Misc. Magic Item", "Special Object", "Ion Stone", "Book", "Scroll",
]
const CONDITIONS := [
	"Running", "Helpless", "Hindered", "Cursed", "Magic Aura", "Stupid", "Slow", "Shield From Hits",
	"Shield From Projectiles", "Poisoned", "Regenerating", "Fire Protection", "Cold Protection",
	"Electrical Protection", "Chemical Protection", "Mental Protection", "1st Level Spell Protection",
	"2nd Level Spell Protection", "3rd Level Spell Protection", "4th Level Spell Protection",
	"5th Level Spell Protection", "Strong", "Protection From Evil", "Speed", "Invisible", "Animated",
	"Stoned", "Blind", "Diseased", "Confused", "Reflect Spells", "Reflect Attacks", "Attack Bonus",
	"Absorb Spell Points", "Drain Spell Points", "Absorb Spell Points From Attacks", "Hinder Attack",
	"Hinder Defense", "Defense Bonus", "Silenced",
]


static func number(value: Variant) -> String:
	if value is float:
		var numeric := float(value)
		if is_equal_approx(numeric, round(numeric)):
			return str(int(round(numeric)))
	return str(value)


static func signed_number(value: Variant) -> String:
	var numeric := int(value)
	return "%+d" % numeric


static func enum_value(value: Variant, labels: Array, unresolved_noun: String) -> String:
	var index := int(value)
	if index >= 0 and index < labels.size():
		return "%d · %s" % [index, str(labels[index])]
	return "%d · unresolved %s" % [index, unresolved_noun]


static func labeled_rows(values: Array, labels: Array, signed := false, suffix := "") -> Array:
	var rows: Array = []
	for index in range(values.size()):
		var label := str(labels[index]) if index < labels.size() else "Unresolved source field %02d" % (index + 1)
		var rendered := signed_number(values[index]) if signed else number(values[index])
		rows.append("%s · %s%s" % [label, rendered, suffix])
	return rows


static func pair_rows(values: Array, labels: Array, left_label: String, right_label: String, signed := false) -> Array:
	var rows: Array = []
	for index in range(labels.size()):
		var left: Variant = values[index * 2] if index * 2 < values.size() else 0
		var right: Variant = values[index * 2 + 1] if index * 2 + 1 < values.size() else 0
		var left_text := signed_number(left) if signed else number(left)
		var right_text := signed_number(right) if signed else number(right)
		rows.append("%s · %s %s · %s %s" % [str(labels[index]), left_label, left_text, right_label, right_text])
	return rows


static func named_identity(identity: Variant, prefix: String, names: Array) -> String:
	var source := str(identity)
	var native_id := source.get_slice(".", source.get_slice_count(".") - 1).to_int()
	if native_id > 0 and native_id <= names.size():
		return "%s %02d · %s" % [prefix, native_id, str(names[native_id - 1])]
	return "%s %02d · name unavailable in projection" % [prefix, native_id]


static func identity_rows(values: Array, prefix: String, names: Array) -> Array:
	var rows: Array = []
	for value in values:
		rows.append(named_identity(value, prefix, names))
	return rows


static func item_identity_rows(values: Array) -> Array:
	var rows: Array = []
	for value in values:
		var source := str(value)
		var native_id := source.get_slice(".", source.get_slice_count(".") - 1).to_int()
		rows.append("Item %d · name unavailable in this projection" % native_id)
	return rows


static func bitset_rows(words: Array, labels: Array) -> Array:
	var rows: Array = []
	for index in range(labels.size()):
		var word_index := int(index / 32)
		if word_index < words.size() and (int(words[word_index]) & (1 << (index % 32))) != 0:
			rows.append(str(labels[index]))
	for word_index in range(words.size()):
		var known_bits := clampi(labels.size() - word_index * 32, 0, 32)
		var known_mask := (1 << known_bits) - 1 if known_bits < 32 else 0xffffffff
		var unresolved := (int(words[word_index]) & 0xffffffff) & ~known_mask
		if unresolved != 0:
			rows.append("Unresolved source bits · word %d · 0x%08X" % [word_index + 1, unresolved])
	return rows


static func compact_descriptor(value: Variant) -> String:
	var rows := bitset_rows([value], RACE_DESCRIPTORS)
	return "None" if rows.is_empty() else ", ".join(rows)
