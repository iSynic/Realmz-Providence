extends SceneTree

class FaultBridge extends "res://src/native_bridge.gd":
	var lose_method := ""
	var reject_method := ""
	var malformed_preview := false
	var preview_delay_msec := 0
	var writes := 0
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method == "classic-rule-selection.preview" and preview_delay_msec > 0:
			var delay := preview_delay_msec
			preview_delay_msec = 0
			OS.delay_msec(delay)
		if method == "classic-rule-selection.preview" and malformed_preview:
			return {"ok":true,"result":{"validChoice":true,"ready":false,
				"raceSource":"scenario","casteSource":"application",
				"message":"selected scenario Data Race must contain 30 usable records; found 0"}}
		if method in ["classic-rule-selection.set", "classic-rule-selection.clear"]:
			writes += 1
			if method == reject_method:
				reject_method = ""
				return {"ok":false, "error":"Controlled write rejection; saved choice unchanged."}
		var result: Dictionary = super._request(method, params)
		if method == lose_method:
			lose_method = ""
			return {"ok":false, "outcomeUnknown":true, "error":"Controlled lost acknowledgement after durable Classic rule choice."}
		return result

var shell: Control
var view: Control
var dialog: Window
var output := ""
var captures: Array = []
var checks: Array[String] = []
var capture_enabled := false

func _initialize() -> void: _run.call_deferred()

func _run() -> void:
	create_timer(240).timeout.connect(func(): push_error("Classic rule journey timed out"); quit(1))
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 3, "Owned imported project, fresh project and output required")
	output = args[2]
	capture_enabled = DisplayServer.get_name() != "headless"
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.gui_embed_subwindows = true
	shell = load("res://src/editor_shell.tscn").instantiate()
	shell._bridge = FaultBridge.new(args[0].get_base_dir().path_join("settings.cfg"))
	root.add_child(shell); await process_frame
	await shell._project_session.open_project(args[0]); await settle()
	await shell._navigation.select_route("scenario.startup"); await settle()
	view = shell._documents.view("scenario.startup"); dialog = view._rule_dialog
	await _states()
	await _interaction()
	await _invalid_preview_races()
	await _history(args[0])
	await _recovery(args[0])
	await shell._project_session.open_project(args[1]); await settle()
	await shell._navigation.select_route("scenario.startup"); await settle()
	check(view.find_child("ClassicRuleSource",true,false).disabled, "Fresh project keeps authored rules and disables imported context")
	for size in [Vector2i(1920,1080),Vector2i(1600,900)] if capture_enabled else [Vector2i(1600,900)]:
		DisplayServer.window_set_size(size); root.content_scale_size=size; root.size=size
		await capture("fresh-project")
	var file := FileAccess.open(output.path_join("native-receipt.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify({"checks":checks,"captures":captures,
		"controlledVisualStates":["Malformed-table preview uses the core-tested zero-row diagnostic", "Loading and failure displays use controlled responses; recovery later exercises durable writes"],
		"buildIdentity":shell._bridge.request("build.identity").result},"  "))
	file.close(); shell._bridge.stop(); shell.free(); await process_frame
	print("PROVIDENCE_CLASSIC_RULE_SELECTION_NATIVE_OK checks=",checks.size()," captures=",captures.size())
	quit()

func settle() -> void:
	var idle := 0
	var deadline := Time.get_ticks_msec()+60000
	while idle < 8:
		assert(Time.get_ticks_msec()<deadline,"Native selection workflow timeout")
		await process_frame
		idle = 0 if shell._operations.busy or view != null and view._rule_controller._previewing else idle+1

func check(condition: bool, description: String) -> void:
	if not condition:
		push_error(description); quit(1); return
	checks.append(description)
	print("CHECK ",description)

func slot(policy: int, value: int) -> void:
	dialog.get_node("%RuleSource").select(policy)
	dialog.get_node("%MenuSlot").value = value
	dialog._changed()
	await settle()

func saved() -> Dictionary:
	return shell._bridge.request("classic-rule-selection.open").result

func open_dialog() -> void:
	view.find_child("ClassicRuleSource",true,false).grab_focus()
	view.find_child("ClassicRuleSource",true,false).pressed.emit()
	await settle()
	check(dialog.visible,"Clean imported Startup opens its owned modal")

