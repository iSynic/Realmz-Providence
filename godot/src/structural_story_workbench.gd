class_name ProvidenceStructuralStoryWorkbench
extends Control

@export var route_id := ""
@export_multiline var disabled_reason := "This route is visible for donor fidelity; bounded projection and edit commands are not available yet."


func _ready() -> void:
	var reason := find_child("DisabledReason", true, false) as Label
	if reason != null:
		reason.text = disabled_reason
		reason.tooltip_text = disabled_reason


func route_identity() -> String:
	return route_id


func command_state(_command_id: String) -> String:
	return "visible-disabled"
