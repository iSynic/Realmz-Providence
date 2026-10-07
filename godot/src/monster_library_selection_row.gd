extends HBoxContainer


func clear_source() -> void:
	remove_meta("identity")
	$Facts/Name.text = ""
	$Facts/Name.tooltip_text = ""
	$Facts/Ownership.text = ""
	$Target.text = ""


func bind_source(item: Dictionary) -> void:
	set_meta("identity", str(item.get("identity", "")))
	$Facts/Name.text = str(item.get("label", ""))
	$Facts/Name.tooltip_text = "%s · %s · ID %d" % [item.get("label", ""), item.get("ownership", ""), item.get("preferredScenarioMonsterId", -1)]
	$Facts/Ownership.text = "%s · ID %d · HD %d · armor %d" % ["Protected Built-in Reference" if item.get("ownership") == "built-in" else "Custom Library Entry", item.get("preferredScenarioMonsterId", -1), item.get("hitDice", 0), item.get("armor", 0)]
	$Target.text = "Destination plan unavailable"
