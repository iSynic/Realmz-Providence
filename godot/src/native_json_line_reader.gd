extends RefCounted

const MAX_LINE_BYTES := 64 * 1024 * 1024
var _pending := PackedByteArray()


func read(stream: FileAccess, connection_alive: Callable = Callable()) -> String:
	while true:
		var end := _pending.find(10)
		if end >= 0:
			var line := _pending.slice(0, end).get_string_from_utf8()
			_pending = _pending.slice(end + 1)
			return line.trim_suffix("\r")
		# Pipe length is the available byte count. Reading one byte blocks until
		# a response begins; available chunks avoid one system call per character.
		if connection_alive.is_valid() and not connection_alive.call(): return ""
		var count := clampi(int(stream.get_length()), 1, 16 * 1024)
		var bytes := stream.get_buffer(count)
		if bytes.is_empty() or _pending.size() + bytes.size() > MAX_LINE_BYTES:
			_pending.clear()
			return ""
		_pending.append_array(bytes)
	return ""
