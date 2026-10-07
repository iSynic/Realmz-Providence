extends RefCounted

const Fixture = preload("res://tools/native_workflow_fixtures.gd")
const REBUILT_MINIMUM_ENGINE_VERSION := "0.1.0"

static func _run_real_action_point_link_smoke(shell: Control,
	destination_project: String,
	classic_output: String,
	rebuilt_output: String
) -> void:
	if not shell._bridge.is_project_backed():
		Fixture._smoke_fail(shell, "real Action Point link smoke requires PROVIDENCE_PROJECT_PATH")
		return
	var saved_as = shell._bridge.save_project_as(destination_project)
	if not bool(saved_as.get("ok", false)):
		Fixture._smoke_fail(shell, str(saved_as.get("error", "real Action Point workflow Save As failed")))
		return
	await shell._activate_session(saved_as)
	if shell._session_view.revision != 1:
		Fixture._smoke_fail(shell, "real Action Point workflow expected the imported baseline at revision 1")
		return
	await shell._scripts.reload_action_points_for_map("land:0")
	shell._document_tabs.current_tab = 5
	if not await shell._scripts.open_action_point("action-point:land:0:6"):
		Fixture._smoke_fail(shell, "Half Truth Action Point 6 did not open")
		return
	var original = shell._documents.view("scripts.action-points").current_action_point() as Dictionary
	var coordinate := original.get("coordinate", {}) as Dictionary
	if int(coordinate.get("x", -1)) != 42 or int(coordinate.get("y", -1)) != 62 \
			or Fixture._action_target(shell, original, 3) != 19 or Fixture._action_target(shell, original, 4) != 1:
		Fixture._smoke_fail(shell, "Half Truth Action Point 6 did not expose the pinned Message 19 and Simple Encounter 1 links")
		return

	if not await _verify_original_peeks(shell): return
	if not await _introduce_missing_link(shell): return
	if not await _verify_link_history(shell): return
	if not await _repair_final_link(shell): return
	if not _publish_repaired_link(shell, classic_output, rebuilt_output): return
	shell.get_tree().quit(0)


static func _verify_original_peeks(shell: Control) -> bool:
	if not _select_action_point_slot_for_smoke(shell, 3):
		Fixture._smoke_fail(shell, "Half Truth Action Point 6 Message slot was not selectable")
		return false
	(shell._documents.view("scripts.action-points").find_child("PeekActionPointTarget", true, false) as Button).pressed.emit()
	await _settle(shell)
	if shell._document_tabs.current_tab != 0 or shell._strings._selected_identity != "message:19":
		Fixture._smoke_fail(shell, "Action Point Peek did not navigate to Message 19")
		return false

	shell._document_tabs.current_tab = 5
	if not await shell._scripts.open_action_point("action-point:land:0:6") or not _select_action_point_slot_for_smoke(shell, 4):
		Fixture._smoke_fail(shell, "Half Truth Action Point 6 encounter slot was not selectable")
		return false
	(shell._documents.view("scripts.action-points").find_child("PeekActionPointTarget", true, false) as Button).pressed.emit()
	await _settle(shell)
	var encounter = shell._documents.view("encounters.simple").current_encounter() as Dictionary
	if shell._document_tabs.current_tab != 2 or str(encounter.get("identity", "")) != "simple-encounter:1":
		Fixture._smoke_fail(shell, "Action Point Peek did not navigate to Simple Encounter 1")
		return false
	return true


static func _introduce_missing_link(shell: Control) -> bool:
	shell._document_tabs.current_tab = 5
	if not await shell._scripts.open_action_point("action-point:land:0:6") or not _select_action_point_slot_for_smoke(shell, 3):
		Fixture._smoke_fail(shell, "Half Truth Action Point 6 Message slot could not be prepared for repair")
		return false
	(shell._documents.view("scripts.action-points").find_child("ActionPointSelectedTarget", true, false) as SpinBox).value = 30000
	(shell._documents.view("scripts.action-points").find_child("RepairActionPointTarget", true, false) as Button).pressed.emit()
	await _settle(shell)
	if shell._session_view.revision != 2:
		Fixture._smoke_fail(shell, "typed Action Point repair did not create the deliberate missing target at revision 2")
		return false
	var missing = shell._bridge.request("action-point.open", {"identity": "action-point:land:0:6"})
	if not bool(missing.get("ok", false)) or Fixture._action_target(shell, (missing.result as Dictionary).get("actionPoint", {}) as Dictionary, 3) != 30000:
		Fixture._smoke_fail(shell, "typed Action Point repair did not persist Message 30000")
		return false
	if _missing_action_point_diagnostic_state(shell, "action-point:land:0:6") != 1:
		Fixture._smoke_fail(shell, "validation did not expose the deliberate Action Point dangling target")
		return false
	return true


