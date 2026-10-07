extends RefCounted

const Navigation = preload("res://src/source_navigation.gd")

static func describe(reference: Dictionary) -> String:
	var source := str(reference.get("source",""))
	var field := str(reference.get("field",""))
	var kind := source.get_slice(":",0)
	var name: String = {"extra-action-point":"XAP","action-point":"Action Point","simple-encounter":"Simple Encounter","complex-encounter":"Complex Encounter","rogue-encounter":"Rogue Encounter","timed-encounter":"Timed Encounter","battle":"Battle","monster":"Monster","shop":"Shop","treasure":"Treasure","player-map":"Player Map"}.get(kind,source)
	if name != source: name += " %d" % Navigation.last_integer(source)
	var result := RegEx.new()
	result.compile("results\\[(\\d+)\\]")
	var matched := result.search(field)
	if matched != null: name += " · Result %d" % (int(matched.get_string(1))+1)
	var slot := Navigation.action_slot(field)
	if slot >= 0: name += " · Step %d" % (slot%8+1)
	else: name += " · " + field.replace("."," · ")
	return name
