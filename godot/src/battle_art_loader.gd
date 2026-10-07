extends RefCounted

var _cache: Dictionary = {}
var _revision := -1


func clear() -> void:
	_cache.clear()
	_revision = -1


func load(operation: ProvidenceEditorOperation, view: ProvidenceBattleEditor, current: Callable) -> Dictionary:
	if _revision != view.draft.revision:
		clear()
		_revision = view.draft.revision
		view.clear_art()
	for icon_id in view.visible_icon_ids():
		if not current.call(): return {"ok": false, "error": "The Battle destination changed."}
		if _cache.has(icon_id): view.receive_art(icon_id, _cache[icon_id]); continue
		var response := await operation.request("monster-appearance.open", {"iconId": icon_id})
		if not current.call(): return {"ok": false, "error": "The Battle destination changed."}
		if response.get("outcomeUnknown", false): return response
		var result: Dictionary = response.get("result", {})
		var projection := {"texture": preload("res://src/projected_image.gd").decode(result.get("base", {})),
			"facingTexture": preload("res://src/projected_image.gd").decode(result.get("facing", {})),
			"reason": str(response.get("error", ""))}
		if projection.texture == null or projection.facingTexture == null:
			projection.reason = "Artwork unavailable for appearance %d. Open Monster to choose its appearance." % icon_id
		if _cache.size() >= 128: _cache.erase(_cache.keys()[0])
		_cache[icon_id] = projection
		view.receive_art(icon_id, projection)
	return {"ok": true}
