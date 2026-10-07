extends SceneTree

const OptionalBranchChecks = preload("res://tools/conditional_authoring_optional_branch_checks.gd")
const MiscCharacterChecks = preload("res://tools/conditional_authoring_misc_character_checks.gd")
const RecentChecks = preload("res://tools/conditional_authoring_recent_checks.gd")
const ShiftPositionChecks = preload("res://tools/conditional_authoring_shift_position_checks.gd")
const LabelChecks = preload("res://tools/conditional_authoring_label_checks.gd")
const MonsterNameTagChecks = preload("res://tools/conditional_authoring_monster_name_tag_checks.gd")
const XAP_ID := "extra-action-point:436"
const SPAWN_XAP_ID := "extra-action-point:530"
const TIMED_ENCOUNTER_SLOT := 0
const RANDOM_ITEMS_SLOT := 1
const BATTLE_SLOT := 2
const FATIGUE_SLOT := 3
const STATE_SLOT := 4
const TIME_SLOT := 5
const TIME_BRANCH_SLOT := 6
const DUNGEON_MOVE_SLOT := 3
const MISC_CHARACTER_SLOT := 4
const MISC_CONDITION_SLOT := 5
const TELEPORT_SLOT := 6
const CONDITION_SLOT := 7
const SPELL_POINTS_SLOT := 3

var _shell: Control
var _view: Control
var _workbench: ProvidenceActionStepWorkbench


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 1)
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	_shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(_shell)
	await process_frame
	await _shell._project_session.open_project(args[0])
	assert(_shell._bridge.is_project_backed())
	await _shell._navigation.select_route("scripts.macros")
	assert(await _shell._scripts.open_extra_action_point(XAP_ID))
	_view = _shell._documents.view("scripts.macros")
	_workbench = _view.get_node("%SemanticActionSteps")
	var baseline := _other_steps()
	await _author_timed_encounter_change()
	await _author_random_items()
	await _author_battle_macro()
	await _author_fatigue()
	await _author_boat_camp_state()
	await _author_time_change()
	await _author_time_branch()
	await _view.commit_selected()
	await _settle()
	assert(not _view.has_unapplied_changes())
	assert(await _shell._scripts.open_extra_action_point(XAP_ID))
	await _verify_reopened()
	assert(_other_steps() == baseline)
	await _author_and_verify_spawn_count()
	await _author_and_verify_destroy_related()
	await _author_and_verify_combat_monster_change()
	await _author_and_verify_dungeon_move()
	await MiscCharacterChecks.run(self, MISC_CHARACTER_SLOT, SPAWN_XAP_ID)
	await _author_and_verify_misc_condition_branch()
	await _author_and_verify_move_without_trigger()
	await _author_and_verify_character_condition_branch()
	await _author_and_verify_spell_point_change()
	await _author_and_verify_payment()
	await _author_and_verify_random_encounter_frequency()
	await _author_and_verify_pick_eligibility()
	await _author_and_verify_battle_selection()
	await _author_and_verify_optional_branch()
	await RecentChecks.run(self, SPELL_POINTS_SLOT, SPAWN_XAP_ID)
	await ShiftPositionChecks.run(self, SPELL_POINTS_SLOT, SPAWN_XAP_ID)
	await LabelChecks.run(self, SPELL_POINTS_SLOT)
	_shell._bridge.stop()
	_shell.queue_free()
	await process_frame
	print("CONDITIONAL_ACTION_AUTHORING_OK timed-encounter=named-keep-set-retention random-items=named-count-mode random-encounters=named-chance-disabled-invisible pick-characters=named-eligibility-count battle-selection=named-single-range optional-branches=named-continue-branch quest-test=bounded-scalar stamina-change=named-heal-damage-nonnegative-range quest-value=named-auto-branch percent-branch=bounded-scalar spell-point-branch=nonnegative-required-points party-state=named-distribution-nonnegative-amount map-coordinates=bounded-direct-cells map-tile=destination-scenario-stock-open-back-apply-reopen condition-duration=named-timed-permanent companion-geometry=bounded-absolute-signed-offsets-correct-units direct-victory-points=nonnegative-scalar temple-inflation=bounded-scalar spawn=named-count-allegiance combat-monster=named-count-appearance-picker dungeon-move=named-heading-view move-without-trigger=named-keep-set-destination shift-position=mode-dependent-bounds misc-character=named-mode-dependent-controls misc-condition=named-scope-signed-value character-condition=named-subject-position spell-points=named-give-take-nonnegative-range payment=named-gold-gems destroy-related=named-all-limit monster-name-tag=grouped-value-picker battle=named-range fatigue=classic-integer-multiplier boat-camp=named-no-op time=named-absolute-retention time-branch=named-wildcards-gosub labels=clean apply-reopen=exact unrelated=preserved")
	quit()