static func _verify_link_history(shell: Control) -> bool:
	await shell._undo()
	if shell._session_view.revision != 3:
		Fixture._smoke_fail(shell, "real Action Point workflow undo did not reach revision 3")
		return false
	var undone = shell._bridge.request("action-point.open", {"identity": "action-point:land:0:6"})
	if not bool(undone.get("ok", false)) or Fixture._action_target(shell, (undone.result as Dictionary).get("actionPoint", {}) as Dictionary, 3) != 19:
		Fixture._smoke_fail(shell, "real Action Point workflow undo did not restore Message 19")
		return false

	await shell._redo()
	if shell._session_view.revision != 4:
		Fixture._smoke_fail(shell, "real Action Point workflow redo did not reach revision 4")
		return false
	var redone = shell._bridge.request("action-point.open", {"identity": "action-point:land:0:6"})
	if not bool(redone.get("ok", false)) or Fixture._action_target(shell, (redone.result as Dictionary).get("actionPoint", {}) as Dictionary, 3) != 30000:
		Fixture._smoke_fail(shell, "real Action Point workflow redo did not restore Message 30000")
		return false
	return true


static func _repair_final_link(shell: Control) -> bool:
	if not await shell._scripts.open_action_point("action-point:land:0:6") or not _select_action_point_slot_for_smoke(shell, 3):
		Fixture._smoke_fail(shell, "Half Truth Action Point 6 Message slot could not be prepared for the final repair")
		return false
	(shell._documents.view("scripts.action-points").find_child("ActionPointSelectedTarget", true, false) as SpinBox).value = 20
	(shell._documents.view("scripts.action-points").find_child("RepairActionPointTarget", true, false) as Button).pressed.emit()
	await _settle(shell)
	if shell._session_view.revision != 5 or _missing_action_point_diagnostic_state(shell, "action-point:land:0:6") != 0:
		Fixture._smoke_fail(shell, "final typed Action Point repair did not resolve Message 20 at revision 5")
		return false

	if not await shell._scripts.open_action_point("action-point:land:0:6") or not _select_action_point_slot_for_smoke(shell, 3):
		Fixture._smoke_fail(shell, "repaired Half Truth Action Point 6 Message slot could not be reopened")
		return false
	(shell._documents.view("scripts.action-points").find_child("PeekActionPointTarget", true, false) as Button).pressed.emit()
	await _settle(shell)
	if shell._document_tabs.current_tab != 0 or shell._strings._selected_identity != "message:20":
		Fixture._smoke_fail(shell, "repaired Action Point Peek did not navigate to Message 20")
		return false
	return true


static func _publish_repaired_link(shell: Control, classic_output: String, rebuilt_output: String) -> bool:
	var saved = shell._bridge.request("project.save")
	if not bool(saved.get("ok", false)) or int((saved.result as Dictionary).get("revision", -1)) != 5:
		Fixture._smoke_fail(shell, str(saved.get("error", "real Action Point workflow save failed")))
		return false
	var classic = shell._bridge.request("project.compile-classic-slice", {"directory": classic_output})
	if not bool(classic.get("ok", false)):
		Fixture._smoke_fail(shell, str(classic.get("error", "real Action Point Classic publication failed")))
		return false
	var compiler = shell._bridge.request("compiler.describe")
	if not bool(compiler.get("ok", false)):
		Fixture._smoke_fail(shell, str(compiler.get("error", "compiler identity was unavailable")))
		return false
	var rebuilt = shell._bridge.request("project.compile-rebuilt-package", {
		"path": rebuilt_output,
		"compilerCommit": str((compiler.result as Dictionary).get("commit", "unavailable")),
		"minimumEngineVersion": REBUILT_MINIMUM_ENGINE_VERSION,
	})
	if not bool(rebuilt.get("ok", false)):
		Fixture._smoke_fail(shell, str(rebuilt.get("error", "real Action Point Rebuilt publication failed")))
		return false
	print("PROVIDENCE_REAL_ACTION_POINT_LINK_OK revision=5 message=20 encounter=1 classic=%s rebuilt=%s" % [
		str((classic.result as Dictionary).get("manifestSha256", "")),
		str((rebuilt.result as Dictionary).get("archiveSha256", "")),
	])
	return true

