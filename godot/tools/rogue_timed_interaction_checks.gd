extends RefCounted

var host


func rogue(view: ProvidenceRogueEncounterEditor, controller: ProvidenceEncounterAuthoringController) -> bool:
	view.get_node("%LowDamage").value = 300; view.get_node("%HighDamage").value = 2
	await view.commit_selected()
	if view.get_viewport().gui_get_focus_owner() != view.get_node("%LowDamage").get_line_edit(): return host._fail("Invalid damage did not focus its named field.")
	await view.discard_draft(); await host.settle()
	if not await _string_picker(view): return false
	var field: ProvidenceEncounterReferenceField = view.get_node("%ActionRows").get_child(1).get_node("Reference2")
	view.change_array("successSounds", 1, -678)
	view.updating = true; view._present_form(); view.updating = false
	view._choose_reference(field); await host.settle()
	var target: Dictionary = host.shell._bridge.request("action-target.list", {"query": {"kind": "sound", "search": "141", "limit": 128}})
	for item: Dictionary in target.result.items:
		if int(item.value) == 141:
			view._picker_items = [item]; view.get_node("%ReferenceResults").clear(); view.get_node("%ReferenceResults").add_item("141"); view.get_node("%ReferenceResults").select(0); view._use_reference(); break
	if field.value != -141 or field.identity().is_empty(): return host._fail("Retargeting changed signed sound semantics or lost exact identity: value=%d identity=%s catalog=%s" % [field.value, field.identity(), JSON.stringify(target)])
	if not await host.shell._media.sounds.preview_application_and_play(field.identity()): return host._fail("Resolved stock sound could not be auditioned.")
	field.get_node("Behavior").button_pressed = false
	if int(view.draft.successSounds[1]) != 141: return host._fail("Sound wait control did not change signed behavior explicitly.")
	await view.discard_draft(); await host.settle()
	if not await _signed_string(view, controller): return false
	host.checks.append("Named failure focus; signed sound retarget and explicit wait behavior")
	view._open_copy(); await host.settle()
	var retained := view.draft.duplicate(true)
	view._close_modal(view.get_node("CopyDialog"))
	if view.draft != retained: return host._fail("Copy cancellation changed the draft.")
	view._open_copy(); await host.settle()
	await controller.copy_source("rogue-encounter:0")
	view.get_node("%Scope1").button_pressed = true; view.get_node("%Scope2").button_pressed = false
	view._accept_copy(); await host.settle()
	for reference in view.find_children("*", "HBoxContainer", true, false):
		if reference is ProvidenceEncounterReferenceField and not reference.target.is_empty() and int(reference.target.value) != reference.resolved_value(): return host._fail("Copy left a stale Open or Audition target.")
	await view.discard_draft(); await host.settle()
	host.checks.append("Copy cancellation is inert; copied references re-resolve before Open or Audition")
	return await _navigation(view, controller) and await _callers(view, controller)


