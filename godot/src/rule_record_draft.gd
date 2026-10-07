extends RefCounted

signal changed
var document: Dictionary = {}
var edit: Dictionary = {}
var baseline: Dictionary = {}
var family_hash := ""
var allocation := false
var copy_source: Variant = null
var revision := -1
var generation := 0
var edit_sequence := 0
var editable := false
var author_id := -1

func definition() -> Dictionary: return edit.get("definition", {})

func bind_document(value: Dictionary) -> void:
	generation += 1
	edit_sequence = 0
	document = value.duplicate(true)
	author_id = int(value.get("authorId", -1))
	var submitted: Dictionary = value.get("draft", {})
	edit = submitted.get("edit", {}).duplicate(true)
	baseline = edit.duplicate(true)
	family_hash = str(submitted.get("expectedFamilyHash", ""))
	allocation = false
	copy_source = null
	revision = int(value.get("revision", -1))
	editable = value.get("ownership", "") == "scenario"
	changed.emit()

func stage(value: Dictionary, project_revision: int, creation: bool, author_number: int = -1) -> void:
	generation += 1
	edit_sequence += 1
	edit = value.edit.duplicate(true)
	if author_number >= 0: author_id = author_number
	family_hash = str(value.expectedFamilyHash)
	allocation = bool(value.allocation)
	copy_source = value.get("copySource")
	revision = project_revision
	editable = true
	if creation: baseline = {}
	changed.emit()

func edit_path(path: Array, value: Variant) -> void:
	if not editable or edit.is_empty(): return
	var node: Variant = edit
	for index in path.size() - 1:
		if node is Dictionary and not node.has(path[index]): return
		if node is Array and (int(path[index]) < 0 or int(path[index]) >= node.size()): return
		node = node[path[index]]
	var key: Variant = path[-1]
	if node[key] == value: return
	node[key] = value
	edit_sequence += 1
	changed.emit()

func dirty() -> bool: return editable and (allocation or edit != baseline)
func submitted() -> Dictionary:
	return {"edit": edit.duplicate(true), "expectedFamilyHash": family_hash, "allocation": allocation, "copySource": copy_source}

func discard() -> void:
	if allocation: bind_document(document)
	else:
		edit = baseline.duplicate(true)
		edit_sequence += 1
		changed.emit()
