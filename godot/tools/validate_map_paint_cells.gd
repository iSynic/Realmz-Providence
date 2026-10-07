extends "res://tools/validate_map_paint_behavior.gd"

class CellBridge extends BehaviorBridge:
	var cell_writes := 0
	var reject_cell := false
	var drop_cell := false
	var drop_cell_open := false
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method == "land-cell.open" and drop_cell_open:
			drop_cell_open = false; return {"ok":false,"outcomeUnknown":true,"error":"Controlled cell opening reply loss"}
		if method == "land-cell.apply" and reject_cell:
			reject_cell = false; return {"ok":false,"error":"Controlled cell rejection"}
		var response: Dictionary = super._request(method,params)
		if method == "land-cell.apply" and response.get("ok",false):
			cell_writes += 1
			if drop_cell: drop_cell = false; return {"ok":false,"outcomeUnknown":true,"error":"Controlled cell reply loss"}
		return response


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or not args[0].get_file().begins_with("providence-ui-paint-"): push_error("A disposable cell root is required"); quit(1); return
	var prior := OS.get_environment("PROVIDENCE_PROJECT_PATH"); OS.set_environment("PROVIDENCE_PROJECT_PATH","")
	root.size = Vector2i(1600,900); root.gui_embed_subwindows = true
	var shell: Control = load("res://src/editor_shell.tscn").instantiate(); shell.set_script(CheckedShell); root.add_child(shell)
	await _frames(3); shell._bridge.stop(); shell._bridge = CellBridge.new(args[0].path_join("cell-settings.cfg"))
	var project: String = args[0].path_join("cell-project")
	var created: Dictionary = shell._bridge.create_project("cell-behavior",project)
	if _check(created.get("ok",false),"Cell project could not open"):
		await shell._activate_session(created)
		if await _setup(shell): await _cell_edit(shell); await _cell_recovery(shell); await _cell_remove(shell,args[0]); await _cell_save(shell,project)
	shell.free(); await _frames(2); OS.set_environment("PROVIDENCE_PROJECT_PATH",prior)
	if not _failed: print("PROVIDENCE_MAP_PAINT_CELLS_OK secrets metadata scripts atomic cancel focus history unavailable removal configured-clear failed-draft original-result no-replay stale save-reopen teardown")
	quit(1 if _failed else 0)


func _open_cell(shell,x: int,y: int) -> void:
	shell._workbenches.land.select_cell(x,y); await _settle(shell)
	shell._workbenches.land.get_node("PaintSelectionContext/CellDetails").pressed.emit(); await _settle(shell)


func _cell_edit(shell) -> void:
	await _open_cell(shell,3,3)
	var controller = shell._maps.cell_behavior; var window = controller.view
	var before: int = _tiles(shell)[273]; var revision: int = shell._session_view.revision
	window.get_node("%SecretState").select(1); window.get_node("%SecretState").item_selected.emit(1)
	await controller.review()
	_check(window.review_is_current() and _tiles(shell)[273] == before and shell._session_view.revision == revision,"Secret preview wrote early")
	window.get_node("%DiscardCellBehavior").pressed.emit(); window.cancel(); await _frames(2)
	_check(not window.visible and shell._workbenches.land.get_node("PaintSelectionContext/CellDetails").has_focus() and _tiles(shell)[273] == before,"Cell Cancel changed terrain or lost focus")
	await controller.open(); window.get_node("%SecretState").select(1); window.get_node("%SecretState").item_selected.emit(1)
	await controller.review(); await controller.apply_review(); await _settle(shell)
	_check(_tiles(shell)[273] == (0x6000|3112) and shell._session_view.revision == revision + 1,"Secret Apply lost metadata or was not atomic")
	await shell._undo(); _check(_tiles(shell)[273] == before,"Secret Undo lost the original cell")
	await shell._redo(); _check(_tiles(shell)[273] == (0x6000|3112),"Secret Redo lost the draft")


func _cell_recovery(shell) -> void:
	shell._bridge.drop_cell_open = true
	await _open_cell(shell,3,3)
	var controller = shell._maps.cell_behavior; var window = controller.view
	_check(window.visible and window.get_node("%RecoverCellBehavior").visible and window.get_node("%ApplyCellBehavior").disabled,"Unknown cell opening had no owned recovery control")
	var initial_writes: int = shell._bridge.cell_writes
	await controller.check_original(); await _settle(shell)
	_check(window.visible and not window.context.is_empty() and shell._bridge.cell_writes == initial_writes,"Opening recovery lost its destination or wrote a mutation")
	window.get_node("%SecretState").select(2); window.get_node("%SecretState").item_selected.emit(2); await controller.review()
	shell._bridge.reject_cell = true; var rejected: Dictionary = await controller.apply_review()
	_check(not rejected.get("ok",false) and window.has_unapplied_changes() and window.visible,"Cell rejection lost its local draft")
	await controller.review(); var writes: int = shell._bridge.cell_writes; shell._bridge.drop_cell = true
	var lost: Dictionary = await controller.apply_review()
	_check(lost.get("outcomeUnknown",false) and window.get_node("%RecoverCellBehavior").visible and window.get_node("%ApplyCellBehavior").disabled,"Unknown cell write was not locked for original-result recovery")
	await controller.check_original(); await _settle(shell)
	_check(not window.visible and _tiles(shell)[273] == (0x6000|2112) and shell._bridge.cell_writes == writes + 1,"Cell recovery resubmitted or lost its acknowledged change")


func _cell_remove(shell, scratch: String) -> void:
	if not await _custom_behavior(shell,scratch): return
	if not _mutate(shell,"landlook-base.set",{"landlook":6,"baseTile":7,"baseScale":1}): return
	var opened: Dictionary = shell._bridge.request("map.open",{"identity":"land:1"})
	var runtime: Dictionary = opened.result.map.runtime.duplicate(true); runtime.baseTile = 19
	if not _mutate(shell,"map-runtime.set",{"identity":"land:1","metadata":_integer_fields(runtime)}): return
	await shell._maps.document.load_map("land:1"); await _settle(shell)
	await _open_cell(shell,4,3)
	var controller = shell._maps.cell_behavior; var window = controller.view
	_check(window.get_node("%Passability").disabled and not window.get_node("%PassabilityReason").text.is_empty(),"Missing passability row lacked an availability reason")
	window.get_node("%RemovePlacement").pressed.emit(); await _settle(shell)
	_check(window.review_is_current() and _tiles(shell)[274] == -3112,"Placement removal skipped explicit review")
	await controller.apply_review(); await _settle(shell)
	_check(_tiles(shell)[274] == 3007,"Placement removal ignored configured clear tile or secret state")
	await shell._undo(); _check(_tiles(shell)[274] == -3112,"Removal Undo lost the exact special placement")
	await controller.open(); window.get_node("%SecretState").select(0); window.get_node("%SecretState").item_selected.emit(0); await controller.review()
	shell._workbenches.land.select_cell(0,0); await _settle(shell)
	var revision: int = shell._session_view.revision; var stale: Dictionary = await controller.apply_review()
	_check(stale.get("stale",false) and not window.visible and shell._session_view.revision == revision,"A stale selected cell accepted an old behavior draft")


func _cell_save(shell,path: String) -> void:
	await shell._project_session.save(); var response: Dictionary = shell._bridge.start_project(path)
	_check(response.get("ok",false),"Cell project did not reopen")
	await shell._activate_session(response); await shell._maps.document.load_map("land:1"); await _settle(shell)
	_check(_tiles(shell)[273] == (0x6000|2112) and _tiles(shell)[274] == -3112,"Cell behavior did not survive Save/reopen")
