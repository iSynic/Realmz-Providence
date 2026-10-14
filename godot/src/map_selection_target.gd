class_name ProvidenceMapSelectionTarget
extends RefCounted

enum Kind { CELL, ACTION_POINT, RANDOM_RECTANGLE, PLAYER_MAP }

var kind: Kind
var identity := ""
var map_identity := ""
var cell := Vector2i(-1, -1)
var slot := -1
var caption := ""


static func create(type: Kind, id: String, map: String, coordinate: Vector2i, label: String, index := -1) -> ProvidenceMapSelectionTarget:
	var result := ProvidenceMapSelectionTarget.new()
	result.kind = type; result.identity = id; result.map_identity = map
	result.cell = coordinate; result.caption = label; result.slot = index
	return result
