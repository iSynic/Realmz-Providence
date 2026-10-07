extends "res://src/native_bridge.gd"
var calls: Array = []
var png := ""
var failed_method := ""
var paged_uses := false
var removable := false
var wrong_asset := false
var mixed_uses := false
var changed_use := false
var preview_payload: Dictionary = {}
var catalog_total := 1
func is_project_backed() -> bool:
	return true
func _request(method: String, params: Dictionary = {}) -> Dictionary:
	calls.append({"method": method, "params": params})
	if method == failed_method:
		return {"ok": false, "error": "Library temporarily unavailable"}
	if method == "session.describe":
		return {"ok": true, "result": {"revision": 7}}
	if method == "project-asset.open":
		return _project_asset_open(params)
	if method == "artwork.item-uses":
		assert(params.resourceId == 32000 and params.expectedRevision == 7 and params.limit == 32)
		if paged_uses:
			var rows: Array = []
			for index in range(int(params.get("offset", 0)), mini(33, int(params.get("offset", 0)) + 32)):
				rows.append({"identity": "classic.item.%d" % (800 + index), "classicId": 800 + index, "name": "Trail marker"})
			return {"ok": true, "result": {"items": rows, "truncated": int(params.get("offset", 0)) == 0}}
		return {"ok": true, "result": {"items": [{"identity": "classic.item.800", "classicId": 800, "name": "Trail marker", "recordIndex": 0}], "truncated": false}}
	if method == "artwork.check-copy-number":
		assert(params.expectedRevision == 7)
		if params.resourceId == 0:
			return {"ok": false, "error": "Choose a nonzero number."}
		if params.resourceId == 32000:
			return {"ok": true, "result": {"available": false, "itemUses": 2, "existing": {"label": "Trail marker", "identity": "existing", "previewCommand": "icon.preview"}}}
		return {"ok": true, "result": {"available": true}}
	if method == "reference-catalog.copy-icon":
		assert(params.identity == "bag-item" and params.resourceId == 30126 and params.expectedRevision == 7)
		return {"ok": true, "result": {"revision": 8}}
	if method == "personal-library.apply-item-artwork":
		assert(params.identity == "Personal Ruby" and params.recordIndex == 0 and params.expectedRevision == 7)
		assert(params.expectedLibraryRevision == 0 and params.resourceId == 30127)
		return {"ok": true, "result": {"revision": 8}}
	if method == "item.list":
		assert(params.scope == "scenario" and params.limit == 32)
		return {"ok": true, "result": {"revision": 7, "total": 1, "items": [{"identity": "classic.item.800", "classicId": 800, "recordIndex": 0, "name": "Ruby ring", "iconId": 0, "editable": true}]}}
	if method == "scenario-item.use-stock-artwork":
		assert(params.identity == "Stock Ruby" and params.expectedRevision == 7 and params.recordIndex == 0)
		return {"ok": true, "result": {"revision": 8}}
	if method == "scenario-item.use-scenario-artwork":
		assert(params.identity == "Scenario Ruby" and params.expectedRevision == 7 and params.recordIndex == 0)
		return {"ok": true, "result": {"revision": 8}}
	if method == "scenario-item.apply-library-artwork":
		assert(params.identity == "bag-item" and params.expectedRevision == 7 and params.recordIndex == 0)
		return {"ok": true, "result": {"revision": 8}}
	if method == "personal-library.describe":
		return {"ok": true, "result": {"configured": true, "revision": 0, "undo": 0, "redo": 0}}
	if method == "personal-library.collections":
		return {"ok": true, "result": {"revision": 0, "items": [], "total": 0}}
	if method.ends_with(".preview") or method in ["personal-library.preview-icon", "personal-library.open"]:
		if not preview_payload.is_empty():
			return {"ok": true, "result": preview_payload}
		return {"ok": true, "result": {"base64": png, "width": 1, "height": 1}}
	return _catalog_list(method, params)


func _catalog_list(method: String, params: Dictionary) -> Dictionary:
	var label := ""
	match method:
		"personal-library.list", "media.library.list":
			label = "Personal Ruby"
		"project-asset.list":
			label = "Scenario Ruby"
		"application-media.list":
			label = "Stock Ruby"
		"reference-catalog.list":
			label = params.get("kind", "")
		_:
			return {"ok": false, "error": "Unexpected command"}
	var rows: Array = []
	var offset := int(params.get("offset", 0))
	var total := 0 if params.get("query") == "no results" else catalog_total
	for index in range(offset, mini(total, offset + int(params.limit))):
		var row := {"identity": label if index == 0 else label + str(index), "label": label, "name": label, "kind": "icon", "resource": {"resourceId": -189}, "classicResource": {"resourceId": -189, "resourceType": "cicn"}, "removable": true, "width": 1, "height": 1, "previewCommand": "icon.preview"}
		if method in ["media.library.list", "personal-library.list"]:
			row["previewCommand"] = "personal-library.open"
			row["prepared"] = false
			row["collection"] = null
			if params.get("collection") in ["bag-item", "vault-icon"]:
				row["identity"] = params.collection
				row["ownership"] = "supplied"
				row["previewCommand"] = "reference-catalog.preview"
		rows.append(row)
	return {"ok": true, "result": {"revision": 7 if method == "project-asset.list" else 0, "items": rows, "offset": offset, "total": total, "truncated": offset + int(params.limit) < total}}


func _project_asset_open(params: Dictionary) -> Dictionary:
	if params.limit == 32:
		assert(params.expectedRevision == 7)
		if mixed_uses:
			var targets: Array = []
			for kind in ["map", "player-map", "monster"]:
				targets.append({"source": kind + ":0", "sourceKind": kind, "label": kind.capitalize(), "field": "changed" if changed_use else "picture"})
			return {"ok": true, "result": {"asset": {"identity": params.identity}, "revision": 7, "useTargets": targets, "paging": {"usedByTruncated": false}}}
		var uses: Array = []
		for index in range(int(params.offset), mini(33 if paged_uses else 1, int(params.offset) + 32)):
			uses.append({"source": "classic.item.%d" % (800 + index), "sourceKind": "item", "label": "Item %d · Trail marker" % (800 + index), "field": "iconId"})
		return {"ok": true, "result": {"asset": {"identity": params.identity}, "revision": 7, "useTargets": uses, "paging": {"usedByTruncated": paged_uses and params.offset == 0}}}
	assert(params.identity.begins_with("Scenario Ruby"))
	return {"ok": true, "result": {"asset": {"identity": "wrong" if wrong_asset else params.identity}, "removable": removable, "removalReason": "" if removable else "Artwork is in use."}}