static func _run_cob_map_link_smoke(shell: Control) -> void:
	if not shell._bridge.is_project_backed():
		Fixture._smoke_fail(shell, "City of Bywater map link smoke requires PROVIDENCE_PROJECT_PATH")
		return
	if shell._session_view.revision != 1 or shell._maps.document.maps.size() != 11 or shell._strings._message_total != 880:
		Fixture._smoke_fail(shell, "City of Bywater baseline did not retain revision 1, 11 maps, and 880 messages")
		return

	if not await _open_cob_map_browser(shell): return
	if not await _verify_cob_inspector(shell): return
	if not await _repair_cob_link(shell): return
	if not await _reopen_cob_link(shell): return
	print("PROVIDENCE_COB_MAP_LINK_OK revision=3 maps=11 actionPoint=action-point:land:0:0 message=50")
	shell.get_tree().quit(0)


static func _open_cob_map_browser(shell: Control) -> bool:
	await shell._navigation.activate_domain("maps", false)
	await shell._navigation.select_tab(1)
	await shell.get_tree().process_frame
	if not shell._map_context_sidebar.visible or int(shell._map_context_sidebar.visible_map_count()) != 11:
		Fixture._smoke_fail(shell, "City of Bywater did not populate all 11 maps in the Scenario Maps browser")
		return false
	var map_collection = shell._map_context_sidebar.find_child("MapCollection", true, false) as ItemList
	var map_index := -1
	for index in range(map_collection.item_count):
		if str(map_collection.get_item_metadata(index)) == "land:0":
			map_index = index
			break
	if map_index < 0:
		Fixture._smoke_fail(shell, "City of Bywater Land 0 was absent from the Scenario Maps browser")
		return false
	map_collection.select(map_index)
	map_collection.item_selected.emit(map_index)
	await _settle(shell)
	if shell._maps.document.identity != "land:0" or shell._workbenches.land.render_atlas_identity().is_empty():
		Fixture._smoke_fail(shell, "Scenario Maps selection did not open City of Bywater Land 0 with its render atlas")
		return false
	return true


static func _verify_cob_inspector(shell: Control) -> bool:
	shell._workbenches.land.select_cell(9, 17)
	await _settle(shell)
	if str(shell._maps.document.selected_action_point.get("identity", "")) != "action-point:land:0:0":
		Fixture._smoke_fail(shell, "City of Bywater cell 9,17 did not select its placed Action Point 0")
		return false
	if (
		not (shell._map_inspector.find_child("SelectedActionPointPanel", true, false) as PanelContainer).visible
		or not str((shell._map_inspector.find_child("CurrentMapReferenceTarget", true, false) as Label).text).contains("Message 50")
	):
		Fixture._smoke_fail(shell, "City of Bywater selection did not populate the approved AP and Links/Uses Inspector (panel=%s target=%s references=%d)" % [
			str((shell._map_inspector.find_child("SelectedActionPointPanel", true, false) as PanelContainer).visible),
			str((shell._map_inspector.find_child("CurrentMapReferenceTarget", true, false) as Label).text),
			shell._session_view.references.size(),
		])
		return false
	(shell._map_inspector.find_child("OpenSelectedActionPoint", true, false) as Button).pressed.emit()
	await _settle(shell)
	if shell._document_tabs.current_tab != 5 or str(shell._documents.view("scripts.action-points").current_action_point().get("identity", "")) != "action-point:land:0:0":
		Fixture._smoke_fail(shell, "Map Action Point activation did not open City of Bywater Action Point 0")
		return false
	if Fixture._action_target(shell, shell._documents.view("scripts.action-points").current_action_point(), 0) != 50 or not _select_action_point_slot_for_smoke(shell, 0):
		Fixture._smoke_fail(shell, "City of Bywater Action Point 0 did not expose its pinned Message 50 link")
		return false
	(shell._documents.view("scripts.action-points").find_child("PeekActionPointTarget", true, false) as Button).pressed.emit()
	await _settle(shell)
	if shell._document_tabs.current_tab != 0 or shell._strings._selected_identity != "message:50":
		Fixture._smoke_fail(shell, "Action Point Peek did not navigate to City of Bywater Message 50")
		return false
	return true


