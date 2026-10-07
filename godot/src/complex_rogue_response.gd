extends RefCounted


static func render(document: Dictionary, enabled: CheckBox, choice: Button, open: Button, summary: Label) -> void:
	var id := int(document.get("thiefSuccess", -1))
	var preview: Dictionary = document.get("roguePreview") if document.get("roguePreview") is Dictionary else {}
	choice.text = "Rogue Encounter %d" % id if id >= 0 else "Choose Rogue Encounter…"
	open.disabled = not enabled.button_pressed or id < 0 or preview.is_empty()
	if not enabled.button_pressed: summary.text = "Disabled"
	elif preview.is_empty(): summary.text = "Rogue Encounter %d is unavailable; choose a target." % id
	else:
		var results: Array[String] = []
		for result in preview.get("returnedResults", []): results.append(str(result))
		summary.text = str(preview.get("summary", "%d enabled actions · %s" % [int(preview.get("enabledActions",0)), "Results " + ", ".join(results) if not results.is_empty() else "No result routes"]))
