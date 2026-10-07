extends SceneTree

var _failed := false


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = Vector2i(1600, 900)
	root.content_scale_size = Vector2i(1600, 900)
	root.gui_embed_subwindows = true
	_receipt_identity()
	await _picker()
	await _comparison()
	await _review_paging()
	if not _failed: print("PROVIDENCE_MONSTER_AUTHORING_INTERACTIONS_OK preview-only signed-accept cancel-focus stale-search retry-current conflict-choice local-rebase complete-paged-review")
	quit(1 if _failed else 0)


func _receipt_identity() -> void:
	var identity = preload("res://src/monster_operation_identity.gd")
	var original := {"operationId": "a".repeat(64), "expectedRevision": 3, "draft": {"fields": {"items.2": -93, "armor": 17}}}
	var received: Dictionary = JSON.parse_string(JSON.stringify(original))
	_check(identity.matches(received, original), "A JSON numeric representation mismatch rejected the original receipt")
	received.draft.fields["items.2"] = 93.0
	_check(not identity.matches(received, original), "Receipt identity accepted a changed signed reference")
	received.draft.fields["items.2"] = "-93"
	_check(not identity.matches(received, original), "Receipt identity coerced an unrelated string into an authored number")
	received.draft.fields.erase("items.2")
	_check(not identity.matches(received, original), "Receipt identity accepted an incomplete draft")


func _picker() -> void:
	var origin := Button.new()
	origin.text = "Choose item"
	origin.position = Vector2(20, 20)
	root.add_child(origin)
	var picker = load("res://src/monster_reference_picker.tscn").instantiate()
	root.add_child(picker)
	var queries: Array = []
	var accepted: Array = []
	picker.search_requested.connect(func(query, generation): queries.append({"query": query, "generation": generation}))
	picker.accepted.connect(func(choice, context): accepted.append({"choice": choice, "context": context}))
	origin.grab_focus()
	var context := {"field": "items.5", "currentValue": -93, "destination": "Monster 7 · Mega · Item 6"}
	picker.begin(context, origin)
	await process_frame
	_check(picker.get_node("%Search").has_focus(), "Opening the picker did not focus search")
	_check(queries[-1].query.seekCurrent, "Opening lost current-selection reveal")
	picker.retry_search(queries[-1].query, queries[-1].generation)
	picker.get_node("SearchDelay").stop()
	picker._delayed_search()
	_check(queries[-1].query.seekCurrent, "A busy-read retry lost current-selection reveal")
	var generation: int = queries[-1].generation
	var choice := {"identity": "classic.item.93:-93", "targetIdentity": "classic.item.93", "value": -93, "label": "Spear", "ownership": "scenario", "available": true, "detail": "Fixture explanation"}
	picker.receive_page({"ok": true, "result": {"page": {"items": [choice], "offset": 0, "total": 1}}}, generation)
	_check(accepted.is_empty() and not picker.get_node("%UseSelection").disabled, "Previewing mutated the draft or disabled a valid signed choice")
	picker.cancel()
	await process_frame
	await process_frame
	_check(accepted.is_empty() and origin.has_focus(), "Cancel changed a value or failed to restore origin focus")
	picker.begin(context, origin)
	picker.receive_page({"ok": true, "result": {"page": {"items": [choice], "offset": 0, "total": 1}}}, picker.generation)
	picker.get_node("%UseSelection").pressed.emit()
	_check(accepted.size() == 1 and accepted[0].choice.value == -93 and accepted[0].context == context, "Explicit acceptance lost the signed identity or exact destination")
	await _picker_unavailable(picker, origin, context, choice)
	picker.queue_free()
	origin.queue_free()
	await process_frame


func _picker_unavailable(picker, origin: Control, context: Dictionary, choice: Dictionary) -> void:
	picker.begin(context, origin)
	var generation: int = picker.generation
	var unavailable := choice.duplicate(true)
	unavailable.available = false
	unavailable.reason = "Ambiguous effective native ID"
	picker.receive_page({"ok": true, "result": {"page": {"items": [unavailable], "offset": 0, "total": 1}}}, generation)
	_check(picker.get_node("%UseSelection").disabled and picker.get_node("%Availability").text == unavailable.reason, "Unavailable choice did not explain disabled acceptance")
	picker.get_node("%Search").text = "no results"
	picker.get_node("%Search").text_changed.emit("no results")
	picker.get_node("SearchDelay").stop()
	picker.receive_page({"ok": true, "result": {"page": {"items": [choice], "offset": 0, "total": 1}}}, generation)
	_check(picker.selected.is_empty() and picker.get_node("%Details").text.is_empty(), "A stale search restored old details")
	picker._search(0, false)
	picker.receive_page({"ok": true, "result": {"page": {"items": [], "offset": 0, "total": 0}}}, picker.generation)
	_check(picker.selected.is_empty() and picker.get_node("%UseSelection").disabled and picker.get_node("%Name").text.is_empty(), "No-results state retained a selectable stale choice")
	picker.cancel()
	picker.begin(context, origin)
	await process_frame
	_check(picker.get_node("%Search").has_focus(), "Deferred cancellation focus stole focus from a reopened picker")
	picker.cancel()