func _states() -> void:
	for size in [Vector2i(1920,1080),Vector2i(1600,900)] if capture_enabled else [Vector2i(1600,900)]:
		DisplayServer.window_set_size(size); root.content_scale_size=size; root.size=size; await settle()
		await open_dialog(); await capture("saved-application")
		check(dialog.get_node("%ApplyChoice").disabled,"Current choice is a no-op")
		await slot(0,10); await capture("clear-choice")
		check(dialog.get_node("%Status").text.contains("Apply clears"), "Clear explains its saved-choice and export consequence")
		await view._rule_controller.apply(); await settle()
		await open_dialog(); await capture("unconfigured")
		await slot(1,10); await view._rule_controller.apply(); await settle()
		await open_dialog()
		await slot(1,11); await capture("dirty-choice")
		await slot(2,19); await capture("invalid-slot")
		check(dialog.get_node("%ApplyChoice").disabled,"Invalid policy range cannot Apply")
		shell._bridge.malformed_preview = true
		await slot(2,20)
		shell._bridge.malformed_preview = false
		check(dialog.get_node("%Status").text.contains("found 0"), "Malformed active-table preview explains the blocker")
		await capture("blocked-rule-table")
		check(dialog.get_node("%Preview").text.contains("Invalid") and dialog.get_node("%Status").text.contains("can be saved"), "Malformed preview separates saving the choice from blocked export")
		check(not dialog.get_node("%ApplyChoice").disabled,"Valid metadata remains authorable when effective table blocks export: " + dialog.get_node("%Status").text + " / " + str(dialog.choice()) + " / " + str(dialog._saved_slot))
		dialog.present_failure({"ok":false,"error":"Controlled write rejection; saved choice unchanged."})
		await capture("write-failure")
		await view._rule_controller.reload_saved(); await settle()
		await slot(2,20)
		shell._bridge.preview_delay_msec = 1500
		dialog._changed()
		await process_frame; await process_frame
		await capture("loading", false)
		check(not dialog.get_node("%Cancel").disabled and not dialog.can_apply(), "Pending preview is cancellable and cannot submit")
		dialog.cancel(); await settle()
		check(not dialog.visible and saved().context.nativeMenuSelection == 10, "Cancelled pending preview cannot reopen the dialog or mutate the selection")
		await open_dialog(); await slot(2,20)
		dialog.writing({"nativeMenuSelection":20})
		dialog.present_failure({"ok":false,"outcomeUnknown":true}); await capture("uncertain-write")
		if capture_enabled:
			dialog.get_node("%CopyChoice").pressed.emit()
			check(JSON.parse_string(DisplayServer.clipboard_get()).get("nativeMenuSelection") == 20, "Copy choice round-trips the frozen submitted receipt")
		dialog.reset()
		view.text_field("StartupX").text="90"; view.draft_changed(); await settle()
		check(view.find_child("ClassicRuleSource",true,false).disabled,"Startup draft disables separate context writes")
		await capture("parent-dirty"); view.discard_draft(); await settle()
	check(saved().context.nativeMenuSelection==10,"All visual browsing and failure displays leave saved choice unchanged")

func _interaction() -> void:
	await open_dialog()
	await slot(1,11)
	await key(dialog,KEY_ESCAPE)
	check(not dialog.visible and saved().context.nativeMenuSelection==10,"Escape cancels local choice without writes")
	check(view.get_viewport().gui_get_focus_owner()==view.find_child("ClassicRuleSource",true,false),"Cancel restores originating Startup focus")
	await open_dialog(); await slot(1,11)
	dialog.get_node("%ApplyChoice").grab_focus(); await key(dialog,KEY_SPACE); await settle()
	check(saved().context.nativeMenuSelection==11,"Keyboard acceptance commits real guarded selection")
	check(not dialog.visible and view.get_viewport().gui_get_focus_owner()==view.find_child("ClassicRuleSource",true,false),"Successful Apply reloads Startup and restores focus")
	await open_dialog(); await slot(1,10)
	await click(dialog,dialog.get_node("%Cancel")); await settle()
	check(not dialog.visible and saved().context.nativeMenuSelection==11,"Mouse Cancel preserves committed selection")
	await open_dialog(); await slot(1,10)
	await click(dialog,dialog.get_node("%ApplyChoice")); await settle()
	check(saved().context.nativeMenuSelection==10,"Mouse Apply commits selected metadata")
	await open_dialog(); await slot(1,11)
	var stale: Dictionary = view._rule_controller._guards()
	dialog.cancel(); view.hide(); await process_frame; view.show(); await view.refresh_workbench(); await settle()
	check(not dialog.visible and view._rule_controller._saved.is_empty(),"Navigation teardown invalidates local destination")
	var before: int = saved().revision
	await view._rule_controller.apply()
	check(saved().revision==before,"Stale closed destination cannot submit")
	stale.expectedRevision=before-1; stale.nativeMenuSelection=11
	check(not shell._bridge.request("classic-rule-selection.set",stale).ok,"Adapter rejects stale revision independently of UI")