func _author_timed_encounter_change() -> void:
	await _choose_action(TIMED_ENCOUNTER_SLOT, "realmz.action.54")
	assert(_workbench._field_controls.timedEncounter.field.targetKind == "timed-encounter")
	_workbench._field_renderer.accept_target("timedEncounter", 0)
	await _settle()
	assert(_choice_labels("percentOrKeepBehavior") == ["Keep current", "Set new value"])
	(_workbench._field_controls.percentOrKeep.control as SpinBox).value = 85
	await _select_choice("percentOrKeepBehavior", 0)
	assert(not _workbench._field_controls.has("percentOrKeep"))
	await _select_choice("percentOrKeepBehavior", 1)
	assert(int((_workbench._field_controls.percentOrKeep.control as SpinBox).value) == 85)
	await _select_choice("incrementOrKeepBehavior", 0)
	await _select_choice("activationDayBase", 1)
	await _select_choice("dayOffsetOrKeepBehavior", 1)
	(_workbench._field_controls.dayOffsetOrKeep.control as SpinBox).value = 3
	await _settle()


func _author_random_items() -> void:
	await _choose_action(RANDOM_ITEMS_SLOT, "realmz.action.65")
	assert(_choice_labels("itemCountMode") == ["Fixed count", "Random count"])
	(_workbench._field_controls.countOrRandomLimit.control as SpinBox).value = 8
	await _select_choice("itemCountMode", 1)
	assert(_workbench._field_controls.countOrRandomLimit.field.label == "Random Maximum")
	assert(int((_workbench._field_controls.countOrRandomLimit.control as SpinBox).value) == 8)
	_workbench._field_renderer.accept_target("itemLow", 1)
	await _settle()
	_workbench._field_renderer.accept_target("itemHigh", 3)
	await _settle()


func _author_and_verify_spawn_count() -> void:
	assert(await _shell._scripts.open_extra_action_point(SPAWN_XAP_ID))
	await _settle()
	await _choose_action(0, "realmz.action.124")
	assert(_choice_labels("spawnCountMode") == ["Fixed count", "Random count"])
	(_workbench._field_controls.countOrRandomLimit.control as SpinBox).value = 12
	await _select_choice("spawnCountMode", 1)
	assert(_workbench._field_controls.countOrRandomLimit.field.label == "Random Maximum")
	assert(int((_workbench._field_controls.countOrRandomLimit.control as SpinBox).value) == 12)
	_workbench._field_renderer.accept_target("monster", 0)
	await _settle()
	assert(_choice_labels("traitorOverride") == ["Keep the monster's authored allegiance", "Use caller/default allegiance", "Force enemy side"])
	await _select_choice("traitorOverride", 1)
	await _view.commit_selected()
	await _settle()
	assert(not _view.has_unapplied_changes())
	assert(await _shell._scripts.open_extra_action_point(SPAWN_XAP_ID))
	await _settle()
	_workbench.focus_slot(0)
	await _settle()
	assert(_selected_value("spawnCountMode") == 1)
	assert(int((_workbench._field_controls.countOrRandomLimit.control as SpinBox).value) == 12)
	assert(_selected_value("traitorOverride") == 1)
	var spawn_step: Dictionary = _workbench.draft_steps()[0]
	assert(int(spawn_step.settings.values.countOrRandomLimit) == -12)
	assert(int(spawn_step.settings.values.traitorOverride) == 1)


