extends RefCounted


static func matches(received: Variant, submitted: Variant) -> bool:
	# JSON replies use floating-point numbers in Godot; local drafts may use ints.
	# Compare numeric values without allowing strings, missing fields or sign changes.
	if typeof(received) in [TYPE_INT, TYPE_FLOAT] and typeof(submitted) in [TYPE_INT, TYPE_FLOAT]:
		return received == submitted
	if typeof(received) != typeof(submitted): return false
	if received is Dictionary:
		if received.size() != submitted.size(): return false
		for key in submitted:
			if not received.has(key) or not matches(received[key], submitted[key]): return false
		return true
	if received is Array:
		if received.size() != submitted.size(): return false
		for index in submitted.size():
			if not matches(received[index], submitted[index]): return false
		return true
	return received == submitted
