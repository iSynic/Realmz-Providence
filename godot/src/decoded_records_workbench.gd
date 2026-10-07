extends VBoxContainer

signal route_requested(identity: String)
signal evidence_requested(native_path: String)
signal finding_requested(finding: Dictionary)
signal find_uses_requested
signal status_changed(message: String)

const Read = preload("res://src/diagnostic_read.gd")
const SourceNavigation = preload("res://src/source_navigation.gd")
const Destination = preload("res://src/diagnostic_destination.gd")
const DETAIL_KEYS := {"incoming":"incomingReferences", "outgoing":"outgoingReferences", "problems":"problems"}
const TOTAL_KEYS := {"incoming":"incomingTotal", "outgoing":"outgoingTotal", "problems":"problemTotal"}

var reader := Read.new()
var _navigation
var _page: Dictionary = {}
var _record: Dictionary = {}
var _detail: Dictionary = {}
var _offset := 0
var _limit := 6
var _generation := 0
var _detail_generation := 0
var _tab := "incoming"
var _cursors := {"incoming":0, "outgoing":0, "problems":0}
var _preferred := ""
var _preferred_type := ""
var _binding := false
var _busy := false
var _status := "no-project"
var _revision := -1

func _ready() -> void:
	apply_theme()
	visibility_changed.connect(_visibility_changed)
	for pair in [[%IssuesRoute,"linter.issues"],[%RecordsRoute,"records.decoded-records"],[%EvidenceRoute,"records.evidence"]]:
		pair[0].pressed.connect(route_requested.emit.bind(pair[1]))
	%RecordsRoute.disabled = true
	%Refresh.pressed.connect(refresh_workbench)
	%CatalogSearch.text_submitted.connect(func(_text): _offset = 0; refresh_workbench())
	for control in [%SourceFilter,%TypeFilter]: control.item_selected.connect(func(_index): if not _binding: _offset = 0; refresh_workbench())
	%ClearFilters.pressed.connect(clear_filters)
	%Previous.pressed.connect(_step_page.bind(-1)); %Next.pressed.connect(_step_page.bind(1))
	%GoPage.pressed.connect(func(): _offset = (int(%PageNumber.value)-1)*_limit; refresh_workbench())
	%OpenOwner.pressed.connect(_open_owner)
	%OpenEvidence.pressed.connect(func(): evidence_requested.emit(str(_record.get("nativePath",""))))
	%FindUses.pressed.connect(find_uses_requested.emit)
	for name in ["Incoming","Outgoing","Problems"]:
		get_node("%"+name).toggle_mode=true
		get_node("%"+name).pressed.connect(_choose_detail.bind(name.to_lower()))
	%LinksPrevious.pressed.connect(_step_links.bind(-1)); %LinksNext.pressed.connect(_step_links.bind(1))
	resized.connect(_resize_capacity)
	_empty("Open a scenario to inspect its fixed records.")

func route_identity() -> String: return "records.decoded-records"
func workbench_title() -> String: return "Decoded Records"
func apply_label() -> String: return "Read-only"
func configure_operations(operations: ProvidenceEditorOperation, read_bridge: Callable) -> void: reader.configure(operations,read_bridge)
func configure_navigation(navigation) -> void: _navigation = navigation
func apply_theme(mode := "dark", density := "balanced") -> void:
	var controls := preload("res://src/story_text_theme.gd").new(); controls.mode=mode; controls.density=density; theme=controls
func set_appearance(mode: String, density: String) -> void: apply_theme(mode,density)

