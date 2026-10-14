extends PanelContainer

signal changed
signal earlier_requested(identity: String)
signal secret_requested
var _facts := {}
var _coordinate: Variant
var _moved := false
var _locked := false


func _ready() -> void:
	%EntryMarker.toggled.connect(func(_enabled): _render(); changed.emit())
	%EarlierAP.pressed.connect(func(): earlier_requested.emit(str(_facts.get("shadowedBy", ""))))
	%SecretControls.pressed.connect(secret_requested.emit)


func set_document(document: Dictionary) -> void:
	_facts = document.get("activation", {}).duplicate(true)
	_coordinate = document.get("coordinate")
	%EntryMarker.set_pressed_no_signal(_facts.get("entryMarker") == true)
	_moved = false
	_render()


func update_placement(coordinate: Variant, locked: bool) -> void:
	_moved = not preload("res://src/document_value_equality.gd").equal(coordinate, _coordinate)
	_locked = locked
	_render()


func draft_value() -> Variant:
	if _moved or not _facts.get("markerEditable", false): return null
	return %EntryMarker.button_pressed if %EntryMarker.button_pressed != (_facts.get("entryMarker") == true) else null


func discard() -> void:
	%EntryMarker.set_pressed_no_signal(_facts.get("entryMarker") == true)
	_render()


func acknowledge(value: Variant, chance_percent: int) -> void:
	if value != null: _facts["entryMarker"] = value
	_facts["chancePercent"] = chance_percent
	_facts["chancePositive"] = chance_percent > 0
	_render()


func _render() -> void:
	%EntryMarker.disabled = _locked or _moved or not _facts.get("markerEditable", false)
	%EntryMarker.tooltip_text = str(_facts.get("markerReason", ""))
	%EntryState.text = _state_text()
	%EntryState.tooltip_text = preload("res://src/action_point_activation_presentation.gd").summary(_facts)
	%EarlierAP.visible = not _moved and _facts.get("shadowedBy") != null
	%EarlierAP.disabled = _locked
	%SecretControls.visible = not _moved and str(_facts.get("secret", "none")) != "none" and not _facts.get("markerEditable", false)
	%SecretControls.disabled = _locked


func _state_text() -> String:
	if _moved: return "Moving this AP marks the destination on Apply. Apply before changing its marker."
	if not _facts.get("markerEditable", false): return str(_facts.get("markerReason", "Entry marker unavailable."))
	var pending: Variant = draft_value()
	if pending != null:
		return "Draft: marker %s → %s on Apply." % ["present" if _facts.get("entryMarker") == true else "absent", "present" if pending else "absent"]
	var chance := "Applied state · chance %d%%%s." % [int(_facts.get("chancePercent", 0)), " (dormant)" if not _facts.get("chancePositive", false) else ""]
	return chance + " Chance and step edits preserve this tile."