func _author_and_verify_destroy_related() -> void:
	await _choose_action(1, "realmz.action.125")
	assert(_choice_labels("destroyCountMode") == ["All matching monsters", "Limit the number"])
	assert(not _workbench._field_controls.has("maxCount"))
	await _select_choice("destroyCountMode", 1)
	assert(_workbench._field_controls.maxCount.field.label == "Maximum To Destroy")
	var selected_tag := await MonsterNameTagChecks.choose(self, "monsterId")
	(_workbench._field_controls.maxCount.control as SpinBox).value = 12
	await _select_choice("includeTraitorSide", 1)
	await _view.commit_selected()
	await _settle()
	assert(not _view.has_unapplied_changes())
	assert(await _shell._scripts.open_extra_action_point(SPAWN_XAP_ID))
	await _settle()
	_workbench.focus_slot(1)
	await _settle()
	assert(_selected_value("destroyCountMode") == 1)
	assert(int((_workbench._field_controls.monsterId.control as SpinBox).value) == selected_tag)
	assert(int((_workbench._field_controls.maxCount.control as SpinBox).value) == 12)
	assert(_workbench._field_controls.monsterId.field.targetKind == null)
	assert(_workbench._field_controls.monsterId.field.valuePickerKind == "monster-name-tag")
	assert(_selected_value("includeTraitorSide") == 1)
	var destroy_step: Dictionary = _workbench.draft_steps()[1]
	assert(int(destroy_step.settings.values.maxCount) == 12)


func _author_and_verify_combat_monster_change() -> void:
	await _choose_action(2, "realmz.action.120")
	await _select_choice("targetClass", 2)
	var selected_tag := await MonsterNameTagChecks.choose(self, "monsterId")
	assert(_choice_labels("combatantCountMode") == ["Make no changes", "Limit the number", "All matching combatants"])
	await _select_choice("combatantCountMode", 2)
	assert(not _workbench._field_controls.has("count"))
	assert(_choice_labels("combatantChange") == ["Change appearance", "Change allegiance"])
	await _select_choice("combatantChange", 1)
	assert(_workbench._field_controls.traitorOverride.field.label == "New Allegiance")
	await _select_choice("traitorOverride", 0)
	await _select_choice("combatantChange", 0)
	assert(_workbench._field_controls.replacementIcon.field.targetKind == "monster-appearance")
	assert(_workbench._field_controls.replacementIcon.control is Button)
	var page: Dictionary = _shell._bridge.request("action-target.list", {
		"query": {"kind": "monster-appearance", "search": "", "limit": 40}
	})
	assert(page.get("ok", false))
	var candidates := page.result.get("items", []) as Array
	assert(not candidates.is_empty())
	var selected_appearance := int((candidates[0] as Dictionary).value)
	_workbench._field_renderer.accept_target("replacementIcon", selected_appearance)
	await _settle()
	assert(int(_workbench._field_controls.replacementIcon.field.value) == selected_appearance)
	assert(not str(_workbench._field_controls.replacementIcon.field.preview.identity).is_empty())
	await _view.commit_selected()
	await _settle()
	assert(not _view.has_unapplied_changes())
	assert(await _shell._scripts.open_extra_action_point(SPAWN_XAP_ID))
	await _settle()
	_workbench.focus_slot(2)
	await _settle()
	assert(_selected_value("targetClass") == 2)
	assert(_selected_value("combatantCountMode") == 2)
	assert(_selected_value("combatantChange") == 0)
	assert(_workbench._field_controls.replacementIcon.control is Button)
	assert(_workbench._field_controls.monsterId.field.targetKind == null)
	assert(_workbench._field_controls.monsterId.field.valuePickerKind == "monster-name-tag")
	assert(int((_workbench._field_controls.monsterId.control as SpinBox).value) == selected_tag)
	var mutation_step: Dictionary = _workbench.draft_steps()[2]
	assert(int(mutation_step.settings.values.count) == -1)
	assert(int(mutation_step.settings.values.replacementIcon) == selected_appearance)
	assert(int(mutation_step.settings.values.traitorOverride) == 0)


func _author_and_verify_dungeon_move() -> void:
	await _choose_action(DUNGEON_MOVE_SLOT, "realmz.action.37")
	assert(_choice_labels("mode") == ["Enter dungeon", "Return to land"])
	await _select_choice("mode", 0)
	assert(_workbench._field_controls.level.field.label == "Dungeon Level")
	assert(_workbench._field_controls.x.field.minimum == 0)
	assert(_workbench._field_controls.x.field.maximum == 89)
	assert(_workbench._field_controls.y.field.minimum == 0)
	assert(_workbench._field_controls.y.field.maximum == 89)
	assert(_choice_labels("signedHeading")[5] == "East · 3D view only")
	await _select_choice("signedHeading", -2)
	_workbench._field_renderer.accept_target("level", 3)
	await _settle()
	(_workbench._field_controls.x.control as SpinBox).value = 12
	(_workbench._field_controls.y.control as SpinBox).value = 9
	await _settle()
	await _view.commit_selected()
	await _settle()
	assert(await _shell._scripts.open_extra_action_point(SPAWN_XAP_ID))
	await _settle()
	_workbench.focus_slot(DUNGEON_MOVE_SLOT)
	await _settle()
	assert(_selected_value("mode") == 0)
	assert(_selected_value("signedHeading") == -2)
	var step: Dictionary = _workbench.draft_steps()[DUNGEON_MOVE_SLOT]
	assert(int(step.settings.values.level) == 3)
	assert(int(step.settings.values.x) == 12)
	assert(int(step.settings.values.y) == 9)
	assert(int(step.settings.values.signedHeading) == -2)


