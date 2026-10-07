extends RefCounted

var rows: Array = []
var batch_start := 0
var token := ""

func prepare(offset: int, advance: bool, restart: bool) -> Dictionary:
	if restart: reset()
	if advance: batch_start = rows.size()
	else: rows = rows.slice(0, batch_start + offset)
	return {"batchToken": token, "advanceWork": advance}

func accept(page: Dictionary) -> Array:
	token = str(page.get("batchToken", ""))
	rows.append_array(page.get("items", []))
	return rows

func state() -> Dictionary:
	return {"rows":rows.duplicate(true), "batchStart":batch_start, "token":token}

func restore(state: Dictionary) -> void:
	rows = state.get("rows", []).duplicate(true)
	batch_start = int(state.get("batchStart", 0))
	token = str(state.get("token", ""))

func reset() -> void:
	rows = []
	batch_start = 0
	token = ""
