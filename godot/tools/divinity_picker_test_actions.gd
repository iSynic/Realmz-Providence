extends RefCounted


static func preview(workbench: ProvidenceActionStepWorkbench, identity: String) -> int:
	(workbench.get_node("%ChooseAction") as Button).pressed.emit()
	var picker := workbench.get_node("%StepActionPicker") as ProvidenceDivinityCodeHelper
	var list := picker.get_node("%CodeEntries") as ProvidenceDivinityActionList
	for index in range(list.item_count):
		if str((list.get_item_metadata(index) as Dictionary).get("identity", "")) != identity: continue
		list.select(index)
		list.item_selected.emit(index)
		return index
	return -1


static func choose(workbench: ProvidenceActionStepWorkbench, identity: String) -> bool:
	if preview(workbench, identity) < 0: return false
	var picker := workbench.get_node("%StepActionPicker") as ProvidenceDivinityCodeHelper
	if (picker.get_node("%UseAction") as Button).disabled: return false
	(picker.get_node("%UseAction") as Button).pressed.emit()
	return not picker.visible


static func choose_fresh(workbench: ProvidenceActionStepWorkbench, identity: String) -> bool:
	# These authoring checks intentionally start from defaults, including repeat runs.
	if workbench._selected_action_identity() == identity:
		(workbench.get_node("%SemanticClear") as Button).pressed.emit()
	return choose(workbench, identity)