func _author_and_verify_misc_condition_branch() -> void:
	await _choose_action(MISC_CONDITION_SLOT, "realmz.action.86")
	await _select_choice("testSelector", 2)
	assert(_choice_labels("characterScope") == ["Whole party", "Currently picked characters"])
	assert(_choice_labels("signedTestValue").slice(0, 2) == ["Male", "Female"])
	await _select_choice("characterScope", 1)
	await _select_choice("signedTestValue", 1)
	await _select_choice("testSelector", 3)
	assert(not _workbench._field_controls.has("characterScope"))
	assert(not _workbench._field_controls.has("signedTestValue"))
	await _select_choice("testSelector", 2)
	assert(_selected_value("characterScope") == 1)
	assert(_selected_value("signedTestValue") == 1)
	await _view.commit_selected()
	await _settle()
	assert(not _view.has_unapplied_changes())
	assert(await _shell._scripts.open_extra_action_point(SPAWN_XAP_ID))
	await _settle()
	_workbench.focus_slot(MISC_CONDITION_SLOT)
	await _settle()
	assert(_selected_value("testSelector") == 2)
	assert(_selected_value("characterScope") == 1)
	assert(_selected_value("signedTestValue") == 1)
	var step: Dictionary = _workbench.draft_steps()[MISC_CONDITION_SLOT]
	assert(int(step.settings.values.testSelector) == 2)
	assert(int(step.settings.values.signedTestValue) == -1)


func _author_and_verify_move_without_trigger() -> void:
	await _choose_action(TELEPORT_SLOT, "realmz.action.45")
	assert(_choice_labels("levelOrKeepBehavior") == ["Keep current", "Set destination"])
	await _select_choice("levelOrKeepBehavior", 0)
	assert(not _workbench._field_controls.has("levelOrKeep"))
	await _select_choice("xOrKeepBehavior", 1)
	await _select_choice("yOrKeepBehavior", 1)
	(_workbench._field_controls.xOrKeep.control as SpinBox).value = 22
	(_workbench._field_controls.yOrKeep.control as SpinBox).value = 18
	await _settle()
	await _view.commit_selected()
	await _settle()
	assert(not _view.has_unapplied_changes())
	assert(await _shell._scripts.open_extra_action_point(SPAWN_XAP_ID))
	await _settle()
	_workbench.focus_slot(TELEPORT_SLOT)
	await _settle()
	assert(_selected_value("levelOrKeepBehavior") == 0)
	assert(_selected_value("xOrKeepBehavior") == 1)
	assert(_selected_value("yOrKeepBehavior") == 1)
	var step: Dictionary = _workbench.draft_steps()[TELEPORT_SLOT]
	assert(int(step.settings.values.levelOrKeep) == -1)
	assert(int(step.settings.values.xOrKeep) == 22)
	assert(int(step.settings.values.yOrKeep) == 18)


func _author_and_verify_character_condition_branch() -> void:
	await _choose_action(CONDITION_SLOT, "realmz.action.81")
	assert(_choice_labels("characterSelector")[0] == "Whole party")
	assert(_choice_labels("characterSelector")[1] == "Currently picked characters")
	assert(_choice_labels("characterSelector")[7] == "Party position 6 (bottom)")
	await _select_choice("condition", 39)
	await _select_choice("characterSelector", 6)
	await _view.commit_selected()
	await _settle()
	assert(not _view.has_unapplied_changes())
	assert(await _shell._scripts.open_extra_action_point(SPAWN_XAP_ID))
	await _settle()
	_workbench.focus_slot(CONDITION_SLOT)
	await _settle()
	assert(_selected_value("condition") == 39)
	assert(_selected_value("characterSelector") == 6)
	var step: Dictionary = _workbench.draft_steps()[CONDITION_SLOT]
	assert(int(step.settings.values.condition) == 39)
	assert(int(step.settings.values.characterSelector) == 6)