func _string_picker(view: ProvidenceRogueEncounterEditor) -> bool:
	var before := view.draft.duplicate(true)
	var field: ProvidenceEncounterReferenceField = view.get_node("%ActionRows").get_child(1).get_node("Reference0")
	view._choose_reference(field); await host.settle()
	view.get_node("%ReferenceSearch").text = "inspection"; await host.settle()
	var found := false
	for index in range(view._picker_items.size()):
		var target: Dictionary = view._picker_items[index]
		if int(target.value) != 7: continue
		found = true; view.get_node("%ReferenceResults").select(index); view.get_node("%ReferenceResults").item_selected.emit(index)
		if not view.get_node("%ReferenceResults").get_item_text(index).contains("inspection") or not view.get_node("%ReferencePreview").text.contains(str(target.detail)): return host._fail("Content-filtered picker did not show actual selected string text.")
	if not found or not view.get_node("%ReferenceContext").text.contains("Rogue Encounter 1 · Detect Trap · Success string"): return host._fail("String picker lost exact action, field or record context.")
	view.get_node("%ReferenceSearch").text = ""; await host.settle()
	var blank := -1
	for index in range(view._picker_items.size()):
		if int(view._picker_items[index].value) == 26: blank = index; break
	if blank < 0 or not view.get_node("%ReferenceResults").get_item_text(blank).contains("Empty string"): return host._fail("Blank scenario string was hidden or not identified.")
	view.get_node("%ReferenceResults").select(blank); view.get_node("%ReferenceResults").item_selected.emit(blank)
	await host.settle()
	if not view.get_node("%ReferencePreview").text.contains("String 26 · Empty string"): return host._fail("Selected blank-string preview was ambiguous.")
	var long_string := -1
	for index in range(view._picker_items.size()):
		if int(view._picker_items[index].value) == 25: long_string = index; break
	if long_string < 0: return host._fail("Long-string fixture is absent.")
	view.get_node("%ReferenceResults").select(long_string); view.get_node("%ReferenceResults").item_selected.emit(long_string)
	await host.settle()
	var full: Dictionary = host.shell._bridge.request("message.open", {"nativeId": 25})
	if not view.get_node("%ReferencePreview").text.contains(str(full.result.message.text)): return host._fail("Selected String preview was clipped to the catalog snippet.")
	view._new_string()
	if not view.get_node("%StringStatus").text.contains("Rogue Encounter 1 · Detect Trap · Success string"): return host._fail("New String lost its exact destination.")
	view._close_modal(view.get_node("StringDialog")); await host.settle()
	view.get_node("%MoreReferences").pressed.emit(); await host.settle()
	if int(view._picker_items[0].value) < 128: return host._fail("String content preview broke bounded picker paging.")
	view._close_modal(view.get_node("ReferenceDialog"))
	if view.draft != before: return host._fail("Picker/New String cancellation changed the draft.")
	host.checks.append("Real content-filtered String picker shows snippets, explicit blank rows and selected full text; exact destination survives New String, paging and cancellation")
	return true


func _navigation(view: ProvidenceRogueEncounterEditor, controller: ProvidenceEncounterAuthoringController) -> bool:
	var nav = host.shell._navigation
	view.change_array("modifiers", 0, int(view.baseline.modifiers[0]) + 1)
	await nav.open_script_target("complex-encounter", 3, "complex-encounter:3", {"encounterResult": 1})
	if not host.shell._draft_navigation._dialog.visible: return host._fail("Reference navigation bypassed the draft guard.")
	host.shell._draft_navigation._dialog.hide(); host.shell._draft_navigation.cancel()
	if view.selected_identity() != "rogue-encounter:1" or not view.has_unapplied_changes(): return host._fail("Keep Editing lost context.")
	await nav.open_script_target("complex-encounter", 3, "complex-encounter:3", {"encounterResult": 1})
	await host.shell._draft_navigation.discard_and_continue(&"discard"); await host.settle()
	var complex = host.shell._documents.view("encounters.complex")
	if int(complex.read_state().result) != 1: return host._fail("Open Result selected the wrong Complex result.")
	await nav.navigate_back(); await host.settle()
	if view.selected_identity() != "rogue-encounter:1" or view._owner_id != 3: return host._fail("Return lost encounter or caller context.")
	view.change_array("modifiers", 0, int(view.baseline.modifiers[0]) + 1)
	await controller.open_record("rogue-encounter:0")
	await host.shell._draft_navigation.apply_and_continue(); await host.settle()
	if view.selected_identity() != "rogue-encounter:0" or view.has_unapplied_changes(): return host._fail("Apply and Continue did not open the selected record.")
	await controller.open_record("rogue-encounter:1")
	host.checks.append("Dirty navigation Keep Editing, Discard and Apply; exact Complex result and Back context")
	return true


