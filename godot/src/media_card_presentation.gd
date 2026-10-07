extends RefCounted


static func caption(row: Dictionary, scope := "") -> String:
	var name := str(row.get("name", row.get("label", "Unnamed media")))
	var key: Dictionary = row.get("classicResource") if row.get("classicResource") is Dictionary else {}
	var kind := str(row.get("kind", ""))
	if kind == "music":
		var slot := int(row.get("slot", key.get("resourceId", 0)))
		if row.get("emptySlot", false): return name + " · " + ("Restore a supported MOD" if row.get("slotStatus", "") != "empty" else "Import Music…")
		return ("Custom %d · " % slot if scope == "scenario" else "") + name + " · Standard MOD"
	var family := str({"text-resource":"TEXT", "text-style-resource":"Style", "special-land-tile":"Tile", "combat-icon":"Artwork"}.get(kind, kind.capitalize()))
	var detail := family + (" %d" % int(key.resourceId) if key.has("resourceId") else "")
	if row.has("usedBy"): detail += " · %d %s" % [int(row.usedBy), "use" if int(row.usedBy) == 1 else "uses"]
	elif row.get("ownership") == "supplied": detail += " · Protected"
	elif scope == "stock": detail += " · Stock"
	else: detail += " · Ready" if row.get("prepared", false) else " · Original"
	return name + "\n" + detail


static func color(row: Dictionary, control: Control) -> Color:
	var role := "ItemHeading"
	match str(row.get("kind", "")):
		"text-resource", "text-style-resource", "music": role = "ItemRestrictionsHeading"
		"sound": role = "ItemEquipmentHeading"
		"special-land-tile": role = "ItemSpecialHeading"
	return control.get_theme_color("font_color", role)