func _author_and_verify_spell_point_change() -> void:
	await _choose_action(SPELL_POINTS_SLOT, "realmz.action.74")
	assert(_choice_labels("spellPointDirection") == ["Give spell points", "Take spell points"])
	await _select_choice("spellPointDirection", 1)
	assert(_workbench._field_controls.signedRollCount.field.label == "Multiplier")
	assert((_workbench._field_controls.lowOrSound.control as SpinBox).min_value == 0)
	assert((_workbench._field_controls.high.control as SpinBox).min_value == 0)
	(_workbench._field_controls.signedRollCount.control as SpinBox).value = 10
	(_workbench._field_controls.lowOrSound.control as SpinBox).value = 1
	(_workbench._field_controls.high.control as SpinBox).value = 6
	await _select_choice("playSound", 0)
	await _view.commit_selected()
	await _settle()
	assert(not _view.has_unapplied_changes())
	assert(await _shell._scripts.open_extra_action_point(SPAWN_XAP_ID))
	await _settle()
	_workbench.focus_slot(SPELL_POINTS_SLOT)
	await _settle()
	assert(_selected_value("spellPointDirection") == 1)
	assert(int((_workbench._field_controls.signedRollCount.control as SpinBox).value) == 10)
	var step: Dictionary = _workbench.draft_steps()[SPELL_POINTS_SLOT]
	assert(int(step.settings.values.signedRollCount) == -10)
	assert(int(step.settings.values.lowOrSound) == 1)
	assert(int(step.settings.values.high) == 6)
	assert(int(step.settings.values.playSound) == 0)


func _author_and_verify_payment() -> void:
	await _choose_action(SPELL_POINTS_SLOT, "realmz.action.33")
	assert(_choice_labels("paymentCurrency") == ["Gold", "Gems"])
	await _select_choice("paymentCurrency", 1)
	assert(_workbench._field_controls.signedAmount.field.label == "Payment Amount")
	(_workbench._field_controls.signedAmount.control as SpinBox).value = 250
	await _select_choice("failureMarker", 2)
	await _select_choice("branchMode", 3)
	await _view.commit_selected()
	await _settle()
	assert(not _view.has_unapplied_changes())
	assert(await _shell._scripts.open_extra_action_point(SPAWN_XAP_ID))
	await _settle()
	_workbench.focus_slot(SPELL_POINTS_SLOT)
	await _settle()
	assert(_selected_value("paymentCurrency") == 1)
	assert(int((_workbench._field_controls.signedAmount.control as SpinBox).value) == 250)
	assert(_selected_value("failureMarker") == 2)
	assert(_selected_value("branchMode") == 3)
	var step: Dictionary = _workbench.draft_steps()[SPELL_POINTS_SLOT]
	assert(int(step.settings.values.signedAmount) == -250)
	assert(int(step.settings.values.failureMarker) == 2)
	assert(int(step.settings.values.branchMode) == 3)


func _author_and_verify_random_encounter_frequency() -> void:
	await _choose_action(SPELL_POINTS_SLOT, "realmz.action.23")
	assert(_choice_labels("encounterFrequency") == ["Use encounter chance", "Disable encounters", "Invisible encounter"])
	_workbench._field_renderer.accept_target("level", 0)
	await _settle()
	_workbench._field_renderer.accept_target("randomRegion", 0)
	await _settle()
	await _select_choice("encounterFrequency", 0)
	(_workbench._field_controls.percent.control as SpinBox).value = 777
	await _select_choice("encounterFrequency", 2)
	assert(not _workbench._field_controls.has("percent"))
	await _select_choice("encounterFrequency", 0)
	assert(int((_workbench._field_controls.percent.control as SpinBox).value) == 777)
	await _view.commit_selected()
	await _settle()
	assert(not _view.has_unapplied_changes())
	assert(await _shell._scripts.open_extra_action_point(SPAWN_XAP_ID))
	await _settle()
	_workbench.focus_slot(SPELL_POINTS_SLOT)
	await _settle()
	assert(_selected_value("encounterFrequency") == 0)
	assert(int((_workbench._field_controls.percent.control as SpinBox).value) == 777)
	var step: Dictionary = _workbench.draft_steps()[SPELL_POINTS_SLOT]
	assert(int(step.settings.values.level) == 0)
	assert(int(step.settings.values.randomRegion) == 0)
	assert(int(step.settings.values.percent) == 777)


