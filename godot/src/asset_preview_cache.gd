extends RefCounted

var _bridge: RefCounted
var _epoch := -1
var _entries: Dictionary = {}
var _recent: Array[String] = []
var _bytes := 0
var _entry_limit: int
var _byte_limit: int


func _init(entry_limit := 64, byte_limit := 32 * 1024 * 1024) -> void:
	_entry_limit = entry_limit
	_byte_limit = byte_limit


func attach_connection(bridge: RefCounted) -> void:
	var epoch: int = bridge.connection_epoch()
	if bridge == _bridge and epoch == _epoch: return
	_bridge = bridge
	_epoch = epoch
	_entries.clear()
	_recent.clear()
	_bytes = 0


func find_preview(identity: String) -> Dictionary:
	if not _entries.has(identity): return {}
	_recent.erase(identity)
	_recent.append(identity)
	return _entries[identity].preview.duplicate()


func remember(identity: String, preview: Dictionary) -> void:
	var bytes := _preview_bytes(preview)
	if bytes <= 0 or bytes > _byte_limit or _entry_limit <= 0: return
	_forget(identity)
	while not _recent.is_empty() and (_entries.size() >= _entry_limit or _bytes + bytes > _byte_limit):
		_forget(_recent[0])
	_entries[identity] = {"preview": preview.duplicate(), "bytes": bytes}
	_recent.append(identity)
	_bytes += bytes


func _forget(identity: String) -> void:
	if not _entries.has(identity): return
	_bytes -= int(_entries[identity].bytes)
	_entries.erase(identity)
	_recent.erase(identity)


static func _preview_bytes(preview: Dictionary) -> int:
	if preview.has("error"): return 0
	if preview.get("texture") is Texture2D:
		var texture: Texture2D = preview.texture
		return texture.get_width() * texture.get_height() * 4
	if preview.get("audio") is AudioStreamWAV: return preview.audio.data.size()
	if preview.get("text") is String: return str(preview.text).length() * 4
	return 0
