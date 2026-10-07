extends RefCounted

var tree: SceneTree
var view: ProvidenceRuleAuthoringEditor
var controller
var check: Callable
var settle: Callable

func run(workbench, commands, assert_that: Callable, idle: Callable) -> void:
	view = workbench; controller = commands; check = assert_that; settle = idle; tree = view.get_tree()
	await settle.call()
	var vacant: CheckBox = view.form.find_child("Eligible30", true, false)
	check.call(vacant.disabled and vacant.text.contains("Empty slot"), "Vacant eligibility is labelled and disabled")
	var document: Dictionary = view.draft.document.duplicate(true)
	view.show_submission({"ok": false, "revisionConflict": true, "error": "Old origin conflict"})
	view.bind_document(document)
	check.call(not view.get_node("%SubmissionNotice").visible and not view.get_node("%ReviewSavedVersion").visible and not view._locked, "A clean replacement origin clears stale recovery presentation")
	await origin_status_checks(document)
	if view.rule_kind == "race": await unavailable_portrait()
	if view.rule_kind == "caste": await item_preview()
	await controller._records.review_record("clear")
	var review = controller._records._review
	check.call(review.get_node("%Destination").text.contains(view.selected_definition().name), "Clear review identifies the original record")
	check.call(review.get_node("%Affected").text.contains("Proposed cleared record"), "Clear separates proposed content from original identity")
	review.cancel(); await settle.call()

func unavailable_portrait() -> void:
	var field := "defaultIconSet" if view.rule_kind == "race" else "defaultIcon"
	view.draft.edit_path(["definition", field], 32767); view.selection_changed.emit(view.selected_definition())
	controller._references.open_picker(field, -1); await settle.call()
	var picker = controller._references._picker
	picker.get_node("%ShowUnavailable").button_pressed = true; await settle.call()
	check.call(int(picker.selected.get("value", 0)) == 32767 and picker.get_node("%UseSelection").disabled and not picker.get_node("%Availability").text.is_empty(), "Unavailable current row is revealed with reason and disabled acceptance")
	check.call(picker._offset > 0, "Current unavailable row is sought beyond the first page")
	picker.cancel(); view.discard_draft(); await settle.call()

func item_preview() -> void:
	view.show_section("Equipment")
	controller._references.open_picker("startingItem", 2); await settle.call()
	var picker = controller._references._picker
	check.call(picker.selected.get("targetIdentity") == "classic.item.1", "Exact starting item is preselected")
	check.call(picker.get_node("%Details").text.contains("Dagger") and picker.get_node("%Base").texture != null, "Real item.open response renders name, description and artwork")
	var current: Dictionary = picker.selected.duplicate(true)
	var second := -1
	for index in picker._rows.size():
		if picker._rows[index].targetIdentity != current.targetIdentity and picker._rows[index].available: second = index; break
	if check.call(second >= 0, "Item catalog provides a second selection"):
		var first: int = picker.get_node("%Choices").get_selected_items()[0]
		picker.get_node("%Choices").item_selected.emit(first)
		picker.get_node("%Choices").item_selected.emit(second); await settle.call()
		check.call(picker.selected.targetIdentity != current.targetIdentity and not picker.get_node("%Details").text.begins_with("Dagger\n"), "Same-page selection replaces the previous item preview")
		var actual: Dictionary = controller._bridge.request("item.open", {"identity": picker.selected.targetIdentity})
		check.call(actual.get("ok", false) and picker.get_node("%Details").text == "%s\n\n%s" % [actual.result.item.name, actual.result.item.description], "A late first-row response cannot replace the current item's name and description")
	picker.cancel(); view.show_section("Profile")

func origin_status_checks(document: Dictionary) -> void:
	view.bind_document({}); view.show_catalog_loading()
	check.call(not view.get_node("%RecordStatus").text.contains("draft kept"), "Initial loading never claims a discarded draft is kept")
	view.bind_document(document)
	var name: LineEdit = view.form.control_for(["definition", "name"])
	name.text += " local"; name.text_changed.emit(name.text)
	view.show_catalog_loading()
	check.call(view.get_node("%RecordStatus").text.contains("draft kept"), "Catalog refresh identifies a real retained draft")
	view.show_submission({"ok": false, "outcomeUnknown": true, "error": "Unknown result"})
	check.call(view.get_node("%DraftStatus").text.contains("uncertain") and not view.get_node("%DraftStatus").text.contains("Apply commits once"), "Unknown results display recovery status, never fresh Apply guidance")
	view.bind_document(document)
	await controller._records.review_record("new")
	view.show_submission({"ok": false, "revisionConflict": true, "error": "Old conflict"})
	controller._records._review.get_node("%UseDraft").pressed.emit()
	check.call(not view.get_node("%SubmissionNotice").visible and not view.get_node("%ReviewSavedVersion").visible, "Allocation clears previous-origin notices")
	view.discard_draft(); await settle.call()
	await controller._records.review_record("clear")
	view.show_submission({"ok": false, "revisionConflict": true, "error": "Old conflict"})
	controller._records._review.get_node("%UseDraft").pressed.emit()
	check.call(not view.get_node("%SubmissionNotice").visible, "Clear staging removes previous-origin notices")
	view.discard_draft(); await settle.call()
