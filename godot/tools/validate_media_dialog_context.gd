extends SceneTree

class Bridge extends RefCounted:
	func connection_epoch() -> int: return 1
	func current_project_path() -> String: return "fixture"

class Commands extends RefCounted:
	var requests: Array = []
	func is_locked() -> bool: return false
	func prepare(method: String, params: Dictionary) -> Dictionary:
		requests.append({"method": method, "params": params})
		match method:
			"session.describe": return {"ok": true, "result": {"revision": 1}}
			"personal-library.describe": return {"ok": true, "result": {"revision": 9, "configured": true}}
			"personal-library.collections":
				var offset := int(params.get("offset", 0))
				if not str(params.get("seekIdentity", "")).is_empty(): offset = int(str(params.seekIdentity).trim_prefix("collection:")) / 128 * 128
				var rows: Array = []
				for index in range(offset, mini(offset + 128, 300)):
					rows.append({"identity": "collection:%d" % index, "name": "Collection %d" % index})
				return {"ok": true, "result": {"items": rows, "offset": offset, "truncated": offset + 128 < 300}}
		return {"ok": false, "error": "Unexpected context read"}


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	root.gui_embed_subwindows = true
	var dialog: Window = load("res://src/media_authoring_dialog.tscn").instantiate()
	root.add_child(dialog)
	var bridge := Bridge.new()
	var commands := Commands.new()
	var context := {"scope": "personal", "revision": 9, "row": {"identity": "personal:entry", "name": "Guardian", "kind": "icon", "collection": "collection:299"}}
	await dialog.open_review("organize", bridge, commands, context)
	assert(dialog.get_node("%Collection").get_item_metadata(dialog.get_node("%Collection").selected) == "collection:299")
	assert(dialog.get_node("%Accept").disabled)
	assert(not dialog.get_node("%Impact").text.contains("Loading"))
	assert(dialog.get_node("%OutputDetails").text.is_empty())
	assert(dialog._collection_offset == 128 and dialog.get_node("%MoreCollections").visible)
	await dialog._load_collections(dialog._generation)
	assert(dialog._collection_offset == 256 and dialog._collection_index("collection:139") >= 0)
	assert(dialog.get_node("%Collection").get_item_metadata(dialog.get_node("%Collection").selected) == "collection:299")
	context.action = "organize"
	await dialog.restore_review(bridge, commands, {"context": context, "intent": {"params": {"name": "Changed Guardian", "collection": "collection:139"}}})
	assert(dialog.get_node("%Collection").get_item_metadata(dialog.get_node("%Collection").selected) == "collection:139")
	assert(not dialog.get_node("%Accept").disabled)
	dialog.get_node("%OutputDetails").text = "PICT 32128 · Prepared output"
	dialog._changed()
	assert(dialog.get_node("%OutputDetails").text.is_empty() and dialog.get_node("%Accept").disabled)
	dialog.get_node("%OutputDetails").text = "PICT 32128 · Prepared output"
	dialog._failure({"error": "Invalid output"})
	assert(dialog.get_node("%OutputDetails").text.is_empty())
	assert(commands.requests.filter(func(row): return row.method == "personal-library.collections").all(func(row): return row.params.limit == 128))
	dialog._cancel(); dialog.queue_free()
	print("PROVIDENCE_MEDIA_DIALOG_CONTEXT_OK current-far-collection no-op contiguous-pages retained-draft bounded-reads")
	quit()