func _invalid_preview_races() -> void:
	await open_dialog()
	var baseline := saved()
	for policy in [1, 2]:
		await slot(policy, 10 if policy == 1 else 20)
		shell._bridge.preview_delay_msec = 1500
		dialog._changed(); await process_frame; await process_frame
		dialog.get_node("%MenuSlot").value = 20 if policy == 1 else 19
		await settle()
		check(not dialog.can_apply() and dialog.get_node("%ApplyChoice").disabled and dialog.get_node("%Status").text.begins_with("Enter a slot"), "Late valid preview cannot enable an invalid current policy/slot: " + str(policy))
		await view._rule_controller.apply(); await settle()
		check(saved() == baseline, "Invalid selection cannot submit or change saved revision after delayed preview: " + str(policy))
	dialog.cancel()


func _history(project: String) -> void:
	await open_dialog(); await slot(0,10)
	await view._rule_controller.apply(); await settle()
	check(saved().context==null,"Clear is an explicit durable command")
	await open_dialog(); dialog.cancel()
	var result: Dictionary = shell._bridge.request("history.undo",{"expectedRevision":int(saved().revision)})
	check(result.ok and saved().context.nativeMenuSelection==10,"Undo restores exact rule selection")
	result=shell._bridge.request("history.redo",{"expectedRevision":int(saved().revision)})
	check(result.ok and saved().context==null,"Redo restores explicit unresolved state")
	check(shell._bridge.request("project.save").ok,"Save persists selected context segment")
	await shell._project_session.open_project(project); await settle()
	check(saved().context==null,"Save/reopen retains clear choice without menu inference")
	await shell._navigation.select_route("scenario.startup"); await settle()
	await open_dialog(); await slot(1,10); await view._rule_controller.apply(); await settle()

func _recovery(project: String) -> void:
	await open_dialog(); await slot(1,11)
	shell._bridge.reject_method="classic-rule-selection.set"
	await view._rule_controller.apply(); await settle()
	check(dialog.visible and dialog.choice()==11 and saved().context.nativeMenuSelection==10,"Rejected write retains local choice and saved baseline")
	check(dialog.get_node("%ApplyChoice").disabled and dialog.get_node("%ReloadSaved").visible,"Known failure requires explicit baseline reload")
	await view._rule_controller.reload_saved(); await settle()
	check(dialog.choice()==11 and dialog.can_apply(),"Reload saved preserves attempted local choice for comparison")
	shell._bridge.lose_method="classic-rule-selection.set"
	await view._rule_controller.apply(); await settle()
	var writes: int=shell._bridge.writes
	check(dialog.visible and shell._operations.requires_reopen,"Lost acknowledgement freezes write flow")
	await view._rule_controller.apply(); await settle()
	check(shell._bridge.writes==writes and dialog.get_node("%CopyChoice").visible,"Uncertain write cannot replay and exposes frozen receipt")
	dialog.cancel(); await open_dialog()
	check(dialog._unknown and not dialog.can_apply(),"Close/reopen keeps uncertain receipt until project replacement")
	dialog.cancel()
	await shell._navigation.select_route("scenario.contact"); await settle()
	await shell._navigation.select_route("scenario.startup"); await settle()
	await open_dialog()
	check(dialog._unknown and not dialog.can_apply(),"Navigation preserves uncertain receipt without restoring a writable destination")
	dialog.cancel()
	await shell._project_session.open_project(project); await settle()
	check(saved().context.nativeMenuSelection==11,"Project reopen reads actual durable outcome without mutation replay")
	check(not dialog._unknown,"Project replacement retires old uncertain receipt")

func key(window: Window, code: Key) -> void:
	for down in [true,false]:
		var event:=InputEventKey.new(); event.keycode=code; event.pressed=down
		window.push_input(event); await process_frame

func click(window: Window, button: Control) -> void:
	var motion := InputEventMouseMotion.new()
	motion.position = Vector2(window.position) + button.get_global_rect().get_center()
	motion.global_position = motion.position
	root.push_input(motion, true); await process_frame
	for down in [true,false]:
		var event:=InputEventMouseButton.new(); event.button_index=MOUSE_BUTTON_LEFT
		event.position=motion.position; event.global_position=event.position; event.pressed=down
		root.push_input(event, true); await process_frame

func capture(state: String, wait_for_idle := true) -> void:
	if not capture_enabled: return
	if wait_for_idle: await settle()
	await RenderingServer.frame_post_draw
	var size:=DisplayServer.window_get_size()
	var path:="%s-%dx%d.png" % [state,size.x,size.y]
	assert(root.get_texture().get_image().save_png(output.path_join(path))==OK)
	captures.append({"state":state,"size":[size.x,size.y],"path":path,"dialogVisible":dialog.visible})
