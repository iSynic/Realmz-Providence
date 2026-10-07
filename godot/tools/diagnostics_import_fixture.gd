extends RefCounted

static func create(bridge, work: String) -> Dictionary:
	var source:=work.path_join("partial-source")
	if DirAccess.make_dir_recursive_absolute(source)!=OK: return {"ok":false}
	for entry in [["Data LD",32400],["Data DD",8000],["Data RD",1288],["Data SD2",257],["Data ED",426],["Data EDCD",11]]:
		var bytes:=PackedByteArray();bytes.resize(entry[1])
		if entry[0]=="Data SD2": bytes[0]=3;bytes[1]=65;bytes[2]=66;bytes[3]=67;bytes[256]=127
		if entry[0]=="Data EDCD": bytes[10]=127
		var file:=FileAccess.open(source.path_join(entry[0]),FileAccess.WRITE)
		if file==null: return {"ok":false}
		file.store_buffer(bytes);file.close()
	var response:Dictionary=bridge.create_project("preserved-fragments",work.path_join("partial-project"))
	if not response.get("ok",false): return response
	return bridge.request("project.import-classic-land-slice",{"expectedRevision":int(response.result.revision),"directory":source})
