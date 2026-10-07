extends RefCounted

var shell: Control
var _settle: Callable
var regions: Array=[]
var layout: Dictionary={}


func initialize(host: Control, settle: Callable) -> void:
	shell=host; _settle=settle


func seed() -> void:
	await _settle.call()
	var source: Dictionary = shell._bridge.request("map.open",{"identity":"land:0"}).result
	for row: Dictionary in source.map.runtime.randomRectangles:
		await mutate("random-region.clear",{"mapIdentity":"land:0","slot":int(str(row.identity).get_slice(":rect:",1))})
	for tuple in [[0,55,45,74,62],[3,48,12,72,32],[19,0,0,90,90]]:
		var row := {"identity":"land:0:rect:%d" % tuple[0],"left":tuple[1],"top":tuple[2],"right":tuple[3],"bottom":tuple[4],"battleRange":[0,0],"chanceTenThousand":100,"randomDoors":[0,0,0],"randomDoorPercent":[0,0,0],"only":false,"option":0,"soundId":0,"textId":0}
		regions.append(row); await mutate("random-region.apply",{"mapIdentity":"land:0","region":row})
	var maps: Dictionary = shell._bridge.request("player-map.list",{}).result
	for item: Dictionary in maps.records:
		var record: Dictionary = shell._bridge.request("player-map.open",{"identity":item.identity}).result.playerMap
		record.level=1
		if int(record.nativeId) in [0,1]:
			record.level=0; record.pictureId=0; record.show=1; record.isDungeon=false
			record.startX=54 if int(record.nativeId)==0 else 48
			record.startY=24 if int(record.nativeId)==0 else 46
			record.iconSize=16 if int(record.nativeId)==0 else 32
		await mutate("player-map.update",{"playerMap":_integers(record)})
		if int(record.nativeId) in [0,1]: await mutate("player-map.names.update",{"nativeId":record.nativeId,"availableName":"Town" if int(record.nativeId)==0 else "Surroundings","unavailableName":"Uncharted"})
	await shell._navigation.select_route("maps.layout"); await _settle.call()
	await shell._workbenches.layout_commands.remove()
	var coordinates := [Vector2i(3,2),Vector2i(3,1),Vector2i(4,2),Vector2i(3,3),Vector2i(2,2),Vector2i(2,1),Vector2i(4,1),Vector2i(2,3),Vector2i(4,3)]
	for index in coordinates.size():
		await shell._workbenches.layout_commands.set_cell(coordinates[index].y,coordinates[index].x,"land:%d" % index)
		assert((await shell._workbenches.layout_commands.apply_review()).ok)
	await _settle.call()
	layout=shell._bridge.request("land-layout.open",{}).result.duplicate(true)


func mutate(method: String, parameters: Dictionary) -> void:
	var params: Dictionary = _integers(parameters); params.expectedRevision=shell._session_view.revision
	var response: Dictionary = await shell._operations.run_workflow(shell._bridge,"Prepare disposable view fixture",func(operation): return await operation.request(method,params))
	if not response.get("ok",false):
		push_error(str(response)); shell.get_tree().quit(1); return
	shell._session_view.apply(response.result)


static func _integers(value: Variant) -> Variant:
	if value is float: return int(value)
	if value is Array: return value.map(_integers)
	if value is Dictionary:
		var result := {}
		for key in value: result[key]=_integers(value[key])
		return result
	return value
