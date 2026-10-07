extends RefCounted

var shell
var view: ProvidenceSpellEditor
var controller
var capture: Callable
var idle: Callable


func run(editor, snapshot: Callable, settle: Callable) -> void:
	shell = editor; capture = snapshot; idle = settle
	view = shell._documents.view("rules.spells")
	controller = shell._workbenches.spell_commands
	await capture.call("custom", "Real adapter allocation and atomic Apply in a fresh project.")
	await controller.open_spell("classic.spell.1101"); await idle.call()
	await capture.call("stock", "Real protected Stock definition and exact media previews.")
	await controller.open_spell("classic.spell.5102"); await idle.call()
	await capture.call("empty", "Real unallocated Custom slot; create before editing.")
	await _custom()
	await _catalog_states()
	await _draft_states()
	await _picker_states()
	await _record_states()
	await _conflict_state()
	await _custom()
	view.form.control_for("special").value = 58
	await capture.call("presentation-summon", "Effect 58 enables the contextual Normal-set summon picker; zero remains random eligible.")
	view.discard_draft(); await idle.call()
	await _themes()


func _custom() -> void:
	controller._references._picker.cancel(false)
	controller._records._review.cancel()
	controller._saved_review.cancel()
	shell._operations.reset_session()
	shell._commands.refresh()
	view.show_submission({"ok": true})
	view.discard_draft()
	view.get_node("%SpellSearch").text = ""
	view.get_node("%SpellClassFilter").select(0)
	view.get_node("%SpellLevelFilter").select(0)
	view._query.merge({"class": 0, "level": 0, "query": "", "offset": 0}, true)
	await controller.open_spell("classic.spell.5101")
	await idle.call()


func _catalog_states() -> void:
	view.get_node("%SpellClassFilter").select(5)
	view.get_node("%SpellClassFilter").item_selected.emit(5)
	await idle.call()
	await capture.call("filtered", "Real class-filtered catalog; canonical identity remains selected.")
	var search: LineEdit = view.get_node("%SpellSearch")
	search.text = "unmatched spell query"; search.text_changed.emit(search.text)
	await shell.get_tree().create_timer(0.3).timeout; await idle.call()
	await capture.call("no-results", "Real complete-catalog search; details clear on an empty clean result.")
	await controller.reload(); await idle.call()
	search.text = ""; search.text_changed.emit(search.text)
	await shell.get_tree().create_timer(0.3).timeout; await idle.call()
	await capture.call("catalog-return", "Real no-results, empty Refresh and clear-query return; browsing and creation unlock after successful reads.")
	await _custom()
	await shell._operations.run_workflow(shell._bridge, "Load Spells", _capture_loading)
	await _custom()
	view.show_catalog_failure({"ok": false, "error": "The spell catalog could not be read. Your draft is kept; refresh to try this read again."})
	await capture.call("failure", "Controlled known read failure; no mutation submitted.")
	await _custom()


func _capture_loading(_operation) -> Dictionary:
	view.bind_document({})
	view.show_catalog_loading()
	await capture.call("loading", "Controlled initial loading inside the real global read-operation lease; asynchronous origin handling separately verified.")
	return {"ok": true}


func _draft_states() -> void:
	var name: LineEdit = view.form.control_for("name")
	name.text = "Moon Gate · revised"; name.text_changed.emit(name.text)
	await idle.call()
	await capture.call("dirty", "Real local form editing; canonical baseline remains unchanged until Apply.")
	name.text = "Unrepresentable 🌙"; name.text_changed.emit(name.text)
	await controller.validate_draft(); await idle.call()
	await capture.call("invalid", "Real rejected MacRoman validation; name and entire draft remain editable.")
	view.discard_draft(); await idle.call()
	view.accept_reference("lookEnd", 32); await controller.validate_draft(); await idle.call()
	await capture.call("missing", "Real missing exact frame resources for stored resolution offset 32; preserved locally with an availability reason.")
	view.discard_draft(); await idle.call()
	name.text = "Durable reply pending"; name.text_changed.emit(name.text)
	await idle.call()
	shell._operations.requires_reopen = true
	shell._commands.set_history(true, false)
	view.show_submission({"ok": false, "outcomeUnknown": true, "pendingMutation": true, "error": "The original Apply result is uncertain. Your draft is kept. Check the original result before another change."})
	await capture.call("uncertain", "Controlled lost-acknowledgement presentation; real durable recovery/no-replay exercised separately.")
	await _custom()


