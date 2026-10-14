extends PopupPanel

signal chosen(target: ProvidenceMapSelectionTarget)
var _targets: Array = []


func _ready() -> void:
	%Candidates.item_activated.connect(_choose)
	%SelectCandidate.pressed.connect(func():
		var indexes: PackedInt32Array = %Candidates.get_selected_items()
		if not indexes.is_empty(): _choose(indexes[0]))
	%CancelSelection.pressed.connect(hide)
	popup_hide.connect(func():
		# A previous hide notification must not clear a newly presented chooser.
		if not visible: _targets.clear())


func present(targets: Array, cell: ProvidenceMapSelectionTarget, point: Vector2i) -> void:
	_targets = targets.duplicate(); _targets.append(cell)
	%Heading.text = "Select at cell %d, %d" % [cell.cell.x, cell.cell.y]
	%Candidates.clear()
	for target: ProvidenceMapSelectionTarget in _targets: %Candidates.add_item(target.caption)
	position = point; size = Vector2i(448, mini(360, 124 + 52 * _targets.size()))
	popup()
	%Candidates.select(0); %Candidates.focus_selected()


func _choose(index: int) -> void:
	if index < 0 or index >= _targets.size(): return
	var target: ProvidenceMapSelectionTarget = _targets[index]
	hide(); chosen.emit(target)
