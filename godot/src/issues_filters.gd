extends RefCounted

# View-only rules. They are reset when a project is attached and never saved.
var enabled := true
var hide_uncalled_warnings := false
var rules: Array[Dictionary] = []


func reset() -> void:
	enabled = true
	hide_uncalled_warnings = false
	rules.clear()


func add(finding: Dictionary, by_type: bool) -> void:
	if finding.is_empty(): return
	var key := {"code": finding.code} if by_type else {"code": finding.code, "entity": finding.get("entity"), "field": finding.get("field")}
	for rule in rules:
		if rule.key == key:
			rule.enabled = true
			enabled = true
			return
	var type_name := preload("res://src/issues_presentation.gd").type_label(str(finding.code))
	var label := type_name if by_type else "%s · %s · %s" % [preload("res://src/issues_presentation.gd").source_label(finding), type_name, str(finding.get("field", ""))]
	rules.append({"key": key, "label": label, "enabled": true, "type": by_type})
	enabled = true


func parameters() -> Dictionary:
	var codes: Array = []
	var findings: Array = []
	if enabled:
		for rule in rules:
			if not rule.enabled: continue
			if rule.type: codes.append(rule.key.code)
			else: findings.append(rule.key.duplicate())
	return {"hideUncalledWarnings": hide_uncalled_warnings, "excludedCodes": codes, "excludedFindings": findings}
