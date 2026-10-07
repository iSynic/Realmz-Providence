class_name ProvidenceDocumentChanges
extends RefCounted

const Interests = preload("res://src/document_interests.gd")

# A stale marker is a request to refresh on activation, not a second copy of authored state.
var _stale: Dictionary = {}
var _interests: Dictionary = {}
var _next_token := 0


func register_document(identity: String, families: Array = []) -> void:
	_interests[identity] = families
	_mark_stale(identity)


func invalidate(projection: Dictionary, project_id: String) -> void:
	var identities: Array = projection.get("changedEntities", []).duplicate()
	identities.append_array(projection.get("affectedEntities", []))
	var families: Array = identities.map(func(identity): return Interests.family(str(identity)))
	var all_documents: bool = project_id in identities or projection.get("truncated", false) or "" in families
	for document in _interests:
		var interests: Array = _interests[document]
		if all_documents or interests.is_empty() or interests.any(func(family): return family in families):
			_mark_stale(document)


func needs_refresh(identity: String) -> bool:
	return _stale.has(identity)


func refresh_token(identity: String) -> int:
	return int(_stale.get(identity, -1))


func refreshed(identity: String, token: int = -1) -> void:
	if token >= 0 and refresh_token(identity) != token: return
	_stale.erase(identity)


func clear() -> void:
	_stale.clear()
	for identity in _interests: _mark_stale(identity)


func _mark_stale(identity: String) -> void:
	_next_token += 1
	_stale[identity] = _next_token
