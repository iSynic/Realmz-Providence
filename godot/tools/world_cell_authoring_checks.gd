extends RefCounted


func run(shell: Control, check: Callable, settle: Callable) -> void:
	var land: Control = shell._workbenches.land
	var view: Window = shell._maps.cell_behavior.view
	var button: Button = land.get_node("PaintSelectionContext/CellDetails")
	check.call(view.visible and int(view.context.x) == 12 and int(view.context.y) == 11, "Primary Cell Details lost its selected coordinate.")
	check.call(view.get_node("%CellArtwork").texture != null and not view.get_node("%CreateCellActionPoint").disabled, "Primary Cell Details lacks actual artwork or creation.")
	var baseline: int = view.get_node("%SecretState").selected
	var chosen := 1 if baseline == 0 else 0
	view.get_node("%" + ["SecretNormal","SecretHidden"][chosen]).pressed.emit()
	view.get_node("%CancelCellBehavior").pressed.emit()
	check.call(view.get_node("%DiscardCellConfirmation").visible and view.has_unapplied_changes(), "Cell Cancel did not protect its draft.")
	view.get_node("%DiscardCellConfirmation").canceled.emit(); view.get_node("%DiscardCellConfirmation").hide()
	var revision: int = shell._session_view.revision
	view.get_node("%ReviewCellBehavior").pressed.emit(); await settle.call(shell)
	check.call(view.review_is_current(), "Visible Cell review did not prepare the atomic command.")
	view.get_node("%ApplyCellBehavior").pressed.emit(); await settle.call(shell)
	check.call(shell._session_view.revision == revision + 1 and button.has_focus(), "Cell Apply did not commit once and restore focus.")
	await shell._undo(); await settle.call(shell)
	await shell._redo(); await settle.call(shell)
	button.pressed.emit(); await settle.call(shell)
	check.call(view.get_node("%SecretState").selected == chosen, "Cell history lost its selected secret state.")
	await _script_round_trip(shell, view, button, check, settle)
	button.pressed.emit(); await settle.call(shell)
	view.get_node("%CellTechnicalDetails").pressed.emit(); await settle.call(shell)
	check.call(not view.visible and shell._maps.paint.workspace._details.visible, "Numerical cell details did not stay secondary to authoring.")
	print("PROVIDENCE_WORLD_CELL_AUTHORING_OK visible-artwork secret-choice dirty-cancel review apply history contextual-create exact-open linked-return focus secondary-details")


func _script_round_trip(shell: Control, view: Window, button: Button, check: Callable, settle: Callable) -> void:
	var before: Dictionary = shell._workbenches.land.read_navigation_state()
	var revision: int = shell._session_view.revision
	view.get_node("%CreateCellActionPoint").pressed.emit(); await settle.call(shell)
	var editor: Control = shell._documents.view("scripts.action-points")
	check.call(shell._documents.identity_for_tab(shell._document_tabs.current_tab) == "scripts.action-points" and shell._session_view.revision == revision, "Cell AP creation navigated incorrectly or wrote before acceptance.")
	editor.get_node("%CreateActionPoint").pressed.emit(); await settle.call(shell)
	var identity: String = editor.selected_identity()
	check.call(not identity.is_empty() and shell._session_view.revision == revision + 1, "Visible Cell AP creation did not commit once.")
	await shell._navigation.navigate_back(); await settle.call(shell)
	check.call(shell._workbenches.land.read_navigation_state().canvas == before.canvas and button.has_focus(), "Cell AP Back lost camera, cell or focus.")
	button.pressed.emit(); await settle.call(shell)
	check.call(not view.get_node("%OpenCellActionPoint").disabled and view.get_node("%CreateCellActionPoint").disabled, "Occupied Cell Details did not expose its owning AP.")
	view.get_node("%OpenCellActionPoint").pressed.emit(); await settle.call(shell)
	check.call(editor.selected_identity() == identity and shell._session_view.revision == revision + 1, "Cell AP Open changed the record or opened another AP.")
	await shell._navigation.navigate_back(); await settle.call(shell)