func refresh_workbench(borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	_generation += 1; _detail_generation += 1
	var generation := _generation
	var identity := str(_record.get("identity",_preferred))
	var record_type := str(_record.get("recordType",_preferred_type))
	var params := {"query":%CatalogSearch.text, "nativePath":_filter(%SourceFilter), "recordType":_filter(%TypeFilter), "offset":_offset, "limit":_limit}
	_busy=true; _status="loading"; _empty("Reading decoded records…")
	while reader.operations != null and reader.operations.busy and borrowed == null:
		await reader.operations.completed
		if generation != _generation: return {"ok":false,"stale":true}
	var response := await reader.request("record.list",params,borrowed)
	if generation != _generation or not is_inside_tree(): return {"ok":false,"stale":true}
	_busy=false
	if not response.get("ok",false):
		if not response.get("stale",false): _status="failure"; _empty(str(response.get("error","Record read failed."))+" Refresh retries this read.")
		return response
	_page=response.result.duplicate(true)
	if int(_page.revision)!=_revision: _cursors={"incoming":0,"outgoing":0,"problems":0}
	_revision=int(_page.revision); _status="ready"
	var last_offset:=maxi(0,int(_page.total)-1)/_limit*_limit
	if _offset>last_offset: _offset=last_offset; return await refresh_workbench(borrowed)
	_binding=true
	_facets(%SourceFilter,_page.get("facets",{}).get("nativePaths",[]),str(params.nativePath),"All sources")
	_facets(%TypeFilter,_page.get("facets",{}).get("recordTypes",[]),str(params.recordType),"All record types")
	_binding=false
	_render_rows(identity,record_type); _render_pager()
	if not _record.is_empty():
		var detail:=await _load_detail(borrowed)
		if not detail.get("ok",false): return detail
	present_selection()
	return response

func present_selection() -> void:
	if not is_visible_in_tree(): return
	var summary:String="%d matching · read-only" % int(_page.get("total",0)) if _status=="ready" else %CatalogCount.text
	if _status=="detail-failure": summary=%SelectionSummary.text
	status_changed.emit("Decoded Records · "+summary)

func _filter(control: OptionButton) -> String:
	return str(control.get_item_metadata(control.selected)) if control.selected >= 0 else "all"
func _facets(control: OptionButton, values: Array, chosen: String, all_label: String) -> void:
	control.clear(); control.add_item(all_label); control.set_item_metadata(0,"all")
	for row in values:
		control.add_item("%s · %d" % [str(row.value),int(row.count)]); control.set_item_metadata(control.item_count-1,str(row.value))
	for index in control.item_count:
		if control.get_item_metadata(index)==chosen: control.select(index); return
	control.select(0)
func _clear_rows(container: Node) -> void:
	for child in container.get_children(): container.remove_child(child); child.queue_free()

func _render_rows(identity: String, record_type: String = "") -> void:
	_clear_rows(%Rows); _record.clear()
	var rows: Array = _page.get("items",[])
	for row in rows:
		if str(row.identity)==identity and (record_type.is_empty() or row.recordType==record_type): _record=row.duplicate(true)
	if _record.is_empty() and not rows.is_empty(): _record=rows[0].duplicate(true)
	for index in rows.size():
		var row: Dictionary=rows[index]
		var button := Button.new(); button.name="Record%d" % index; button.toggle_mode=true; button.theme_type_variation=&"ItemRow"
		button.text="%s\n%s · record %d · %d–%d · %d bytes\n%s" % [row.label,row.nativePath,int(row.recordIndex),int(row.byteStart),int(row.byteEnd),int(row.byteLength),row.summary]
		button.alignment=HORIZONTAL_ALIGNMENT_LEFT; button.text_overrun_behavior=TextServer.OVERRUN_TRIM_ELLIPSIS
		button.custom_minimum_size.y=70; button.set_pressed_no_signal(row.identity==_record.get("identity","") and row.recordType==_record.get("recordType","")); button.tooltip_text=button.text
		button.pressed.connect(_select_record.bind(row)); %Rows.add_child(button)
	%CatalogCount.text="%d matching · %d canonical fixed records · %d per page" % [int(_page.total),int(_page.get("unfilteredTotal",_page.total)),_limit]
	if rows.is_empty(): _empty_detail(); _add_message(%Rows,"No records match these filters.")

func _select_record(row: Dictionary) -> void:
	if row.get("identity")==_record.get("identity") and row.get("recordType")==_record.get("recordType"): return
	_record=row.duplicate(true); _cursors={"incoming":0,"outgoing":0,"problems":0}
	for index in %Rows.get_child_count(): %Rows.get_child(index).set_pressed_no_signal(_page.items[index].identity==row.identity and _page.items[index].recordType==row.recordType)
	_load_detail()
func _choose_detail(tab: String) -> void:
	_tab=tab; _load_detail()
func _step_links(direction: int) -> void:
	_cursors[_tab]=maxi(0,int(_cursors[_tab])+direction*3); _load_detail()

func _load_detail(borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if _record.is_empty(): return {"ok":false,"error":"No selected record."}
	_detail_generation+=1
	var generation:=_detail_generation; var identity:=str(_record.identity); var tab:=_tab
	_empty_detail(); %SelectionName.text="Reading record details…"
	while reader.operations.busy and borrowed==null:
		await reader.operations.completed
		if generation!=_detail_generation: return {"ok":false,"stale":true}
	var response:=await reader.request("record.open",{"identity":identity,"recordType":_record.recordType,"offset":int(_cursors[tab]),"limit":3},borrowed)
	if generation!=_detail_generation or identity!=_record.get("identity") or tab!=_tab or not is_inside_tree(): return {"ok":false,"stale":true}
	if not response.get("ok",false):
		_empty_detail(); %SelectionSummary.text=str(response.get("error","Record details could not be read.")); _status="detail-failure"; present_selection(); return response
	if int(response.result.revision)!=_revision:
		_cursors={"incoming":0,"outgoing":0,"problems":0}; return await refresh_workbench(borrowed)
	var total:=int(response.result.paging.get(TOTAL_KEYS[tab],0))
	var last_offset:=maxi(0,total-1)/3*3
	if int(_cursors[tab])>last_offset:
		_cursors[tab]=last_offset; return await _load_detail(borrowed)
	_detail={"paging":response.result.paging, "rows":response.result.get(DETAIL_KEYS[tab],[])}
	_record=response.result.record.duplicate(true); _render_detail(); _render_links()
	if _record.get("diagnosticOwnershipAmbiguous",false) and tab!="incoming": _tab="incoming"; return await _load_detail(borrowed)
	_status="ready"; present_selection(); return response

func _render_detail() -> void:
	for button in [%Incoming,%Outgoing,%Problems]:
		button.disabled=false; button.set_pressed_no_signal(str(button.name).to_lower()==_tab)
	%SelectionName.text=str(_record.label)
	%SelectionGeometry.text="%s · %s\nRecord %d · bytes %d–%d · %d-byte record" % [_record.recordType,_record.nativePath,int(_record.recordIndex),int(_record.byteStart),int(_record.byteEnd),int(_record.byteLength)]
	%SelectionSummary.text=str(_record.summary)
	var destination:=Destination.describe({"source":_record.identity})
	%OpenOwner.disabled=destination.is_empty() or not _record.get("owningEditorAvailable",true); %OpenEvidence.disabled=not bool(_record.get("sourceRetained",false))
	%OpenReason.text=str(_record.owningEditorReason) if not _record.get("owningEditorAvailable",true) else "No direct owning-record editor. Inspect its callers or retained source." if destination.is_empty() else "Typed links are derived from saved revision %d." % _revision
	%FindUses.disabled=str(_record.recordType) in ["extra-code","monster-description"]
	for pair in [[%Incoming,"incomingReferences"],[%Outgoing,"outgoingReferences"],[%Problems,"problems"]]: pair[0].text="%s %d" % [pair[0].name,int(_record.get(pair[1],0))]
	if _record.get("diagnosticOwnershipAmbiguous",false):
		for button in [%Outgoing,%Problems]: button.disabled=true; button.text=str(button.name)+" unavailable"
		%OpenReason.text+="\nIncoming links remain scoped. Outgoing and finding ownership cannot be distinguished across these colliding definitions."

func _render_links() -> void:
	_clear_rows(%References)
	for row: Dictionary in _detail.get("rows",[]):
		var panel:=VBoxContainer.new(); panel.add_theme_constant_override("separation",4); %References.add_child(panel)
		_add_message(panel, "%s · %s" % [str(row.get("entity",row.get("source","Scenario"))),str(row.get("field",""))])
		_add_message(panel,str(row.get("message","%s → %s · %s" % [row.get("targetKind",""),row.get("targetId",""),row.get("resolution","")])) )
		var actions:=HBoxContainer.new(); panel.add_child(actions)
		if _tab=="incoming": _link_button(actions,"Open source",_open_source.bind(row),Destination.describe(row).is_empty())
		elif _tab=="problems": _link_button(actions,"Open in Issues",finding_requested.emit.bind(row),false)
		else:
			var reason:=_target_reason(row)
			_link_button(actions,"Open target",_open_target.bind(row),not reason.is_empty()).tooltip_text=reason
			_link_button(actions,"Open source",_open_source.bind(row),Destination.describe(row).is_empty())
	var total:=int(_detail.get("paging",{}).get(TOTAL_KEYS[_tab],0)); var offset:=int(_cursors[_tab]); var count:=(_detail.get("rows",[]) as Array).size()
	%LinkCount.text="%d–%d of %d %s" % [offset+1 if count else 0,offset+count,total,_tab]
	%LinksPrevious.disabled=offset==0; %LinksNext.disabled=offset+count>=total
	if count==0: _add_message(%References,"No %s on this page." % _tab)

func _link_button(parent: Node, text: String, action: Callable, disabled: bool) -> Button:
	var button:=Button.new(); button.text=text; button.disabled=disabled; button.pressed.connect(action); parent.add_child(button); return button
func _add_message(parent: Node, text: String) -> void:
	var label:=Label.new(); label.text=text; label.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART; parent.add_child(label)
func _target_reason(row: Dictionary) -> String:
	if not str(row.get("availabilityReason", "")).is_empty(): return str(row.availabilityReason)
	if row.get("targetIdentity")==null: return "No exact target is available in this caller context. Open its source or use Trace."
	if row.get("resolution") in ["missing","ambiguous"]: return "The target is %s. Open its source to choose a replacement." % row.resolution
	if row.get("targetKind") not in ["message","option-label","extra-action-point","action-point","simple-encounter","complex-encounter","rogue-encounter","timed-encounter","battle","monster","item","spell","race","caste","shop","treasure","player-map","picture","sound","icon","quest-flag","map"]: return "No direct target editor; open its source or use Trace."
	return ""
func _open_target(row: Dictionary) -> void:
	if _navigation==null or not _target_reason(row).is_empty(): return
	var kind:=str(row.targetKind); var identity:=str(row.get("targetIdentity",row.targetId))
	if kind=="action-point": kind="same-map-action-point"
	if kind=="quest-flag": kind="quest"
	if kind=="icon": kind="monster-appearance"
	if kind=="map":
		await _navigation.open_map(identity)
		return
	await _navigation.open_script_target(kind,SourceNavigation.last_integer(identity),identity,{"targetStatus":"application-resource" if row.get("resolution")=="stock-fallback" else "resolved", "levelType":"dungeon" if identity.begins_with("dungeon:") else "land"})
func _open_source(row: Dictionary) -> void:
	if _navigation!=null: await _navigation.open_script_source(row)
func _open_owner() -> void:
	if _navigation!=null and not _record.is_empty() and _record.get("owningEditorAvailable",true): await _navigation.open_script_source({"source":_record.identity,"field":""})

func _render_pager() -> void:
	var total:=int(_page.get("total",0)); var rows: Array=_page.get("items",[]); var pages:=maxi(1,ceili(float(total)/_limit))
	%PageCount.text="%d–%d of %d · Page %d of %d" % [_offset+1 if not rows.is_empty() else 0,_offset+rows.size(),total,_offset/_limit+1,pages]
	%Previous.disabled=_offset==0; %Next.disabled=_offset+rows.size()>=total
	%PageNumber.max_value=pages; %PageNumber.value=_offset/_limit+1; %GoPage.disabled=total==0
func _step_page(direction: int) -> void:
	_offset=maxi(0,_offset+direction*_limit); refresh_workbench()
func clear_filters() -> void:
	_binding=true; %CatalogSearch.text=""; %SourceFilter.select(0); %TypeFilter.select(0); _binding=false; _offset=0; refresh_workbench()
func filter_source(path: String) -> void:
	_preferred=""; _preferred_type=""; _offset=0; %CatalogSearch.text=""; %TypeFilter.select(0)
	if %SourceFilter.item_count==0: await refresh_workbench()
	for index in %SourceFilter.item_count:
		if %SourceFilter.get_item_metadata(index)==path: %SourceFilter.select(index); await refresh_workbench(); return
	_empty("No decoded fixed records exist for this source.")
func _empty(message: String) -> void:
	_page.clear(); _record.clear(); _detail.clear(); _clear_rows(%Rows); _add_message(%Rows,message); _empty_detail()
	%CatalogCount.text=message; %PageCount.text="No current page"
	for button in [%Previous,%Next,%GoPage]: button.disabled=true
	present_selection()
func _empty_detail() -> void:
	%SelectionName.text="No current selection."; %SelectionGeometry.text=""; %SelectionSummary.text=""; %OpenReason.text=""; _clear_rows(%References); %LinkCount.text="No current links"
	for button in [%OpenOwner,%OpenEvidence,%FindUses,%Incoming,%Outgoing,%Problems,%LinksPrevious,%LinksNext]: button.disabled=true
	for button in [%Incoming,%Outgoing,%Problems]: button.text=str(button.name)
func _resize_capacity() -> void:
	var limit:=5 if size.y<900 else 6
	if limit==_limit: return
	_limit=limit; _offset=(_offset/_limit)*_limit
	if _status != "no-project" and is_visible_in_tree() and is_instance_valid(reader.operations): refresh_workbench()
func teardown_session() -> void:
	reader.invalidate(); _generation+=1; _detail_generation+=1; _offset=0; _preferred=""; _preferred_type=""; _cursors={"incoming":0,"outgoing":0,"problems":0}; _status="no-project"
	if is_node_ready(): _empty("Open a scenario to inspect its fixed records.")
func discovery_selection() -> Dictionary:
	var kind:=str(_record.get("recordType",""))
	if kind in ["standard-item","scenario-item"]: kind="item"
	if kind in ["standard-spell","scenario-spell"]: kind="spell"
	return {"kind":kind,"identity":str(_record.get("identity","")),"nativeId":str(SourceNavigation.last_integer(str(_record.get("identity","")))),"scope":str(_record.get("discoveryScope","scenario"))}
func read_navigation_state() -> Dictionary:
	var focus:=get_viewport().gui_get_focus_owner()
	return {"query":%CatalogSearch.text,"source":_filter(%SourceFilter),"type":_filter(%TypeFilter),"offset":_offset,"identity":_record.get("identity",""),"recordType":_record.get("recordType",""),"tab":_tab,"cursors":_cursors.duplicate(),"scroll":%CatalogScroll.scroll_vertical,"focus":str(get_path_to(focus)) if focus!=null and is_ancestor_of(focus) else ""}
func restore_navigation_state(state: Dictionary) -> bool:
	_binding=true; %CatalogSearch.text=str(state.get("query","")); _preferred=str(state.get("identity","")); _record.clear(); _offset=int(state.get("offset",0)); _tab=str(state.get("tab","incoming")); _cursors=state.get("cursors",_cursors).duplicate()
	_preferred_type=str(state.get("recordType",""))
	for pair in [[%SourceFilter,"source"],[%TypeFilter,"type"]]:
		for index in pair[0].item_count:
			if pair[0].get_item_metadata(index)==state.get(pair[1],"all"): pair[0].select(index)
	_binding=false
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
	reader.invalidate(); _generation+=1; _detail_generation+=1

func filter_identity(identity: String) -> void:
	_binding=true; %CatalogSearch.text=identity
	%SourceFilter.select(0); %TypeFilter.select(0); _binding=false
	_offset=0; _preferred=identity; _preferred_type=""; _record.clear()
	await refresh_workbench()

func _visibility_changed() -> void:
	if not is_visible_in_tree():
		reader.invalidate(); _generation+=1; _detail_generation+=1