func _author_and_verify_pick_eligibility() -> void:
	await _choose_action(SPELL_POINTS_SLOT, "realmz.action.14")
	assert(_choice_labels("pickEligibility") == ["Any party member", "Conscious or animated only"])
	await _select_choice("pickEligibility", 1)
	assert(_workbench._field_controls.targetNativeId.field.label == "Number To Pick")
	(_workbench._field_controls.targetNativeId.control as SpinBox).value = 3
	await _settle()
	await _view.commit_selected()
	await _settle()
	assert(not _view.has_unapplied_changes())
	assert(await _shell._scripts.open_extra_action_point(SPAWN_XAP_ID))
	await _settle()
	_workbench.focus_slot(SPELL_POINTS_SLOT)
	await _settle()
	assert(_selected_value("pickEligibility") == 1)
	assert(int((_workbench._field_controls.targetNativeId.control as SpinBox).value) == 3)
	var step: Dictionary = _workbench.draft_steps()[SPELL_POINTS_SLOT]
	assert(int(step.targetNativeId) == -3)


func _author_and_verify_battle_selection() -> void:
	await _choose_action(SPELL_POINTS_SLOT, "realmz.action.48")
	assert(_choice_labels("battleSelection") == ["Single battle", "Random range"])
	var response: Dictionary = await _shell._bridge.request("action-target.list", {
		"query": {"kind": "battle", "search": "", "limit": 40}
	})
	assert(response.get("ok", false))
	var battles := response.result.get("items", []) as Array
	assert(battles.size() >= 2)
	var low := int((battles[0] as Dictionary).value)
	var high := int((battles[1] as Dictionary).value)
	_workbench._field_renderer.accept_target("battleLow", low)
	await _select_choice("battleSelection", 1)
	assert(_workbench._field_controls.battleHigh.field.targetKind == "battle")
	_workbench._field_renderer.accept_target("battleHigh", high)
	await _settle()
	await _select_choice("battleSelection", 0)
	assert(not _workbench._field_controls.has("battleHigh"))
	await _select_choice("battleSelection", 1)
	assert(int(_workbench._field_controls.battleHigh.field.value) == high)
	await _view.commit_selected()
	await _settle()
	assert(not _view.has_unapplied_changes())
	assert(await _shell._scripts.open_extra_action_point(SPAWN_XAP_ID))
	await _settle()
	_workbench.focus_slot(SPELL_POINTS_SLOT)
	await _settle()
	assert(_selected_value("battleSelection") == 1)
	var step: Dictionary = _workbench.draft_steps()[SPELL_POINTS_SLOT]
	assert(int(step.settings.values.battleLow) == low)
	assert(int(step.settings.values.battleHigh) == high)
	await _select_choice("battleSelection", 0)
	await _view.commit_selected()
	await _settle()
	assert(not _view.has_unapplied_changes())
	assert(await _shell._scripts.open_extra_action_point(SPAWN_XAP_ID))
	await _settle()
	_workbench.focus_slot(SPELL_POINTS_SLOT)
	await _settle()
	assert(_selected_value("battleSelection") == 0)
	assert(not _workbench._field_controls.has("battleHigh"))
	step = _workbench.draft_steps()[SPELL_POINTS_SLOT]
	assert(int(step.settings.values.battleLow) == low)
	assert(int(step.settings.values.battleHigh) == 0)


func _author_and_verify_optional_branch() -> void:
	await OptionalBranchChecks.run(self, SPELL_POINTS_SLOT, SPAWN_XAP_ID)


func _author_battle_macro() -> void:
	await _choose_action(BATTLE_SLOT, "realmz.action.126")
	assert(_choice_labels("mode") == ["After round", "Percent chance each round", "Flee / fail"])
	await _select_choice("mode", 1)
	assert(_workbench._field_controls.roundOrPercent.field.label == "Chance Per Round")
	assert(_workbench._field_controls.roundOrPercent.field.units == "percent")
	assert(int(_workbench._field_controls.roundOrPercent.field.minimum) == 0)
	assert(int(_workbench._field_controls.roundOrPercent.field.maximum) == 100)
	(_workbench._field_controls.roundOrPercent.control as SpinBox).value = 35
	await _select_choice("repeatMode", 2)
	assert(_workbench._field_controls.macroLow.field.label == "Random Range Low")
	assert(_workbench._field_controls.macroHigh.field.label == "Random Range High")
	assert(_workbench._field_controls.macroHigh.field.targetKind == "extra-action-point")
	_workbench._field_renderer.accept_target("macroLow", 41)
	await _settle()
	_workbench._field_renderer.accept_target("macroHigh", 97)
	await _settle()


