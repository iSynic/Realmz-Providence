extends RefCounted

var source_package := ""

func _init(path: String) -> void:
	source_package = path


func current_application_library_root() -> String:
	return ""

func request(method: String, params := {}) -> Dictionary:
	if method == "compiler.describe":
		return {"ok": true, "result": {"commit": "controlled-live-controller-test"}}
	if method != "project.compile-rebuilt-package":
		return {"ok": false, "error": "unexpected fake bridge method: %s" % method}
	var source := FileAccess.open(source_package, FileAccess.READ)
	if source == null:
		return {"ok": false, "error": "could not read the controlled package"}
	var destination := FileAccess.open(str(params.get("path", "")), FileAccess.WRITE)
	if destination == null:
		return {"ok": false, "error": "could not create the controlled preview copy"}
	destination.store_buffer(source.get_buffer(source.get_length()))
	destination.close()
	source.close()
	return {"ok": true, "result": {"revision": int(params.get("expectedRevision", -1))}}