func _picker_states() -> void:
	controller._references.open_picker("lookEnd"); await idle.call()
	await capture.call("picker", "Real bounded two-pane picker and eight exact resolution frames; the current stored offset is preselected.")
	var picker = controller._references._picker
	picker.get_node("%ShowUnavailable").button_pressed = true
	var search: LineEdit = picker.get_node("%Search")
	search.text = "32"; search.text_changed.emit(search.text)
	await shell.get_tree().create_timer(0.3).timeout; await idle.call()
	var list: ItemList = picker.get_node("%Choices")
	var unavailable: int = picker._rows.find_custom(func(row): return not row.available)
	if unavailable >= 0: list.select(unavailable); list.item_selected.emit(unavailable)
	await idle.call()
	await capture.call("picker-unavailable", "Real unavailable catalog match; explicit reason and disabled acceptance.")
	search.text = "unmatched exact resource"; search.text_changed.emit(search.text)
	await shell.get_tree().create_timer(0.3).timeout; await idle.call()
	await capture.call("picker-no-results", "Real empty reference search clears stale preview and acceptance.")
	picker.cancel(false)
	controller._references.open_picker("soundStart"); await idle.call()
	await capture.call("picker-sound", "Real decoded Stock sound and waveform with explicit play/stop controls.")
	picker.cancel(false)


func _record_states() -> void:
	await controller._records.review_record("new")
	await capture.call("allocation", "Real core-derived vacant destination review with level/slot chooser.")
	var review = controller._records._review
	review.show_failure("No Custom spell slot is available: all 105 destinations contain retained content or incoming uses.")
	await capture.call("full", "Controlled full-range allocation failure; core full-ID protection is independently tested.")
	review.cancel()
	await controller._records.review_record("clear")
	await capture.call("clear-impact", "Real clear-impact review retains identity and all incoming uses; cancellation does not stage or write.")
	review.cancel()


func _conflict_state() -> void:
	var name: LineEdit = view.form.control_for("name")
	name.text = "My local Moon Gate"; name.text_changed.emit(name.text)
	await idle.call()
	var document: Dictionary = shell._bridge.request("spell.open-authoring", {"identity": "classic.spell.5101"})
	var saved: Dictionary = document.result.definition.duplicate(true)
	saved.name = "Saved Moon Gate"
	var draft := {"recordIndex": 0, "definition": saved, "allocation": null, "copySource": null}
	var applied: Dictionary = shell._bridge.request("spell.draft.apply", {"expectedRevision": int(document.result.revision), "draft": draft, "operationId": "c".repeat(64)})
	if not applied.get("ok", false): push_error(str(applied)); return
	view.show_submission({"ok": false, "revisionConflict": true, "error": "The project changed after this spell was opened. Your draft is kept; review the saved version before applying."})
	await controller.review_saved_version()
	await capture.call("revision-conflict", "Real external revision conflict and local/saved field comparison; no stale mutation submitted.")
	controller._saved_review.get_node("%UseSaved").pressed.emit()
	await idle.call()


func _themes() -> void:
	for mode in ["light", "dark", "high-contrast"]:
		for density in ["balanced", "compact"]:
			view.apply_theme(mode, density)
			await capture.call("regression-" + mode + "-" + density, "Feature theme/density regression with Spells-owned background; shell chrome remains its existing dark theme. Acceptance is dark/balanced.")
	view.apply_theme("dark", "balanced")