func _author_fatigue() -> void:
	await _choose_action(FATIGUE_SLOT, "realmz.action.68")
	var labels := _choice_labels("mode")
	assert(labels.size() >= 3)
	assert(labels[0] == "Set fatigue to 100%")
	assert(labels[1] == "Set fatigue to 0%")
	assert(labels[2] == "Calculate from current fatigue")
	await _select_choice("mode", 3)
	var multiplier := _workbench._field_controls.percent as Dictionary
	assert(multiplier.field.label == "Fatigue Multiplier")
	assert(multiplier.field.units == "percent")
	assert(multiplier.field.explanation.contains("1–99"))
	(multiplier.control as SpinBox).value = 99
	await _select_choice("mode", 1)
	assert(not bool(_workbench._field_controls.percent.field.editable))
	assert(int(_workbench._field_controls.percent.field.value) == 99)
	await _select_choice("mode", 3)
	assert(int((_workbench._field_controls.percent.control as SpinBox).value) == 99)


func _author_boat_camp_state() -> void:
	await _choose_action(STATE_SLOT, "realmz.action.103")
	assert(_choice_labels("mode")[0] == "Do not test boat status")
	assert(_choice_labels("statusValue")[0] == "Do not test camping status")
	assert(_choice_labels("branchModeOrBehavior")[0] == "Keep boat state")
	await _select_choice("mode", 1)
	await _select_choice("statusValue", 0)
	await _select_choice("branchModeOrBehavior", 2)
	assert(not _workbench._field_controls.has("targetOrValueA"))
	assert(not _workbench._field_controls.has("targetOrValueB"))


func _author_time_change() -> void:
	await _choose_action(TIME_SLOT, "realmz.action.63")
	assert(_choice_labels("timeOperation") == ["Set absolute time", "Add time offset", "Imported value (0)"])
	await _select_choice("timeOperation", 1)
	assert(_choice_labels("dayOrDeltaBehavior") == ["Keep current", "Set exact value"])
	await _select_choice("dayOrDeltaBehavior", 0)
	assert(not _workbench._field_controls.has("dayOrDelta"))
	(_workbench._field_controls.hourOrDelta.control as SpinBox).value = 22
	await _select_choice("hourOrDeltaBehavior", 0)
	assert(not _workbench._field_controls.has("hourOrDelta"))
	await _select_choice("hourOrDeltaBehavior", 1)
	assert(int((_workbench._field_controls.hourOrDelta.control as SpinBox).value) == 22)
	(_workbench._field_controls.minuteOrDelta.control as SpinBox).value = 45
	assert(str(_workbench._field_controls.minuteOrDelta.field.label) == "Minute")
	await _settle()


func _author_time_branch() -> void:
	await _choose_action(TIME_BRANCH_SLOT, "realmz.action.64")
	assert(_workbench._gosub.visible and not _workbench._gosub.disabled)
	_workbench._gosub.button_pressed = true
	await _select_choice("dayLimitTest", 0)
	assert(not _workbench._field_controls.has("dayLimit"))
	await _select_choice("hourLimitTest", 1)
	(_workbench._field_controls.hourLimit.control as SpinBox).value = 18
	_workbench._field_renderer.accept_target("successMacro", 41)
	await _settle()
	_workbench._field_renderer.accept_target("failureMacro", 42)
	await _settle()