static func _repair_cob_link(shell: Control) -> bool:
	shell._document_tabs.current_tab = 1
	shell._workbenches.land.select_cell(9, 17)
	await _settle(shell)
	(shell._map_inspector.find_child("MapReferenceRepairTarget", true, false) as SpinBox).value = 30000
	(shell._map_inspector.find_child("RepairMapReference", true, false) as Button).pressed.emit()
	await _settle(shell)
	if shell._session_view.revision != 2 or _missing_action_point_diagnostic_state(shell, "action-point:land:0:0") != 1:
		Fixture._smoke_fail(shell, "Map Inspector did not diagnose the deliberate missing Message target at revision 2")
		return false

	(shell._map_inspector.find_child("MapReferenceRepairTarget", true, false) as SpinBox).value = 50
	(shell._map_inspector.find_child("RepairMapReference", true, false) as Button).pressed.emit()
	await _settle(shell)
	if shell._session_view.revision != 3 or _missing_action_point_diagnostic_state(shell, "action-point:land:0:0") != 0:
		Fixture._smoke_fail(shell, "Map Inspector did not resolve Message 50 at revision 3")
		return false
	return true


static func _reopen_cob_link(shell: Control) -> bool:
	var saved = shell._bridge.request("project.save")
	if not bool(saved.get("ok", false)):
		Fixture._smoke_fail(shell, str(saved.get("error", "City of Bywater workflow save failed")))
		return false
	var reopened = shell._bridge.start_project(shell._bridge.current_project_path())
	if not bool(reopened.get("ok", false)):
		Fixture._smoke_fail(shell, str(reopened.get("error", "City of Bywater workflow reopen failed")))
		return false
	await shell._activate_session(reopened)
	var opened = shell._bridge.request("action-point.open", {"identity": "action-point:land:0:0"})
	if not bool(opened.get("ok", false)) \
			or shell._session_view.revision != 3 \
			or Fixture._action_target(shell, (opened.result as Dictionary).get("actionPoint", {}) as Dictionary, 0) != 50:
		Fixture._smoke_fail(shell, "City of Bywater repaired Message 50 link did not survive save and reopen")
		return false
	return true

static func _select_action_point_slot_for_smoke(shell: Control, slot: int) -> bool:
	var tree = shell._documents.view("scripts.action-points").find_child("ActionPointActions", true, false) as Tree
	if tree == null or tree.get_root() == null:
		return false
	var item := tree.get_root().get_first_child()
	while item != null:
		var metadata: Variant = item.get_metadata(0)
		if metadata is Dictionary and int((metadata as Dictionary).get("slot", -1)) == slot:
			item.select(0)
			tree.item_selected.emit()
			return true
		item = item.get_next()
	return false

static func _missing_action_point_diagnostic_state(shell: Control, identity: String) -> int:
	var response = shell._bridge.request("validation.list", {"offset": 0, "limit": 128})
	if not bool(response.get("ok", false)):
		return -1
	for value in (response.result as Dictionary).get("items", []) as Array:
		var diagnostic := value as Dictionary
		if str(diagnostic.get("entity", "")) == identity and str(diagnostic.get("code", "")).ends_with(".missing"):
			return 1
	return 0


static func _settle(shell: Control) -> void:
	await shell.get_tree().process_frame
	while shell._operations.busy: await shell.get_tree().process_frame