func recovery(view: ProvidenceRogueEncounterEditor, controller: ProvidenceEncounterAuthoringController) -> bool:
	view.change_array("modifiers", 0, int(view.baseline.modifiers[0]) + 1)
	var intent := {"kind": "rogue", "identity": view.selected_identity(), "draft": view.draft.duplicate(true), "creating": false}
	var other := view.draft.duplicate(true); other.modifiers[0] += 1
	var applied: Dictionary = host.shell._bridge.request("encounter.apply-rogue-draft", {"expectedRevision": host.shell._session_view.revision, "draft": other})
	if not applied.get("ok", false): return host._fail(str(applied.get("error")))
	controller._uncertain_intent = intent
	host.shell._bridge._requires_reopen = true; host.shell._operations.requires_reopen = true
	view.show_failure({"ok": false, "outcomeUnknown": true, "error": "The acknowledgement was lost."})
	var blocked: Dictionary = host.shell._bridge.request("encounter.apply-rogue-draft", {"expectedRevision": host.shell._session_view.revision, "draft": intent.draft})
	if blocked.get("ok", false): return host._fail("Unknown transport allowed an unconfirmed replay.")
	await controller.reconcile(); await host.settle()
	if host.shell._operations.requires_reopen or host.shell._bridge._requires_reopen or not view.comparison_pending: return host._fail("Current checkpoint recovery did not clear locks into explicit comparison.")
	if view.draft.modifiers[0] == view.baseline.modifiers[0]: return host._fail("Comparison overwrote the retained draft.")
	view.finish_comparison(false); await host.settle()
	if view.has_unapplied_changes(): return host._fail("Use applied values did not resolve the comparison.")
	host.checks.append("Fully locked unknown transport blocks replay; Check Current reads checkpoint; differing values require comparison")
	return true


func roundtrip() -> bool: return preload("res://tools/encounter_roundtrip_checks.gd").run(host)


func _callers(view: ProvidenceRogueEncounterEditor, controller: ProvidenceEncounterAuthoringController) -> bool:
	var nav = host.shell._navigation
	await nav.open_script_target("complex-encounter", 3, "complex-encounter:3", {})
	await host.settle()
	var complex = host.shell._documents.view("encounters.complex")
	complex._document.thiefSuccess = 0; complex._populate_document()
	if not complex.draft_error().is_empty(): return host._fail("Complex authoring rejects valid Rogue zero.")
	var result: Dictionary = await host.shell._draft_apply.commit()
	if not result.get("ok", false): return host._fail(str(result.get("error")))
	var stored: Dictionary = host.shell._bridge.request("encounter.open-complex", {"identity": "complex-encounter:3"})
	if int(stored.result.encounter.thiefSuccess) != 0 or not stored.result.encounter.thief: return host._fail("Complex Apply did not retain enabled Rogue zero: " + JSON.stringify(stored.result.encounter))
	await nav.open_script_target("rogue-encounter", 0, "rogue-encounter:0", {})
	await host.settle()
	var found := false
	for index in range(view.get_node("%OwnerChoice").item_count):
		var caller: Dictionary = view.get_node("%OwnerChoice").get_item_metadata(index)
		if int(caller.get("nativeId", -1)) == 3: view.get_node("%OwnerChoice").select(index); view._owner_selected(index); found = true
	if view.selected_identity() != "rogue-encounter:0" or not found: return host._fail("Rogue zero did not expose the exact Complex caller.")
	await nav.navigate_back(); await host.settle()
	complex._document.thiefSuccess = 1; complex._populate_document()
	result = await host.shell._draft_apply.commit()
	if not result.get("ok", false): return host._fail(str(result.get("error")))
	var copied: Dictionary = host.shell._bridge.request("encounter.copy-complex", {"source": "complex-encounter:3", "expectedRevision": host.shell._session_view.revision})
	if not copied.get("ok", false): return host._fail(str(copied.get("error")))
	host.shell._session_view.apply(copied.result.change)
	await nav.select_route("encounters.rogue"); await host.settle()
	await controller.open_record("rogue-encounter:1")
	if view._owner_id >= 0: return host._fail("Multiple callers were guessed.")
	view.get_node("%OwnerChoice").select(1); view._owner_selected(1)
	var selected := view._owner_id
	view.change_array("modifiers", 0, int(view.baseline.modifiers[0]) + 1)
	await view.commit_selected(); await host.settle()
	if view._owner_id != selected: return host._fail("Apply reference refresh cleared explicit caller selection.")
	host.checks.append("Complex can author and open Rogue zero; multiple callers require explicit selection retained through Apply")
	return true


