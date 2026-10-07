extends HBoxContainer

signal remove_requested(identity: String)
signal destination_requested(identity: String, value: Variant)
signal input_changed

var _identity := ""
var _binding := false


func _ready() -> void:
	$Destination.text_changed.connect(func(_text): if not _binding: input_changed.emit())
	$Remove.pressed.connect(func(): if not _identity.is_empty(): remove_requested.emit(_identity))
	$Change.pressed.connect(func():
		if _identity.is_empty(): return
		var text: String = $Destination.text
		destination_requested.emit(_identity, int(text) if text.is_valid_int() else text))


func bind_selection(entry: Dictionary, removable: bool) -> void:
	_binding = true
	_identity = str(entry.get("identity", ""))
	$Source.text = str(entry.get("label", "Select an allocation"))
	$Destination.text = str(int(entry.targetId)) if entry.has("targetId") else ""
	$Remove.disabled = _identity.is_empty() or not removable
	$Change.disabled = _identity.is_empty()
	$Destination.editable = not _identity.is_empty()
	_binding = false


func set_locked(locked: bool) -> void:
	$Remove.disabled = locked or _identity.is_empty()
	$Change.disabled = locked or _identity.is_empty()
	$Destination.editable = not locked and not _identity.is_empty()
