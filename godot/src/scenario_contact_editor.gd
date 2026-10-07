extends ProvidenceScenarioSectionEditor

const FIELDS := {"ContactTitle": "title", "ContactVersion": "version", "ContactDate": "date",
	"ContactAuthor": "author", "ContactEmail": "email", "ContactWeb": "web", "ContactFee": "fee"}


func editing_nodes() -> Array:
	var fields: Array = []
	for name in FIELDS: fields.append(text_field(name))
	fields.append(text_editor("ContactDescription"))
	return fields


func render_projection(result: Dictionary) -> void:
	var contact: Dictionary = result.get("contact", {})
	for name in FIELDS: text_field(name).text = str(contact.get(FIELDS[name], ""))
	text_editor("ContactDescription").text = str(contact.get("description", ""))
	find_child("SourceEvidence", true, false).text = "Contact ownership: %s · Data CI %s" % [str(result.get("provenance", "absent")), "retained" if result.get("sourcePresent", false) else "not present"]


func draft_params() -> Dictionary:
	var contact := {}
	for name in FIELDS: contact[FIELDS[name]] = text_field(name).text
	contact["description"] = text_editor("ContactDescription").text
	return {"contact": contact}
