extends RefCounted

var reader := preload("res://src/diagnostic_read.gd").new()
var native_path := ""
var selection: Dictionary = {}
var _view: Control
var _finding: Dictionary = {}
var _generation := 0
var _blocked_reason := ""

func initialize(view: Control, operations: ProvidenceEditorOperation, bridge: Callable) -> void:
	_view=view
	reader.configure(operations,bridge)
	present({})

func invalidate() -> void:
	_generation+=1
	_finding.clear()
	_blocked_reason=""
	reader.invalidate()
	if is_instance_valid(_view) and _view.get_node_or_null("%FindUses")!=null: present({})

func present(finding: Dictionary) -> void:
	if _view==null: return
	if _finding==finding and not finding.is_empty():
		if not _blocked_reason.is_empty(): _ambiguous_owner()
		return
	_finding=finding.duplicate(true); _generation+=1; native_path=""; selection.clear()
	_blocked_reason=""
	var generation:=_generation
	_view.get_node("%FindUses").disabled=true
	_view.get_node("%OpenRecords").disabled=true
	_view.get_node("%OpenEvidence").disabled=true
	_view.get_node("%FindingContext").text="" if finding.is_empty() else "%s\n%s" % [finding.get("code",""),finding.get("field","")]
	_view.get_node("%DiagnosticReason").text=""
	if finding.is_empty(): return
	var identity:=str(finding.get("entity",""))
	if identity.is_empty(): return
	_view.get_node("%DiagnosticReason").text="Reading diagnostic availability…"
	while reader.operations!=null and reader.operations.busy:
		await reader.operations.completed
		if generation!=_generation: return

	if identity.begins_with("classic-source:"):
		await _retained_source(identity.trim_prefix("classic-source:"),generation)
		return
	var response:=await reader.request("record.open",{"identity":identity,"limit":1})
	if generation!=_generation or not is_instance_valid(_view) or not _view.is_inside_tree(): return
	if not response.get("ok",false):
		if str(response.get("error","")).contains("multiple source owners"):
			_blocked_reason="Multiple definitions share this identity. Open Decoded Records to select the source explicitly; no exact repair owner is inferred."
			_ambiguous_owner()
			return
		_view.get_node("%DiagnosticReason").text="This owner has no readable fixed-record catalog. Use its authoring editor, or Check Again to retry context."
		_finding.clear(); return
	var row: Dictionary=response.result.record
	native_path=str(row.nativePath)
	var kind:=str(row.recordType)
	if kind in ["standard-item","scenario-item"]: kind="item"
	if kind in ["standard-spell","scenario-spell"]: kind="spell"
	selection={"kind":kind,"identity":identity,"nativeId":str(preload("res://src/source_navigation.gd").last_integer(identity)),"scope":str(row.get("discoveryScope","scenario"))}
	_view.get_node("%FindUses").disabled=kind in ["extra-code","monster-description"]
	_view.get_node("%OpenRecords").disabled=false
	_view.get_node("%OpenEvidence").disabled=not bool(row.get("sourceRetained",false))
	_view.get_node("%DiagnosticReason").text="Read-only context; repair the owning field above." if row.get("sourceRetained",false) else "No uniquely retained original source is available for this record."

func owner_is_ambiguous(finding: Dictionary) -> bool:
	return finding==_finding and not _blocked_reason.is_empty()

func _ambiguous_owner() -> void:
	_view.get_node("%OpenFinding").disabled=true
	_view.get_node("%OpenRecords").disabled=false
	_view.get_node("%DiagnosticReason").text=_blocked_reason

func _retained_source(path: String, generation: int) -> void:
	var response:=await reader.request("source-evidence.open",{"nativePath":path})
	if generation!=_generation or not is_instance_valid(_view) or not _view.is_inside_tree(): return
	if not response.get("ok",false):
		_view.get_node("%DiagnosticReason").text="Original source unavailable or ambiguous. Check Again retries this read."
		_finding.clear(); return
	native_path=path
	_view.get_node("%OpenEvidence").disabled=false
	_view.get_node("%OpenFinding").disabled=false
	_view.get_node("%OpenFinding").text="Open retained source"
	_view.get_node("%FindingDestination").text="Technical Details > "+path
	_view.get_node("%FindingGuidance").text="The fragment remains preserved. Inspect its original source and callers; no complete record or repair is inferred."
	_view.get_node("%DiagnosticReason").text="Original bytes remain unchanged. No fixed-record edit is offered."
