extends VBoxContainer

signal feature_changed(primitive: String, enabled: bool)
signal apply_requested
signal discard_requested
signal clear_requested
signal recovery_requested

const FIELDS := {"wall": "Wall", "horizontal-door": "HorizontalDoor", "vertical-door": "VerticalDoor",
	"stairs": "Stairs", "column": "Column", "visible-arch": "Archway", "allow-move-north": "North",
	"allow-move-east": "East", "allow-move-south": "South", "allow-move-west": "West",
	"unmapped": "Unmapped", "no-wall-in-battle": "NoWall"}


func _ready() -> void:
	for primitive: String in FIELDS:
		get_node("%" + FIELDS[primitive]).toggled.connect(func(enabled): feature_changed.emit(primitive, enabled))
	%ApplyDungeonPrimitive.pressed.connect(apply_requested.emit)
	%DiscardFeatures.pressed.connect(discard_requested.emit)
	%ClearFeatures.pressed.connect(clear_requested.emit)
	%ReconcileFeatures.pressed.connect(recovery_requested.emit)


func present(features: Dictionary, dirty: bool, locked: bool, recovery: bool, count: int, drawing := false) -> void:
	for primitive: String in FIELDS:
		var checkbox: CheckBox = get_node("%" + FIELDS[primitive])
		checkbox.disabled = locked or not features.has(primitive)
		checkbox.set_pressed_no_signal(features.get(primitive) == true)
		checkbox.text = str(checkbox.get_meta("label")) + (" · Mixed" if features.has(primitive) and features[primitive] == null else "")
	%ApplyDungeonPrimitive.disabled = locked or (count == 0 if drawing else not dirty)
	%ApplyDungeonPrimitive.text = "Apply to %d selected cells" % count if count > 1 else "Apply to selected cell"
	%DiscardFeatures.disabled = locked or not dirty
	%ClearFeatures.disabled = locked or count == 0
	%ReconcileFeatures.visible = recovery
	%ReconcileFeatures.disabled = locked and not recovery
	%SelectedDungeonCell.text = "Select a Dungeon cell" if count == 0 else ("%d selected cells · mixed values stay unchanged" % count if count > 1 else "Selected cell · local feature draft")
	if drawing: %SelectedDungeonCell.text = "Draw preset · sampled writable features" + (" · %d selected cells" % count if count > 0 else "")


func set_status(message: String, recovery := false) -> void:
	%FeatureStatus.text = message
	%ReconcileFeatures.visible = recovery


func set_atlas(projection: Dictionary) -> void:
	preload("res://src/dungeon_feature_previews.gd").apply(self, projection)


func field(primitive: String) -> CheckBox:
	return get_node("%" + FIELDS[primitive]) if FIELDS.has(primitive) else null
