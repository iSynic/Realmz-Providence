extends RefCounted

static func run(workbench, bridge, applied: Array) -> void:
	var supplied = workbench.get_node("%Supplied")
	var uses_panel = workbench.get_node("%Gallery")
	await workbench.reload(null)
	assert(workbench.get_node("%Import").disabled and workbench.get_node("%NewCollection").disabled)
	assert(workbench.get_node("%Gallery").get_node("%Status").text == "No library is open.")
	for button: Button in workbench.get_node("%Gallery").get_node("InspectorInset/Selection/PreviewScale").get_children():
		assert(button.disabled)
	assert(supplied.get_node("%VaultStatus").text.is_empty())
	await workbench.begin_item_selection(bridge, {"id": "classic.item.800", "classicId": 800, "name": "Trail marker", "iconId": 0}, 7)
	for scope in ["scenario", "stock"]:
		await workbench.show_scope(scope)
		for frame in 3:
			await workbench.get_tree().process_frame
		await uses_panel._select(0)
		assert(not workbench.get_node("%Import").visible and not uses_panel.get_node("%RemoveScenario").visible)
		var before_calls: int = bridge.calls.size()
		uses_panel.get_node("%UseStock").pressed.emit()
		await _settle(workbench, bridge)
		assert(bridge.calls.size() == before_calls + 1)
		assert(bridge.calls.back().params.recordIndex == 0 and bridge.calls.back().params.expectedRevision == 7)
		assert(not uses_panel.get_node("%StockPickerWindow").visible)
	await _check_chooser_assignment(workbench, bridge, uses_panel, supplied, applied)
	await workbench.end_item_selection()
	assert(uses_panel.get_node("%ItemTarget").item.is_empty())


static func _check_chooser_assignment(workbench, bridge, uses_panel, supplied, applied: Array) -> void:
	await workbench.show_scope("personal")
	for frame in 3:
		await workbench.get_tree().process_frame
	await uses_panel._select(0)
	uses_panel.get_node("%UseStock").pressed.emit()
	await _settle(workbench, bridge)
	var copy_dialog = uses_panel.get_node("%CopyDialog")
	assert(copy_dialog.visible and copy_dialog.ok_button_text == "Apply Artwork")
	var applied_before: int = applied.size()
	copy_dialog.get_node("%CopyNumber").value = 32000
	await uses_panel._copy_selected()
	assert(applied.size() == applied_before and copy_dialog.get_ok_button().disabled)
	assert(uses_panel.get_node("%ItemTarget").item.id == "classic.item.800")
	copy_dialog.get_node("%CopyNumber").value = 30127
	bridge.failed_method = "personal-library.apply-item-artwork"
	await uses_panel._copy_selected()
	assert(applied.size() == applied_before and uses_panel.get_node("%Status").text.contains("reopen"))
	assert(not uses_panel.get_node("%StockPickerWindow").visible)
	bridge.failed_method = ""
	await uses_panel._copy_selected()
	assert(applied.size() == applied_before + 1)
	copy_dialog.hide()
	await workbench.get_tree().process_frame
	await workbench._supplied("bag-item", "Bag of Holding")
	for frame in 3:
		await workbench.get_tree().process_frame
	supplied._select_artwork(0)
	assert(not supplied.get_node("%CopyToScenario").visible)
	bridge.failed_method = "scenario-item.apply-library-artwork"
	supplied.get_node("%UseInItem").pressed.emit()
	await _settle(workbench, bridge)
	assert(applied.size() == applied_before + 1 and supplied.get_node("%VaultStatus").text.contains("reopen"))
	assert(supplied.get_node("%ItemTarget").item.id == "classic.item.800")
	bridge.failed_method = ""
	supplied.get_node("%UseInItem").pressed.emit()
	await _settle(workbench, bridge)
	assert(applied.size() == applied_before + 2 and not supplied.get_node("%PickerWindow").visible)



static func _settle(workbench, bridge) -> void:
	var idle_frames := 0
	for frame in 200:
		await workbench.get_tree().process_frame
		idle_frames = 0 if bridge.operation_busy() else idle_frames + 1
		if idle_frames >= 3: return
	assert(false, "Item artwork operation did not complete")
