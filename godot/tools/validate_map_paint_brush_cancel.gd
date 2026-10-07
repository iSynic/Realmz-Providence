extends "res://tools/validate_map_paint_smart_input.gd"

class SlowPreviewBridge extends "res://src/native_bridge.gd":
	var delay_next := false
	func _request(method:String,params:Dictionary) -> Dictionary:
		if delay_next and method in ["smart-terrain.preview","magic-brush.preview"]:
			delay_next=false; OS.delay_msec(1200)
		return super._request(method,params)


func _run() -> void:
	var args:=OS.get_cmdline_user_args()
	if args.is_empty() or not args[0].get_file().begins_with("providence-ui-paint-"): quit(1); return
	if args.size()>1: _capture_root=args[1]
	OS.set_environment("PROVIDENCE_PROJECT_PATH",""); root.size=Vector2i(1600,900); root.gui_embed_subwindows=true
	var shell:Control=load("res://src/editor_shell.tscn").instantiate(); shell.set_script(CheckedShell); root.add_child(shell)
	await _frames(3); shell._bridge.stop(); shell._bridge=SlowPreviewBridge.new(args[0].path_join("cancel-settings.cfg"))
	var created:Dictionary=shell._bridge.create_project("brush-cancel",args[0].path_join("cancel-project"))
	if _check(created.get("ok",false),"Cancellation project creation failed"):
		await shell._activate_session(created)
		if await _setup(shell):
			for viewport in [Vector2i(1920,1080),Vector2i(1600,900)]:
				root.size=viewport; await _frames(4)
				await _smart_cancel(shell); await _magic_cancel(shell)
	shell.free(); await _frames(2)
	if not _failed: print("PROVIDENCE_MAP_PAINT_BRUSH_CANCEL_OK responsive-cancel pending-read discarded-response no-mutation reopen")
	quit(1 if _failed else 0)


func _smart_cancel(shell) -> void:
	var smart=shell._maps.smart_terrain
	await smart.open(); await _settle(shell)
	_choose(smart.view.get_node("%MaskShape"),2)
	var before:=_tiles(shell); shell._bridge.delay_next=true
	await _stroke(shell,Vector2i(20,20),Vector2i(25,25),false)
	while not smart._reviewing: await process_frame
	await _capture("smart-solving",root.size)
	var started:=Time.get_ticks_msec()
	_click(smart.view.get_node("%CancelSmart")); await process_frame
	_check(not smart.is_open() and Time.get_ticks_msec()-started<150,"Smart Cancel waited for the outstanding solver reply")
	await _settle(shell)
	_check(not smart.is_open() and _tiles(shell)==before and shell._maps.land_authoring._overlay.painted.is_empty(),"Canceled Smart reply restored a preview or wrote cells")
	await smart.open(); await _settle(shell)
	_check(smart.view.review_is_current(),"Smart could not reopen and resolve its retained mask")
	smart.discard_draft(); await _settle(shell)


func _magic_cancel(shell) -> void:
	_check(_mutate(shell,"map.update-cell",{"identity":"land:1","x":30,"y":30,"tile":151}),"Magic cancellation seed failed")
	await shell._maps.document.refresh_history(); await _settle(shell)
	var magic=shell._maps.magic_brush; await magic.open()
	var before:=_tiles(shell); shell._bridge.delay_next=true
	await _stroke(shell,Vector2i(30,30),Vector2i(34,30),false)
	while not magic._reading: await process_frame
	await _capture("magic-solving",root.size)
	var started:=Time.get_ticks_msec()
	_click(magic.view.get_node("%Cancel")); await process_frame
	_check(not magic.is_open() and Time.get_ticks_msec()-started<150,"Magic Cancel waited for the outstanding solver reply")
	await _settle(shell)
	_check(not magic.is_open() and magic._plan.is_empty() and _tiles(shell)==before,"Canceled Magic reply restored a plan or wrote cells")
	await magic.open(); await _stroke(shell,Vector2i(30,30),Vector2i(34,30))
	_check(magic._plan.get("canApply",false),"Magic could not reopen after canceling a pending read")
	magic.discard_draft()


func _settle(shell) -> void:
	var stable:=0; var deadline:=Time.get_ticks_msec()+15000
	while Time.get_ticks_msec()<deadline:
		await process_frame
		var idle:bool=not shell._operations.busy and not shell._bridge.operation_busy() and not shell._maps.land_authoring._reading and not shell._maps.land_authoring._accepting_mask and not shell._maps.smart_terrain._busy and not shell._maps.magic_brush._reading
		stable=stable+1 if idle else 0
		if stable>=8: return
	_check(false,"Canceled brush work did not settle")