func _comparison() -> void:
	var draft = preload("res://src/monster_record_draft.gd").new()
	var baseline := {"revision": 7, "setId": -1, "monster": {"identity": "monster:-1:7", "nativeId": 7, "armor": 4, "agility": 8, "spells": [-1101]}, "description": {"text": "Saved"}, "normalNotOnMenu": false}
	draft.bind(baseline, false)
	draft.edit_field("armor", 18)
	draft.edit_description("My description")
	var saved := baseline.duplicate(true)
	saved.revision = 8
	saved.monster.armor = 12
	saved.monster.agility = 9
	var comparison = load("res://src/monster_draft_comparison.tscn").instantiate()
	root.add_child(comparison)
	var rebased: Array = []
	comparison.rebase_requested.connect(func(current, keep, _origin, _submitted): rebased.append(keep); draft.rebase(current, keep))
	comparison.begin(draft, saved, Vector2i(1, draft.generation), "Monster 7 · Mega")
	_check(comparison.get_node("%Rebase").disabled, "A conflicting field was accepted without an explicit choice")
	var row: TreeItem = comparison.get_node("%Fields").get_root().get_first_child()
	while row != null:
		if row.get_metadata(0) == "armor": row.set_range(3, 1)
		row = row.get_next()
	comparison.get_node("%Fields").item_edited.emit()
	_check(not comparison.get_node("%Rebase").disabled, "Resolved field choices did not enable local rebase")
	comparison.get_node("%Rebase").pressed.emit()
	_check(rebased.size() == 1 and draft.document.revision == 8 and draft.baseline_value("armor") == 12 and draft.current_value("armor") == 18, "Rebase lost the new baseline or selected local value")
	_check(draft.current_value("agility") == 9 and draft.current_value("spells.0") == -1101 and not draft.fields.has("agility"), "Rebase rewrote untouched applied or imported signed fields")
	_check(draft.description == "My description" and draft.has_changes(), "Rebase silently committed or discarded the retained draft")
	var before: Dictionary = draft.submission()
	comparison.begin(draft, saved, Vector2i(1, draft.generation), "Monster 7 · Mega")
	comparison.cancel()
	_check(draft.submission() == before, "Cancel comparison changed the local draft")
	comparison.queue_free()
	await process_frame


func _review_paging() -> void:
	var review = load("res://src/monster_operation_review.tscn").instantiate()
	root.add_child(review)
	var changes: Array = []
	for index in 300: changes.append({"entity": "monster:-1:7", "field": "conditions.%d" % (index % 40), "before": index, "after": index + 1})
	var use := {"source": "battle:3", "field": "grid[0].monster", "targetId": 7, "rawValue": -7, "canRetarget": true, "context": "Signed placement"}
	review.set_meta("owner", "record")
	review.begin("ClearSelection", "Monster 7 · Mega", -1)
	review.receive_review({"ok": true}, {"changes": changes, "uses": [use], "excluded": []})
	_check(review.get_node("%Rows").get_root().get_child_count() == 128 and review.get_node("%PageCount").text.begins_with("300 total"), "Large complete review was unbounded or misreported")
	review.get_node("%Next").pressed.emit()
	review.get_node("%Next").pressed.emit()
	_check(review.get_node("%Rows").get_root().get_child_count() == 44 and review.get_node("%Next").disabled, "Review paging omitted or duplicated the final effects")
	review.get_node("%Sections").current_tab = 1
	var row: TreeItem = review.get_node("%Rows").get_root().get_first_child()
	row.select(0)
	review.get_node("%Rows").item_selected.emit()
	review.accept_retarget(use, {"value": 3, "identity": "monster:0:3", "available": true})
	_check(review.use_edits().size() == 1 and review.use_edits()[0].targetId == 3 and review.get_node("%Commit").disabled, "Changing a use did not invalidate the complete reviewed effects")
	review.cancel()
	review.queue_free()
	await process_frame


func _check(condition: bool, message: String) -> void:
	if condition: return
	_failed = true
	push_error(message)
