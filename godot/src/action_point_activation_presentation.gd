extends RefCounted


static func summary(facts: Dictionary) -> String:
	if facts.is_empty(): return "Activation details unavailable"
	var marker: Variant = facts.get("entryMarker")
	var lines: Array[String] = [str(facts.get("location", "Unplaced"))]
	lines.append("%d%% chance%s · Entry marker %s" % [int(facts.get("chancePercent", 0)), " · dormant" if not facts.get("chancePositive", false) else "", "unavailable" if marker == null else "present" if marker else "absent"])
	if str(facts.get("secret", "none")) != "none": lines.append("%s secret" % str(facts.secret).capitalize())
	if facts.get("shadowedBy") != null: lines.append("Earlier AP at this coordinate takes precedence.")
	var checks: Array = facts.get("checkSlots", [])
	var unknown: Array = facts.get("unknownSlots", [])
	if not checks.is_empty(): lines.append("Check / branch steps: " + slots(checks))
	if not unknown.is_empty(): lines.append("Unknown instructions: " + slots(unknown))
	return "\n".join(lines)


static func slots(values: Array) -> String:
	var labels: Array[String] = []
	for value in values: labels.append(str(int(value) + 1))
	return ", ".join(labels)


static func matches(facts: Dictionary, filters: Dictionary) -> bool:
	for key in filters:
		var value := str(filters[key])
		if value == "all": continue
		if facts.is_empty(): return false
		match key:
			"chance":
				if bool(facts.get("chancePositive", false)) != (value == "positive"): return false
			"marker":
				var marker: Variant = facts.get("entryMarker")
				if value == "unavailable" and marker != null: return false
				if value != "unavailable" and (marker == null or bool(marker) != (value == "present")): return false
			"precedence":
				if value == "first" and not facts.get("placed", false): return false
				if (facts.get("shadowedBy") != null) != (value == "shadowed"): return false
			"checks":
				if (facts.get("checkSlots", []) if value == "detected" else facts.get("unknownSlots", [])).is_empty(): return false
	return true
