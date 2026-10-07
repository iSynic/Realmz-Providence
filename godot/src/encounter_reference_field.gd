class_name ProvidenceEncounterReferenceField
extends HBoxContainer

signal choose_requested(field: ProvidenceEncounterReferenceField)
signal open_requested(field: ProvidenceEncounterReferenceField)
signal preview_requested(field: ProvidenceEncounterReferenceField)
signal value_requested(field: ProvidenceEncounterReferenceField, next: int)

@export var target_kind := "message"
@export var field_key := ""
@export var author_label := ""
@export var none_value := 0
var value := 0
var target: Dictionary = {}


func _ready() -> void:
	$Choose.pressed.connect(func(): choose_requested.emit(self))
	$Open.pressed.connect(func():
		if target_kind == "sound": preview_requested.emit(self)
		else: open_requested.emit(self))
	set_value(value)
	$Behavior.toggled.connect(func(enabled): value_requested.emit(self, -absi(value) if enabled else absi(value)))


func set_value(next: int, resolved: Dictionary = {}) -> void:
	value = next
	target = resolved.duplicate(true)
	var empty := value == none_value
	var label := str(target.get("detail", target.get("label", ""))) if target_kind == "message" else str(target.get("label", ""))
	label = label.replace("\n", " ").strip_edges()
	$Choose.text = "None · Find…" if empty else ("%d · %s" % [value, label] if not label.is_empty() else "%d · Missing · Find…" % value)
	if target_kind == "sound" and not empty and not target.is_empty(): $Choose.text = "#%d" % value
	$Choose.tooltip_text = str(target.preview) if target.get("preview") != null else str(target.get("detail", label))
	$Open.text = "▶" if target_kind == "sound" else "↗"
	$Open.disabled = empty or target.is_empty()
	$Open.tooltip_text = "Choose a resolvable target first." if $Open.disabled else ("Audition sound" if target_kind == "sound" else "Open exact reference")
	$Behavior.visible = supports_sign() and not empty
	$Behavior.set_pressed_no_signal(value < 0)
	$Behavior.text = "W" if target_kind == "sound" else "N"
	$Behavior.tooltip_text = "Wait for sound to finish" if target_kind == "sound" else "Display message without waiting for acknowledgement"
	$Choose.tooltip_text += "\n" + $Behavior.tooltip_text + (": enabled" if value < 0 else ": disabled") if supports_sign() else ""


func supports_sign() -> bool: return target_kind in ["message", "sound"]
func selected_value(next: int) -> int: return -absi(next) if supports_sign() and value < 0 and next > 0 else next
func resolved_value() -> int: return absi(value) if supports_sign() else value


func identity() -> String: return str(target.get("identity", ""))
