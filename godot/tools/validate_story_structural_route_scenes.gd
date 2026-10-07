extends SceneTree

const ROUTES := {
	"scripts.action-points": "res://src/action_point_editor.tscn",
	"scripts.macros": "res://src/extra_action_point_editor.tscn",
	"scripts.global-macros": "res://src/global_macro_editor.tscn",
	"scripts.quests": "res://src/story_flags_editor.tscn",
	"text.messages": "res://src/string_editor.tscn",
	"text.text-resources": "res://src/reference_strings.tscn",
	"text.spell-check": "res://src/text_export_check.tscn",
	"encounters.simple": "res://src/simple_encounter_editor.tscn",
	"encounters.complex": "res://src/complex_encounter_editor.tscn",
	"encounters.rogue": "res://src/rogue_encounter_editor.tscn",
	"encounters.timed": "res://src/timed_encounter_editor.tscn",
}

const REQUIRED_NODES := {
	"scripts.action-points": ["StoryRouteTabs", "ActionPointRouteHeader", "ActionPointMasterDetail", "ActionPointCollection", "ActionPointActions", "ActionPointSourceEvidence"],
	"scripts.macros": ["StoryRouteTabs", "ExtraActionPointRouteHeader", "ExtraActionPointMasterDetail", "ExtraActionPointCollection", "ExtraActionPointActions", "ExtraActionPointSourceEvidence"],
	"scripts.global-macros": ["GlobalMacroRouteHeader", "GlobalMacroMasterDetail", "GlobalMacroAssignments", "GlobalMacroPicker", "PreviewSteps", "ApplyHooks", "GlobalMacroSourceEvidence"],
	"scripts.quests": ["QuestHeader", "QuestSearch", "QuestCollection", "QuestIdentity", "Checks", "Changes", "QuestFlow", "ContextNotes", "ApplyLabel", "DisabledReason"],
	"text.messages": ["StringEditorHeader", "TextAuthoringTabs", "OptionLabelsTab", "StringNavigator", "MessageSearch", "MessageCollection", "MessageEditor", "MessageText", "ByteStatus", "SoundContext", "MessageUsedBy", "NewString", "ApplyString", "ImportText", "OccurrenceSearch"],
	"text.text-resources": ["ReferenceStringsHeader", "ReferenceSearch", "ResourceTypeFilter", "ReferenceGroupList", "EntryTable", "EditableText", "SourceProvenance", "StyleEvidence", "DisabledReason"],
	"text.spell-check": ["ExportCheckHeader", "ExportSummary", "IssueFilters", "ExportIssueTable", "MessagePreview", "IssueDetails", "IssueIndex", "OpenOwner", "Refresh"],
	"encounters.simple": ["EncounterMaster", "EncounterSearch", "EncounterCollection", "EncounterDetail", "PromptSettings", "ResponseRows", "ResultColumns", "SimpleEncounterStepDialog", "SimpleEncounterCopyDialog"],
	"encounters.complex": ["EncounterMaster", "EncounterSearch", "EncounterCollection", "RecordToolbar", "PromptSettings", "ResponseColumns", "ResultColumns", "NewEncounter"],
	"encounters.rogue": ["EncounterSearch", "EncounterCollection", "EncounterIdentity", "Caller", "ActionRows", "TrapPrompt", "TrapSound", "TrapSpell", "Tumblers", "OpenMagic"],
	"encounters.timed": ["EncounterSearch", "EncounterCollection", "EncounterIdentity", "EligibilityBanner", "Schedule", "Location", "Day", "Increment", "Chance", "ExtraAP", "RequiredItem", "RequiredQuest"],
}

const DISABLED_ROUTES := {
	"text.text-resources": true,
}


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	for route_id in ROUTES:
		var packed := load(str(ROUTES[route_id])) as PackedScene
		if packed == null:
			_fail("%s has no loadable scene" % route_id)
			return
		var surface := packed.instantiate() as Control
		surface.set_anchors_preset(Control.PRESET_TOP_LEFT)
		# These authoring routes own their browser inside the rail-only profile.
		surface.size = Vector2(1490, 740)
		root.add_child(surface)
		await process_frame
		if not surface.has_method("route_identity") or str(surface.call("route_identity")) != route_id:
			_fail("%s does not own its stable route identity" % route_id)
			return
		for node_name in REQUIRED_NODES[route_id] as Array:
			if surface.find_child(str(node_name), true, false) == null:
				_fail("%s is missing named region %s" % [route_id, node_name])
				return
		if surface.get_combined_minimum_size().x > 1490.0:
			_fail("%s exceeds the compact document width: %.1f" % [route_id, surface.get_combined_minimum_size().x])
			return
		if DISABLED_ROUTES.has(route_id):
			var reason := surface.find_child("DisabledReason", true, false) as Label
			if reason == null or reason.text.strip_edges().is_empty():
				_fail("%s does not explain its visible-disabled state" % route_id)
				return
		surface.queue_free()
		await process_frame
	print("PROVIDENCE_STORY_ROUTE_SCENES_OK routes=11 compactDocumentWidth=1490")
	quit(0)


func _fail(message: String) -> void:
	push_error("PROVIDENCE_STORY_ROUTE_SCENES_FAILED: %s" % message)
	quit(1)
