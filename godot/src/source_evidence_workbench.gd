extends VBoxContainer

signal route_requested(identity: String)
signal records_requested(native_path: String)
signal assets_requested
signal status_changed(message: String)

var reader := preload("res://src/diagnostic_read.gd").new()
var _page: Dictionary = {}
var _source: Dictionary = {}
var _compiler: Dictionary = {}
var _offset := 0
var _generation := 0
var _selection_generation := 0
var _preferred := ""
var _revision := -1
var _status := "no-project"
var _binding := false

func _ready() -> void:
	apply_theme()
	visibility_changed.connect(_visibility_changed)
	for pair in [[%IssuesRoute,"linter.issues"],[%RecordsRoute,"records.decoded-records"],[%EvidenceRoute,"records.evidence"]]: pair[0].pressed.connect(route_requested.emit.bind(pair[1]))
	%EvidenceRoute.disabled=true
	for pair in [["All kinds","all"],["Record files","record-file"],["Resource containers","resource-container"],["Other preserved files","compatibility-only"]]:
		%SourceFilter.add_item(pair[0]); %SourceFilter.set_item_metadata(%SourceFilter.item_count-1,pair[1])
	%SourceFilter.item_selected.connect(func(_index): if not _binding: _offset=0; refresh_workbench())
	%CatalogSearch.text_submitted.connect(func(_text): _offset=0; refresh_workbench())
	%Refresh.pressed.connect(refresh_workbench); %ClearFilters.pressed.connect(clear_filters)
	%Previous.pressed.connect(_step_page.bind(-1)); %Next.pressed.connect(_step_page.bind(1))
	%GoPage.pressed.connect(func(): _offset=(int(%PageNumber.value)-1)*6; refresh_workbench())
	%OpenRecords.pressed.connect(func(): records_requested.emit(str(_source.get("source",{}).get("nativePath",""))))
	%OpenAssets.pressed.connect(assets_requested.emit)
	_empty("Open a scenario to inspect retained sources.")

func route_identity() -> String: return "records.evidence"
func workbench_title() -> String: return "Technical Details"
func apply_label() -> String: return "Read-only"
func configure_operations(operations: ProvidenceEditorOperation, read_bridge: Callable) -> void: reader.configure(operations,read_bridge)
func apply_theme(mode := "dark", density := "balanced") -> void:
	var controls:=preload("res://src/story_text_theme.gd").new(); controls.mode=mode; controls.density=density; theme=controls
func set_appearance(mode: String, density: String) -> void: apply_theme(mode,density)

