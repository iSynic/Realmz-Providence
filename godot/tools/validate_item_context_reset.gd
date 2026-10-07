extends SceneTree

var _view: ProvidenceItemEditor


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	_view = load("res://src/item_editor.tscn").instantiate(); root.add_child(_view)
	var item := {"id": "classic.item.800", "classicId": 800, "name": "Café", "unidentifiedName": "Unknown", "description": "", "iconId": 600, "special": [0, 0, 0, 0, 0]}
	var document := {"item": item, "revision": 1, "editable": true, "textFeedback": [{"field": "name", "byteCount": 4, "error": null}], "effects": ["Acknowledged effects"]}
	_view.bind_document(document)
	assert(_view.form.find_child("PlaySound", true, false).disabled, "Zero sound cannot offer a silent no-op preview")
	_view.draft.edit_field("name", "Unsupported 😀")
	_invalid_feedback()
	_view.discard_draft()
	_check_baseline()
	_invalid_feedback()
	_view.bind_document(document)
	_check_baseline()
	_invalid_feedback()
	_view.begin_allocation({"definition": item, "allocation": {"destinationRecordIndex": 100}, "recordIndex": 100}, 1)
	assert(not _view.get_node("%SubmissionNotice").visible)
	assert(not _view.form.find_child("ItemIdentifiedNameCount", true, false).text.contains("Unsupported"))
	var image := Image.create(4, 4, false, Image.FORMAT_RGBA8); image.fill(Color.RED)
	_view.set_artwork_preview(ImageTexture.create_from_image(image))
	_view.discard_draft()
	_check_empty()
	_view.bind_document(document)
	_view.set_artwork_preview(ImageTexture.create_from_image(image))
	_invalid_feedback()
	_view.set_items([], 2)
	_check_empty()
	await _check_command_bar()
	_view.free(); await process_frame
	print("PROVIDENCE_ITEM_CONTEXT_RESET_OK discard-document-allocation feedback-baseline empty-hero")
	quit()


func _invalid_feedback() -> void:
	_view.show_validation({"valid": false, "issues": ["Unsupported old draft"], "textFeedback": [{"field": "name", "error": "Unsupported old text"}], "effects": ["Old draft effects"]})
	assert(_view.get_node("%SubmissionNotice").visible)


func _check_baseline() -> void:
	assert(_view.selected_definition().name == "Café" and not _view.has_unapplied_changes())
	assert(not _view.get_node("%SubmissionNotice").visible and _view.get_node("%SubmissionNotice").text.is_empty())
	assert(_view.form.find_child("ItemIdentifiedNameCount", true, false).text == "4 / 255 bytes · Classic MacRoman")
	assert(_view.form.find_child("EffectPreview", true, false).text == "Acknowledged effects")


func _check_empty() -> void:
	assert(_view.selected_definition().is_empty())
	assert(_view.get_node("%ItemPicture").texture == null)
	assert(_view.get_node("%PicturePlaceholder").visible and _view.get_node("%PicturePlaceholder").text == "—")
	assert(_view.get_node("%ArtworkNotice").text == "No artwork selected")
	assert(not _view.get_node("%SubmissionNotice").visible)
	assert(_view.form.find_child("PlaySound", true, false).disabled)


func _check_command_bar() -> void:
	var bar = load("res://src/command_bar.tscn").instantiate(); root.add_child(bar)
	bar.present_document("economy.items", _view, false)
	await process_frame
	assert(not bar.commit_button.visible, "The form's state-aware Apply is the sole visible item submission button")
	assert(_view.get_node("%CommitItemEdit").disabled)
	bar.free()
