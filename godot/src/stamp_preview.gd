extends RefCounted


static func invalid(resource: Dictionary, origin: Vector2i) -> Dictionary:
	var cells: Array = []
	for entry: Dictionary in resource.get("cells",[]):
		var point := origin + Vector2i(int(entry.x),int(entry.y))
		if point.x>=0 and point.y>=0 and point.x<90 and point.y<90:
			cells.append({"x":point.x,"y":point.y,"tile":int(entry.tile)})
	return {"terrainCells":cells,"protectedCells":cells,"canApply":false}


static func status(resource: Dictionary, plan: Dictionary) -> String:
	if not plan.get("protectedCells",[]).is_empty():
		return "%s · placement is outside the map · move the entire stamp inside" % resource.name
	if not plan.get("canApply",false): return "%s · already matches · no changes" % resource.name
	var preservation := "\n%d marked cells keep their AP, Note and secret state." % int(plan.managedCells) if int(plan.get("managedCells",0))>0 else ""
	return "%s · %d cells · release to place · Esc cancels%s" % [resource.name,plan.paintedCells.size(),preservation]
