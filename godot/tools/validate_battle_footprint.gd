extends SceneTree

const Presentation = preload("res://src/battle_monster_presentation.gd")
var _failed := false


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var wide := ImageTexture.create_from_image(Image.create(64, 32, false, Image.FORMAT_RGBA8))
	var square := ImageTexture.create_from_image(Image.create(32, 32, false, Image.FORMAT_RGBA8))
	var expected := [Vector2i(1, 1), Vector2i(1, 2), Vector2i(2, 1), Vector2i(2, 2)]
	for value in 4:
		_check(Presentation.footprint({"size": value}) == expected[value],
			"Size %d occupancy differs from Castle" % value)
	_check(Presentation.footprint({"size": 0, "typeFlags": [0, 0, 0, 0, 0, 0, 1]}) == Vector2i.ONE,
		"A trait flag overrode the native size")
	_check(Presentation.footprint({"size": 4}) == Vector2i(2, 1),
		"Preserved out-of-range size lost Castle's width/height predicates")
	var canvas := ProvidenceBattleCanvas.new()
	canvas.size = Vector2(650, 650)
	root.add_child(canvas)
	var grid: Array = []; grid.resize(169); grid.fill(0); grid[14] = 6
	canvas.bind(grid, {6: {"monster": {"size": 0, "iconId": 398}}})
	for value in 4:
		canvas.monsters[6].monster.size = value
		for texture in [null, wide, square]:
			canvas.receive_art(398, {"texture": texture})
			_check(canvas.footprint(6) == expected[value], "Artwork changed Size %d canvas occupancy" % value)
	canvas.monsters[6].monster.size = 0
	canvas.art.clear()
	var before := canvas.rect_for_slot(14, canvas.footprint(6))
	_check(canvas.visible_anchor(1) == 1, "Larva occupied its left neighbor before art loaded")
	canvas.receive_art(398, {"texture": wide})
	_check(canvas.footprint(6) == Vector2i.ONE and canvas.rect_for_slot(14, canvas.footprint(6)) == before,
		"Loading Larva's wide icon expanded its drawing rectangle")
	_check(canvas.visible_anchor(1) == 1 and canvas.visible_anchor(14) == 14,
		"Loading artwork changed selection/erase hit areas")
	_check(canvas._clamped_anchor(0, canvas.footprint(6)) == 0,
		"Size-zero placement was moved away from the first column")
	canvas.monsters[6].monster.size = 2
	_check(canvas.visible_anchor(1) == 14 and canvas._clamped_anchor(0, canvas.footprint(6)) == 13,
		"Native wide occupancy or lower-right anchoring regressed")
	canvas.queue_free()
	if not _failed:
		print("PROVIDENCE_BATTLE_FOOTPRINT_OK sizes=0..3 texture-independent larva-size-zero async-art hit-areas anchors imported-predicates")
	quit(1 if _failed else 0)


func _check(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error("PROVIDENCE_BATTLE_FOOTPRINT_FAILED: " + message)