func _signed_string(view: ProvidenceRogueEncounterEditor, controller: ProvidenceEncounterAuthoringController) -> bool:
	var field: ProvidenceEncounterReferenceField = view.get_node("%ActionRows").get_child(1).get_node("Reference0")
	view.change_array("successText", 1, -7); view.updating = true; view._present_form(); view.updating = false
	view._choose_reference(field); await host.settle(); view._new_string()
	view.get_node("%StringText").text = "Retained signed feedback"
	var prepared: Dictionary = host.shell._bridge.request("encounter.prepare-string", {})
	var id := int(prepared.result.nativeId)
	var created: Dictionary = host.shell._bridge.request("message.create", {"expectedRevision": int(prepared.result.revision), "nativeId": id, "text": "Retained signed feedback"})
	if not created.get("ok", false): return host._fail(str(created.get("error")))
	controller._uncertain_intent = {"kind": "message", "identity": "message:%d" % id, "text": "Retained signed feedback"}
	host.shell._bridge._requires_reopen = true; host.shell._operations.requires_reopen = true
	view.show_failure({"ok": false, "outcomeUnknown": true, "error": "String creation acknowledgement was lost."})
	await controller.reconcile(); await host.settle()
	if field.value != -id or view.uncertain or view.get_node("StringDialog").visible or view.get_node("FailureDialog").visible: return host._fail("String reconciliation lost signed Create and Use or left conflicting modals.")
	await view.discard_draft(); await host.settle()
	host.checks.append("Stock sound audition decodes and plays; signed New String reconciles a real durable creation without replay")
	return true


func timed(view: ProvidenceTimedEncounterEditor, controller: ProvidenceEncounterAuthoringController) -> bool:
	await controller.open_record("timed-encounter:0")
	var before := view.draft.duplicate(true)
	await view._pick_cell(); await host.settle()
	view.get_node("%CellX").value = 17
	view._close_modal(view.get_node("CellDialog"))
	if view.draft != before: return host._fail("Cancelled map cell selection changed the draft.")
	await view._pick_cell(); await host.settle()
	view.get_node("%CellCanvas").select_cell(0, 12)
	view.get_node("%AcceptCell").pressed.emit()
	if int(view.draft.requiredX) != 0 or int(view.draft.requiredY) != 12: return host._fail("Map cell picker did not select exact independent axes.")
	await view._location_changed(2); await host.settle()
	var maps: Dictionary = host.shell._bridge.request("map.catalog", {"offset": 0, "limit": 128, "levelType": "dungeon"})
	for map: Dictionary in maps.result.items:
		if int(map.nativeIndex) == 0 and str(view.targets.get("requiredLevel", {}).get("identity", "")) != str(map.identity): return host._fail("Land-to-Dungeon switch reused the prior map identity.")
	await view.discard_draft(); await host.settle()
	await controller.open_record("timed-encounter:1")
	host.checks.append("Map cell Cancel and Use; exact zero axis; location switch resolves the new Land/Dungeon identity")
	return await _stale_timed(view, controller)


func _stale_timed(view: ProvidenceTimedEncounterEditor, controller: ProvidenceEncounterAuthoringController) -> bool:
	view.change("percent", 35)
	var other := view.draft.duplicate(true); other.percent = 55
	var current: Dictionary = host.shell._bridge.request("encounter.apply-timed-draft", {"expectedRevision": host.shell._session_view.revision, "draft": other})
	if not current.get("ok", false): return host._fail(str(current.get("error")))
	await controller.commit(view.draft.duplicate(true)); await host.settle()
	if not view.conflicting or view.uncertain or int(view.draft.percent) != 35: return host._fail("Confirmed stale rejection lost the Timed draft or claimed an unknown outcome.")
	await controller.reconcile(); await host.settle()
	if not view.comparison_pending or int(view.baseline.percent) != 55 or int(view.draft.percent) != 35: return host._fail("Stale recovery did not compare current and retained Timed values.")
	view.finish_comparison(true)
	if not view.get_node("%ApplyEncounter").disabled: return host._fail("Apply remained available while comparison references were still refreshing.")
	await host.settle()
	await view.commit_selected(); await host.settle()
	if view.has_unapplied_changes() or int(view.baseline.percent) != 35: return host._fail("Explicit reviewed retry did not apply the retained Timed draft.")
	host.checks.append("Confirmed stale rejection retains Timed draft; current comparison precedes an explicit reviewed Apply")
	return true
