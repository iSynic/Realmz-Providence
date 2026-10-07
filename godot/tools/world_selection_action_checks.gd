extends RefCounted


func run(shell: Control, check: Callable, settle: Callable) -> void:
	var author = shell._maps.land_authoring
	var view: Window = author._selection_actions
	var button: Button = shell._workbenches.land.get_node("%SelectionActions")
	var cells := [{"x":12,"y":12},{"x":13,"y":12}]
	author.restore_selection(cells,"select")
	var baseline: Dictionary = author.options.duplicate(true)
	var revision: int = shell._session_view.revision
	button.pressed.emit(); await settle.call(shell)
	check.call(view.visible and not view.get_node("%FillArea").disabled, "Selection Actions lacked its actual available command.")
	view.get_node("%SelectionCombine").select(1)
	view.get_node("%CancelSelection").pressed.emit(); await settle.call(shell)
	check.call(author.options == baseline and author.selected == cells and button.has_focus(), "Selection Cancel changed options/cells or lost focus.")
	button.pressed.emit(); await settle.call(shell)
	view.get_node("%SelectionShape").select(2); view.get_node("%SelectionCombine").select(1); view.get_node("%UseSelection").pressed.emit()
	check.call(author.options.combine == "add" and author.selected == cells and shell._session_view.revision == revision, "Use selection changed canonical map cells.")
	await _gesture_after_acceptance(shell, check, settle)
	author.restore_selection(cells,"select")
	button.pressed.emit(); await settle.call(shell)
	view.get_node("%FillArea").pressed.emit(); await settle.call(shell)
	check.call(author._review.visible and not view.visible and shell._session_view.revision == revision, "Selection Fill skipped explicit impact review.")
	author._review.get_node("%CancelArea").pressed.emit(); await settle.call(shell)
	button.pressed.emit(); await settle.call(shell)
	view.get_node("%CaptureArea").pressed.emit(); await settle.call(shell)
	var resource: Window = shell._maps.paint_resources._window
	check.call(resource.visible and resource.has_unapplied_changes() and resource.draft().cells.size() == 2 and shell._session_view.revision == revision, "Selection Capture did not stage an actual read-only stamp.")
	resource.get_node("%CancelResources").pressed.emit()
	check.call(resource.get_node("%ConfirmDiscard").visible, "Captured stamp cancellation skipped its local draft guard.")
	resource.get_node("%ConfirmDiscard").confirmed.emit(); resource.get_node("%ConfirmDiscard").hide(); await settle.call(shell)
	check.call(not resource.visible and button.has_focus() and shell._session_view.revision == revision, "Capture Cancel changed map truth or lost focus.")
	await _keyboard_and_route(shell, button, check, settle)
	await _stamp_bounds(shell, button, check, settle)
	author.restore_selection(cells,"select")
	button.pressed.emit(); await settle.call(shell)
	await shell._maps.document.load_map("land:1"); await settle.call(shell)
	check.call(not view.visible, "Document replacement retained stale Selection Actions.")
	print("PROVIDENCE_SELECTION_ACTIONS_OK actual-picker-options cancel-no-write review capture-draft guard focus stale-document")


func _gesture_after_acceptance(shell: Control, check: Callable, settle: Callable) -> void:
	var author = shell._maps.land_authoring
	var revision: int = shell._session_view.revision
	var canvas: Control = shell._workbenches.land.get_node("%LandMapCanvas")
	var before: Array = canvas._tiles.duplicate()
	check.call(author._tool == "select", "Use selection activated painting instead of selection.")
	author._begin_gesture(Vector2i(12,12))
	await author._gesture_finished(Vector2i(12,12),Vector2i(14,14),[Vector2i(12,12),Vector2i(14,14)])
	await settle.call(shell)
	check.call(author.selected.size() == 9 and author._tool == "select", "Accepted rectangle options did not produce the actual selected area.")
	check.call(canvas._tiles == before and shell._session_view.revision == revision, "Selection gesture painted canonical cells after Use selection.")
	print("PROVIDENCE_SELECTION_GESTURE_OK accepted-options actual-rectangle add-selection unchanged-tiles unchanged-revision")


func _keyboard_and_route(shell: Control, button: Button, check: Callable, settle: Callable) -> void:
	var author = shell._maps.land_authoring
	var view: Window = author._selection_actions
	var revision: int = shell._session_view.revision
	button.pressed.emit(); await settle.call(shell)
	var key := InputEventKey.new(); key.pressed = true; key.keycode = KEY_ESCAPE
	view.push_input(key); await settle.call(shell)
	check.call(not view.visible and button.has_focus() and shell._session_view.revision == revision, "Selection Escape changed the draft or lost focus.")
	button.pressed.emit(); await settle.call(shell)
	key = InputEventKey.new(); key.pressed = true; key.keycode = KEY_ENTER
	view.push_input(key); key = key.duplicate(); key.pressed = false; view.push_input(key)
	await settle.call(shell)
	check.call(author._review.visible and not view.visible and shell._session_view.revision == revision, "Selection Enter did not review Fill without writing.")
	author._review.get_node("%CancelArea").pressed.emit(); await settle.call(shell)
	button.pressed.emit(); await settle.call(shell)
	await shell._navigation.select_route("maps.layout"); await settle.call(shell)
	check.call(not view.visible and author._selection_origin.is_empty(), "Route change retained stale Selection Actions.")
	await shell._navigation.navigate_back(); await settle.call(shell)
	print("PROVIDENCE_SELECTION_KEYBOARD_OK native-enter escape route-invalidation no-write")


func _stamp_bounds(shell: Control, button: Button, check: Callable, settle: Callable) -> void:
	var author = shell._maps.land_authoring
	var resources = shell._maps.paint_resources
	await resources.capture_selection(button); await settle.call(shell)
	resources._window.get_node("%ResourceName").text = "Bounds check stamp"
	resources._window.get_node("%SaveResource").pressed.emit(); await settle.call(shell)
	resources._window.get_node("%UseResource").pressed.emit(); await settle.call(shell)
	var revision: int = shell._session_view.revision
	var before: Array = shell._workbenches.land.get_node("%LandMapCanvas")._tiles.duplicate()
	author._begin_gesture(Vector2i(89,89))
	await author._gesture_finished(Vector2i(89,89),Vector2i(89,89),[Vector2i(89,89)])
	check.call(not author._review.visible and not author._overlay.protected.is_empty() and not author.has_unapplied_changes(), "Invalid stamp bounds did not retain an inline invalid preview without a popup.")
	check.call(shell._session_view.revision == revision and shell._workbenches.land.get_node("%LandMapCanvas")._tiles == before, "Invalid stamp review changed canonical cells.")
	author._review.get_node("%CancelArea").pressed.emit(); await settle.call(shell)
	print("PROVIDENCE_STAMP_BOUNDS_OK adapter-rejection no-write inline-invalid-preview no-popup cancel")
