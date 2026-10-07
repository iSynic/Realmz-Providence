class_name ProvidencePublishReadiness
extends RefCounted

static func is_ready(readiness: Dictionary) -> bool:
	return str(readiness.get("status", "")).to_lower() in ["ready", "ready-with-warnings"]

static func has_warnings(readiness: Dictionary) -> bool:
	return str(readiness.get("status", "")).to_lower() == "ready-with-warnings" or int(readiness.get("warningCount",0)) > 0

static func warning_text(readiness: Dictionary) -> String:
	var lines: Array[String] = []
	for warning: Dictionary in (readiness.get("warnings", []) as Array).slice(0,4):
		lines.append(str(warning.get("message", "Review this warning in Validate.")))
	var count := int(readiness.get("warningCount",lines.size()))
	return "" if count == 0 else "[color=#e5b567]%d warning%s · review in Validate\n%s[/color]" % [count,"" if count == 1 else "s","\n".join(lines)]
