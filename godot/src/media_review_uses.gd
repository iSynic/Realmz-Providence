extends VBoxContainer

signal source_requested(reference: Dictionary)
signal refresh_requested
var _commands: RefCounted
var _identities: Array = []
var _revision := 0
var _offset := 0
var _generation := 0
var _guard: Callable
var _rows: Array = []
var _maximum := 0


func _ready() -> void:
	$Heading/Previous.pressed.connect(func(): await _load(maxi(0, _offset - 32)))
	$Heading/Next.pressed.connect(func(): await _load(_offset + 32))
	$Heading/Refresh.pressed.connect(func(): refresh_requested.emit())
	$Heading/Open.pressed.connect(_open_selected)
	$Fields.item_selected.connect(func(_index): $Heading/Open.disabled = false)


func clear_review() -> void:
	_generation += 1
	_rows.clear(); $Fields.clear(); hide()


func show_review(commands: RefCounted, media: Dictionary, revision: int, guard: Callable) -> void:
	_generation += 1
	_commands = commands; _revision = revision; _guard = guard
	_identities.clear()
	for key in ["primary", "companion"]:
		if media.get(key) is Dictionary: _identities.append(str(media[key].identity))
	show()
	await _load(0)


func _load(offset: int) -> void:
	var generation := _generation
	var rows: Array = []
	var total := 0
	var maximum := 0
	$Heading/Open.disabled = true
	for identity: String in _identities:
		var response: Dictionary = await _commands.prepare("project-asset.open", {"identity": identity, "expectedRevision": _revision, "offset": offset, "limit": 32})
		if generation != _generation or not _guard.call(): return
		if not response.get("ok", false):
			$Heading/Count.text = str(response.get("error", "Affected fields could not load.")); $Fields.clear(); _rows.clear(); return
		var result: Dictionary = response.result
		var count := int(result.get("paging", {}).get("usedByTotal", 0))
		total += count; maximum = maxi(maximum, count)
		for reference: Dictionary in result.get("useTargets", []):
			var row := reference.duplicate(true)
			row["assetIdentity"] = identity
			rows.append(row)
	_rows = rows; _offset = offset; $Fields.clear()
	_maximum = maximum
	for row: Dictionary in rows:
		$Fields.add_item("%s · %s → %s" % [str(row.get("label", row.source)), str(row.field), str(row.assetIdentity)])
	$Heading/Count.text = "%d affected fields · page %d of %d" % [total, offset / 32 + 1, maxi(1, ceili(float(maximum) / 32))]
	$Heading/Previous.disabled = offset == 0
	$Heading/Next.disabled = offset + 32 >= maximum


func set_locked(locked: bool) -> void:
	for node: Button in [$Heading/Previous, $Heading/Next, $Heading/Open, $Heading/Refresh]: node.disabled = locked
	if not locked:
		$Heading/Previous.disabled = _offset == 0
		$Heading/Next.disabled = _offset + 32 >= _maximum
		$Heading/Open.disabled = $Fields.get_selected_items().is_empty()


func _open_selected() -> void:
	var selected: PackedInt32Array = $Fields.get_selected_items()
	if selected.is_empty(): return
	var row: Dictionary = _rows[selected[0]].duplicate(true)
	var generation := _generation
	var response: Dictionary = await _commands.prepare("project-asset.open", {"identity":row.assetIdentity,"expectedRevision":_revision,"offset":_offset,"limit":32})
	if generation != _generation or not _guard.call(): return
	if not response.get("ok", false): $Heading/Count.text = str(response.get("error", "Refresh the affected fields.")); return
	for current: Dictionary in response.result.get("useTargets", []):
		if current.source == row.source and current.field == row.field:
			source_requested.emit(current); return
	$Heading/Count.text = "The owning field changed. Refresh uses before opening."
