extends SceneTree

var shell
var output := ""
var width := 1600
var captures: Array[Dictionary] = []

func _initialize() -> void: _run.call_deferred()

func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 3: quit(1); return
	output = args[0]; width = int(args[1])
	DirAccess.make_dir_recursive_absolute(output)
	root.size = Vector2i(width, 900 if width == 1600 else 1080)
	root.content_scale_size = root.size; root.gui_embed_subwindows = true
	var project := args[2].path_join("project")
	var bridge := ProvidenceNativeBridge.new(args[2].path_join("settings.cfg"))
	if not require(bridge.create_project("rule-native-review", project)): return
	if not populate_rule(bridge, "race", 0): return
	if not populate_rule(bridge, "caste", 1): return
	if not require(bridge.request("scenario-restrictions.update", {"expectedRevision": 2, "restrictions": {"description": "Linked restriction fixture", "maxPartySize": 6, "maxLevel": 0, "bannedRaces": ["classic.race.20"], "bannedCastes": ["classic.caste.21"]}, "operationId": "c".repeat(64)})): return
	bridge.stop()
	shell = load("res://src/editor_shell.tscn").instantiate(); root.add_child(shell); await process_frame
	await shell._project_session.open_project(project)
	for kind in ["race", "caste"]:
		await shell._navigation.select_route("rules." + kind + "s")
		var view: ProvidenceRuleAuthoringEditor = shell._documents.view("rules." + kind + "s")
		var controller
		for candidate in shell._workbenches.rule_commands._controllers:
			if candidate._view == view: controller = candidate
		await controller.open_rule("classic.%s.%d" % [kind, 20 if kind == "race" else 21])
		await idle(controller)
		await preload("res://tools/rule_gate_states.gd").new().run(shell, view, controller, capture, idle)
	var file := FileAccess.open(output.path_join("capture-%d.json" % width), FileAccess.WRITE)
	file.store_string(JSON.stringify({"viewport": [width, root.size.y], "captures": captures, "adapter": shell._bridge.request("build.identity").get("result", {})}, "\t")); file.close()
	shell._close_project(); shell.queue_free(); await process_frame
	print("RULE_NATIVE_CAPTURE_OK"); quit()

func populate_rule(bridge: ProvidenceNativeBridge, kind: String, revision: int) -> bool:
	var review := bridge.request("rule.allocation.review", {"kind": kind, "expectedRevision": revision})
	if not require(review): return false
	var draft: Dictionary = review.result.draft
	var definition: Dictionary = draft.edit.definition
	definition.name = "Dune Walker" if kind == "race" else "Wayfinder"
	definition.description = "A desert traveller with exact scenario-owned mechanics."
	definition.attributeLimits = [3, 18, 3, 18, 3, 18, 3, 18, 3, 18, 3, 18]
	definition.maximumAttacks = 4
	definition.itemCategoryMasks = [13, 4]
	if kind == "race":
		definition.merge({"defaultIconSet": 1, "baseMovement": 12, "magicResistance": 10, "maximumAge": 180, "baseAttacks": 2,
			"eligibleCasteIds": ["classic.caste.1", "classic.caste.2"]}, true)
	else:
		definition.merge({"defaultIcon": 257, "movementBonus": 2, "startMoney": 100, "casteClass": 4,
			"eligibleRaceIds": ["classic.race.20", "classic.race.1"]}, true)
		draft.edit.nativeFields.maximumSpellsPerRound = 3
		draft.edit.nativeFields.startingItems[0] = "classic.item.1"
		draft.edit.nativeFields.startingItems[2] = "classic.item.14"
	return require(bridge.request("rule.draft.apply", {"expectedRevision": revision, "draft": draft, "operationId": ("a" if kind == "race" else "b").repeat(64)}))

func capture(view: ProvidenceRuleAuthoringEditor, state: String, evidence: String) -> void:
	await process_frame; await process_frame; await RenderingServer.frame_post_draw
	var path := output.path_join("%s-%s-%d.png" % [view.rule_kind, state, width])
	root.get_texture().get_image().save_png(path)
	captures.append({"route": view.route_identity(), "state": state, "path": path, "evidence": evidence, "viewport": [width, root.size.y], "minimum": view.get_combined_minimum_size()})

func idle(controller) -> void:
	var stable := 0
	for frame in 1800:
		await process_frame
		stable = stable + 1 if not shell._operations.busy and not shell._bridge.operation_busy() and controller._validation_timer.is_stopped() else 0
		if stable >= 12: return
	push_error("Rule capture exceeded its bounded wait"); quit(1)

func require(result: Dictionary) -> bool:
	if result.get("ok", false): return true
	push_error(str(result)); quit(1); return false