func refresh_workbench(borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	_generation+=1; _selection_generation+=1
	var generation:=_generation; var path:=str(_source.get("source",{}).get("nativePath",_preferred))
	var params:={"query":%CatalogSearch.text,"kind":%SourceFilter.get_item_metadata(%SourceFilter.selected),"offset":_offset,"limit":6}
	_status="loading"; _empty("Reading retained Classic sources…")
	while reader.operations!=null and reader.operations.busy and borrowed==null:
		await reader.operations.completed
		if generation!=_generation: return {"ok":false,"stale":true}
	var response:=await reader.request("source-evidence.list",params,borrowed)
	if generation!=_generation or not is_inside_tree(): return {"ok":false,"stale":true}
	if not response.get("ok",false):
		if not response.get("stale",false): _status="failure"; _empty(str(response.get("error","Source read failed."))+" Refresh retries this read.")
		return response
	_page=response.result.duplicate(true); _revision=int(_page.revision); _status="ready"
	var last_offset:=maxi(0,int(_page.total)-1)/6*6
	if _offset>last_offset: _offset=last_offset; return await refresh_workbench(borrowed)
	_render_rows(path); _render_pager()
	if not _preferred.is_empty():
		var detail:=await _load_source(_preferred,borrowed)
		if not detail.get("ok",false): return detail
	present_selection()
	return response

func present_selection() -> void:
	if not is_visible_in_tree(): return
	var summary:String="%d retained sources · read-only" % int(_page.get("total",0)) if _status=="ready" else %CatalogCount.text
	if _status=="detail-failure": summary=%SelectionSummary.text
	status_changed.emit("Technical Details · "+summary)

func _clear(container: Node) -> void:
	for child in container.get_children(): container.remove_child(child); child.queue_free()
func _message(text: String) -> void:
	var label:=Label.new(); label.text=text; label.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART; %Rows.add_child(label)
func _render_rows(path: String) -> void:
	_clear(%Rows); _preferred=""
	var rows: Array=_page.get("items",[])
	for row in rows:
		if row.nativePath==path: _preferred=path
	if _preferred.is_empty() and not rows.is_empty(): _preferred=str(rows[0].nativePath)
	for index in rows.size():
		var row: Dictionary=rows[index]; var button:=Button.new()
		button.name="Source%d" % index; button.theme_type_variation=&"ItemRow"; button.toggle_mode=true
		button.text="%s\n%s · %d bytes" % [row.nativePath,str(row.kind).replace("-"," "),int(row.byteLength)]
		button.alignment=HORIZONTAL_ALIGNMENT_LEFT; button.text_overrun_behavior=TextServer.OVERRUN_TRIM_ELLIPSIS; button.custom_minimum_size.y=54
		button.set_pressed_no_signal(row.nativePath==_preferred); button.tooltip_text=button.text
		button.pressed.connect(_select_source.bind(str(row.nativePath))); %Rows.add_child(button)
	%CatalogCount.text="%d matching retained sources · original payloads remain read-only" % int(_page.total)
	if rows.is_empty():
		var text:="No sources match these filters."
		if str(_page.get("origin",{}).get("kind",""))=="authored": text="Fresh authored project · no imported compatibility annex."
		_message(text); _empty_detail(); %SelectionSummary.text=text

func _select_source(path: String) -> void:
	if path==_source.get("source",{}).get("nativePath"): return
	_preferred=path
	for index in %Rows.get_child_count(): %Rows.get_child(index).set_pressed_no_signal(_page.items[index].nativePath==path)
	_load_source(path)
func _load_source(path: String, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	_selection_generation+=1
	var generation:=_selection_generation
	_empty_detail(); %SelectionName.text="Reading "+path+"…"
	while reader.operations.busy and borrowed==null:
		await reader.operations.completed
		if generation!=_selection_generation: return {"ok":false,"stale":true}
	var response:=await reader.request("source-evidence.open",{"nativePath":path},borrowed)
	if generation!=_selection_generation or not is_inside_tree(): return {"ok":false,"stale":true}
	if not response.get("ok",false):
		_empty_detail(); %SelectionSummary.text=str(response.get("error","Source details could not be read.")); _status="detail-failure"; present_selection(); return response
	if int(response.result.revision)!=_revision: refresh_workbench(); return {"ok":false,"stale":true}
	_source=response.result.duplicate(true); _compiler.clear(); _render_source()
	var compiler:=await reader.request("compiler.describe",{},borrowed)
	if generation!=_selection_generation: return {"ok":false,"stale":true}
	if compiler.get("ok",false): _compiler=compiler.result.duplicate(true)
	_render_identity(str(compiler.get("error","Tool identity is unavailable.")))
	_status="ready"; present_selection()
	return response

func _render_source() -> void:
	var source: Dictionary=_source.source; var codecs: Array=_source.get("codecDescriptors",[]); var resources: Array=_source.get("resourceCodecDescriptors",[])
	%SelectionName.text=str(source.nativePath)
	%SelectionGeometry.text="%s · %d captured bytes" % [str(_source.kind).replace("-"," "),int(source.byteLength)]
	%SelectionSummary.text="The captured original remains preserved. Supported edits belong in the owning authoring tool; no raw byte editor is provided here."
	var lines: Array[String]=[]
	for codec: Dictionary in codecs:
		lines.append("%s · %d bytes per record · %d complete records\nPreserved remainder: %d bytes\nOwned ranges: %s\nCompatibility policy: %s" % [str(codec.family).capitalize(),int(codec.recordBytes),int(codec.recordCount),int(codec.trailingBytes),str(codec.ownedByteRanges),str(codec.compatibilityOverlay)])
	for resource: Dictionary in resources:
		lines.append("%s · %s IDs %d–%d · payload %s" % [resource.family,resource.resourceType,int(resource.minimumResourceId),int(resource.maximumResourceId),"owned" if resource.payloadFullyOwned else "preserved outside supported fields"])
	if lines.is_empty(): lines.append("No registered diagnostic descriptor. Original source preserved; no record geometry or byte ownership is inferred.")
	%CodecDetails.text="\n\n".join(lines)
	%OpenRecords.disabled=int(_source.get("decodedRecordCount",0)) == 0
	%OpenAssets.disabled=resources.is_empty() and str(_source.kind)!="resource-container"
	%OpenReason.text="" if not %OpenRecords.disabled else "Resource content available in Assets." if not %OpenAssets.disabled else "No direct authoring decoder. Original bytes remain preserved."

func _render_identity(error: String) -> void:
	var source: Dictionary=_source.get("source",{})
	var lines: Array[String]=["%s · %d captured bytes" % [source.get("nativePath",""),int(source.get("byteLength",0))],"SHA-256 "+str(source.get("blob",""))]
	var identity: Dictionary=_compiler
	if identity.is_empty(): lines.append(error)
	else:
		for key in ["commit","sourceTree","schemaSha256","cargoLockSha256","rustcVersion","cargoVersion","target","profile","sourceDirty"]:
			if identity.has(key): lines.append(key+" · "+str(identity[key]))
	%SourceIdentity.text="\n".join(lines)

func _render_pager() -> void:
	var rows: Array=_page.get("items",[]); var total:=int(_page.get("total",0)); var pages:=maxi(1,ceili(float(total)/6))
	%PageCount.text="%d–%d of %d\nPage %d of %d" % [_offset+1 if not rows.is_empty() else 0,_offset+rows.size(),total,_offset/6+1,pages]
	%Previous.disabled=_offset==0; %Next.disabled=_offset+rows.size()>=total; %PageNumber.max_value=pages; %PageNumber.value=_offset/6+1; %GoPage.disabled=total==0
func _step_page(direction: int) -> void:
	_offset=maxi(0,_offset+direction*6); refresh_workbench()
func clear_filters() -> void:
	_binding=true; %SourceFilter.select(0); %CatalogSearch.text=""; _binding=false; _offset=0; refresh_workbench()
func open_source(path: String) -> Dictionary:
	_binding=true; %CatalogSearch.text=path; %SourceFilter.select(0); _binding=false; _offset=0; _preferred=path
	var response:=await refresh_workbench()
	if not response.get("ok",false): return response
	return response if _source.get("source",{}).get("nativePath","")==path else await _load_source(path)
func _empty(message: String) -> void:
	_page.clear(); _source.clear(); _compiler.clear(); _clear(%Rows); _message(message); %CatalogCount.text=message; %PageCount.text="No current page"; _empty_detail()
	for button in [%Previous,%Next,%GoPage]: button.disabled=true
	present_selection()
func _empty_detail() -> void:
	_source.clear(); _compiler.clear(); %SelectionName.text="No current selection."
	for label in [%SelectionGeometry,%SelectionSummary,%CodecDetails,%SourceIdentity,%OpenReason]: label.text=""
	%OpenRecords.disabled=true; %OpenAssets.disabled=true
func teardown_session() -> void:
	reader.invalidate(); _generation+=1; _selection_generation+=1; _offset=0; _preferred=""; _status="no-project"
	if is_node_ready(): _empty("Open a scenario to inspect retained sources.")
func read_navigation_state() -> Dictionary:
	var focus:=get_viewport().gui_get_focus_owner()
	return {"query":%CatalogSearch.text,"kind":%SourceFilter.selected,"offset":_offset,"path":_source.get("source",{}).get("nativePath",""),"scroll":%CatalogScroll.scroll_vertical,"focus":str(get_path_to(focus)) if focus!=null and is_ancestor_of(focus) else ""}
func restore_navigation_state(state: Dictionary) -> bool:
	_binding=true; %CatalogSearch.text=str(state.get("query","")); %SourceFilter.select(int(state.get("kind",0))); _binding=false
	_offset=int(state.get("offset",0)); _preferred=str(state.get("path","")); _source.clear()
	var response:=await refresh_workbench()
	if not response.get("ok",false) or not is_visible_in_tree(): return false
	var generation:=_generation
	await get_tree().process_frame
	if generation!=_generation or not is_visible_in_tree(): return false
	%CatalogScroll.scroll_vertical=int(state.get("scroll",0))
	var focus:=get_node_or_null(str(state.get("focus",""))) as Control
	if focus!=null: focus.grab_focus()
	return bool(response.get("ok",false))

func _exit_tree() -> void:
	reader.invalidate(); _generation+=1; _selection_generation+=1

func _visibility_changed() -> void:
	if not is_visible_in_tree():
		reader.invalidate(); _generation+=1; _selection_generation+=1