func _verify_reopened() -> void:
	_workbench.focus_slot(TIMED_ENCOUNTER_SLOT)
	await _settle()
	assert(int(_workbench._field_controls.timedEncounter.field.value) == 0)
	assert(_selected_value("percentOrKeepBehavior") == 1)
	assert(int((_workbench._field_controls.percentOrKeep.control as SpinBox).value) == 85)
	assert(_selected_value("incrementOrKeepBehavior") == 0)
	assert(_selected_value("activationDayBase") == 1)
	assert(_selected_value("dayOffsetOrKeepBehavior") == 1)
	assert(int((_workbench._field_controls.dayOffsetOrKeep.control as SpinBox).value) == 3)
	_workbench.focus_slot(RANDOM_ITEMS_SLOT)
	await _settle()
	assert(_selected_value("itemCountMode") == 1)
	assert(int((_workbench._field_controls.countOrRandomLimit.control as SpinBox).value) == 8)
	assert(int(_workbench._field_controls.itemLow.field.value) == 1)
	assert(int(_workbench._field_controls.itemHigh.field.value) == 3)
	var random_step: Dictionary = _workbench.draft_steps().filter(
		func(step): return int(step.slot) == RANDOM_ITEMS_SLOT
	)[0]
	assert(int(random_step.settings.values.countOrRandomLimit) == -8)
	_workbench.focus_slot(BATTLE_SLOT)
	await _settle()
	assert(_selected_value("mode") == 1)
	assert(int((_workbench._field_controls.roundOrPercent.control as SpinBox).value) == 35)
	assert(_selected_value("repeatMode") == 2)
	assert(int(_workbench._field_controls.macroLow.field.value) == 41)
	assert(int(_workbench._field_controls.macroHigh.field.value) == 97)
	_workbench.focus_slot(FATIGUE_SLOT)
	await _settle()
	assert(_selected_value("mode") == 3)
	assert(int((_workbench._field_controls.percent.control as SpinBox).value) == 99)
	_workbench.focus_slot(STATE_SLOT)
	await _settle()
	assert(_selected_value("mode") == 1)
	assert(_selected_value("statusValue") == 0)
	assert(_selected_value("branchModeOrBehavior") == 2)
	_workbench.focus_slot(TIME_SLOT)
	await _settle()
	assert(_selected_value("timeOperation") == 1)
	assert(_selected_value("dayOrDeltaBehavior") == 0)
	assert(_selected_value("hourOrDeltaBehavior") == 1)
	assert(int((_workbench._field_controls.hourOrDelta.control as SpinBox).value) == 22)
	assert(int((_workbench._field_controls.minuteOrDelta.control as SpinBox).value) == 45)
	_workbench.focus_slot(TIME_BRANCH_SLOT)
	await _settle()
	assert(_workbench._gosub.button_pressed)
	assert(_selected_value("dayLimitTest") == 0)
	assert(_selected_value("hourLimitTest") == 1)
	assert(int((_workbench._field_controls.hourLimit.control as SpinBox).value) == 18)
	assert(int(_workbench._field_controls.successMacro.field.value) == 41)
	assert(int(_workbench._field_controls.failureMacro.field.value) == 42)


func _choose_action(slot: int, action_identity: String) -> void:
	_workbench.focus_slot(slot)
	assert(preload("res://tools/divinity_picker_test_actions.gd").choose_fresh(_workbench, action_identity))
	await _settle()


func _select_choice(key: String, value: int) -> void:
	var picker := _workbench._field_controls[key].control as OptionButton
	for index in picker.item_count:
		if int(picker.get_item_metadata(index)) != value: continue
		picker.select(index)
		picker.item_selected.emit(index)
		await _settle()
		return
	assert(false, "Missing choice %s=%d" % [key, value])


func _choice_labels(key: String) -> Array:
	var picker := _workbench._field_controls[key].control as OptionButton
	var labels := []
	for index in picker.item_count: labels.append(picker.get_item_text(index))
	return labels


func _selected_value(key: String) -> int:
	var picker := _workbench._field_controls[key].control as OptionButton
	return int(picker.get_item_metadata(picker.selected))


func _other_steps() -> Array:
	return _workbench.draft_steps().filter(
		func(step): return int(step.slot) not in [TIMED_ENCOUNTER_SLOT, RANDOM_ITEMS_SLOT, BATTLE_SLOT, FATIGUE_SLOT, STATE_SLOT, TIME_SLOT, TIME_BRANCH_SLOT]
	).duplicate(true)


func _settle() -> void:
	var deadline := Time.get_ticks_msec() + 60000
	var idle := 0
	while idle < 4:
		assert(Time.get_ticks_msec() < deadline)
		await process_frame
		var pending: bool = _shell._scripts._form_description_drain_running or not _shell._scripts._pending_form_descriptions.is_empty()
		var description_ready := not _workbench._form_description.is_empty() or _workbench.draft_steps().is_empty()
		idle = 0 if _shell._operations.busy or pending or not description_ready else idle + 1
