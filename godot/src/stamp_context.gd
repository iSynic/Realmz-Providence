extends VBoxContainer

signal choose_requested
signal retry_requested
signal discard_requested
signal recovery_requested


func _ready() -> void:
	%ChooseStamp.pressed.connect(choose_requested.emit)
	%RetryPlacement.pressed.connect(retry_requested.emit)
	%DiscardPlacement.pressed.connect(discard_requested.emit)
	%CheckPlacement.pressed.connect(recovery_requested.emit)


func present(resource: Dictionary, presentation: Dictionary, projection: Dictionary, atlas: Control) -> void:
	%StampName.text = str(resource.name)
	%StampDimensions.text = "%d × %d · %d %s" % [int(resource.width), int(resource.height), resource.cells.size(), "cell" if resource.cells.size() == 1 else "cells"]
	%StampArtwork.set_resource(resource, projection, presentation.get("renderCells", []), atlas, presentation.get("specialPreviews", []))
	if resource.levelType == "dungeon":
		%StampOwnership.text = "Dungeon AP, Note and secret ownership stays in place."
	elif resource.cells.any(func(cell): return int(cell.tile) < 0):
		%StampOwnership.text = "Selected artwork and its cell encoding are replaced. Action Point records stay in place."
	else:
		%StampOwnership.text = "Selected artwork is replaced. Ordinary marker bands and Action Point records stay in place."
	set_state({})


func set_status(message: String) -> void:
	%PlacementStatus.text = message


func set_state(state: Dictionary) -> void:
	var busy: bool = state.get("busy", false)
	var unknown: bool = state.get("unknown", false)
	var retained: bool = state.get("retained", false)
	%ChooseStamp.disabled = busy or unknown or retained
	%RetryPlacement.visible = retained and not unknown
	%DiscardPlacement.visible = retained and not unknown
	%RetryPlacement.disabled = busy
	%DiscardPlacement.disabled = busy
	%CheckPlacement.visible = unknown
	%CheckPlacement.disabled = busy
