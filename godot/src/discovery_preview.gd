extends RefCounted

static func title(record: Dictionary) -> String:
	var name := str(record.get("name", ""))
	if name == "%s %s" % [str(record.get("kind", "")).replace("-", " "), record.get("nativeId", "")]: return name.capitalize()
	return name if not name.is_empty() else "%s %s" % [str(record.get("kind", "")).capitalize(), record.get("nativeId", "")]

static func record_details(detail: RichTextLabel, result: Dictionary) -> void:
	detail.clear()
	for field: Dictionary in result.get("fields", []):
		if field.field in ["identity", "nativeId", "authored"]: continue
		detail.push_bold()
		detail.add_text(field_label(str(field.field)) + "\n")
		detail.pop()
		detail.add_text(str(field.text) + "\n")
		if field.get("truncated", false): detail.add_text("Preview fragment · Open record for full content\n")
		detail.add_text("\n")
	var hidden := int(result.get("fieldsTotal", 0)) - (result.get("fields", []) as Array).size()
	if hidden > 0: detail.add_text("%d additional fields · Open record to inspect\n" % hidden)

static func link_details(detail: RichTextLabel, link: Dictionary) -> void:
	detail.clear()
	var available := {"resolved":"Target available", "stock-fallback":"Stock target available", "missing":"Target unavailable · its source identity is preserved", "ambiguous":"Ambiguous target · choose an exact resource before continuing"}
	var activity := str(link.get("activity", ""))
	if activity == "authored": activity = ""
	elif activity.begins_with("authored possible path"): activity = "Possible authored path; runtime conditions determine whether it runs."
	elif activity.begins_with("contextual:"): activity = activity.trim_prefix("contextual:").strip_edges().capitalize()
	for pair in [["WHAT THIS CONNECTS", "%s → %s" % [link.meaning, link.targetLabel]], ["OWNING CONTROL", field_label(str(link.field))], ["TARGET", available.get(link.resolution, "Target availability is unknown")], ["PATH CONTEXT", activity], ["ENTRY POINT", link.get("rootReason", "")]]:
		if pair[1] == null or str(pair[1]).is_empty(): continue
		detail.push_bold()
		detail.add_text(str(pair[0]) + "\n")
		detail.pop()
		detail.add_text(str(pair[1]) + "\n\n")
	if link.get("targetIdentity") == null and link.targetKind == "monster":
		detail.add_text("Runtime difficulty chooses the monster set. Choose a variant to inspect its definition.\n")
	if link.get("availabilityReason") != null: detail.add_text(str(link.availabilityReason) + "\n")
	if str(link.field).begins_with("eligibleRaceIds[") or str(link.field).begins_with("eligibleCasteIds["):
		detail.add_text("This permission links a Race and Caste; it is not an execution call. Open its owning control or trace that owner explicitly to follow its other uses.\n")

static func field_label(path: String) -> String:
	if path.begins_with("startingItemIds["): return "Starting equipment · exact owning item control"
	if path.begins_with("eligibleRaceIds["): return "Permitted Race combination"
	if path.begins_with("eligibleCasteIds["): return "Permitted Caste combination"
	var names := {"target":"Action destination", "testA":"Quest condition", "testB":"Comparison value", "deathMacro":"Death macro", "promptMessage":"Prompt string", "promptMessageNativeId":"Prompt string", "thiefSuccess":"Calling Rogue Encounter", "actionResult":"Physical action outcome", "wordResult":"Typed answer outcome", "spellResults":"Spell outcomes", "itemResults":"Item outcomes", "picture":"Map picture", "scrollingText":"Scrolling text"}
	var leaf := path.get_slice(".", path.get_slice_count(".") - 1)
	if names.has(leaf): return names[leaf]
	var regex := RegEx.new()
	regex.compile("^([a-zA-Z]+)\\[(\\d+)\\]$")
	var match := regex.search(leaf)
	if match != null: return "%s · slot %d" % [str(names.get(match.get_string(1), match.get_string(1).to_snake_case().capitalize())), int(match.get_string(2)) + 1]
	return leaf.to_snake_case().capitalize()

static func row(value: Dictionary, searching: bool) -> String:
	if searching:
		return "%s\n%s" % [title(value.record), str(value.get("snippet", "")).replace("\n", " ").replace("\r", " ")]
	var link: Dictionary = value.get("link", value)
	return "%s\n%s → %s%s%s" % [link.sourceLabel, link.meaning, link.targetLabel, " · cycle" if value.get("cycle", false) else "", " · depth frontier" if value.get("depthLimited", false) else ""]
