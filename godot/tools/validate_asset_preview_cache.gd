extends SceneTree

class Connection extends RefCounted:
	var epoch := 1
	func connection_epoch() -> int: return epoch


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var cache := preload("res://src/asset_preview_cache.gd").new(2, 16)
	var connection := Connection.new()
	cache.attach_connection(connection)
	cache.remember("first", {"text": "aa"})
	cache.remember("second", {"text": "bb"})
	assert(cache.find_preview("first").text == "aa")
	cache.remember("third", {"text": "cc"})
	assert(cache.find_preview("second").is_empty())
	assert(cache.find_preview("first").text == "aa")
	cache.remember("large", {"text": "too large"})
	cache.remember("failure", {"error": "unavailable"})
	assert(cache.find_preview("large").is_empty() and cache.find_preview("failure").is_empty())
	cache.remember("third", {"text": "c"})
	cache.remember("replacement", {"text": "ddd"})
	assert(cache.find_preview("first").is_empty() and cache.find_preview("third").text == "c")
	connection.epoch += 1
	cache.attach_connection(connection)
	assert(cache.find_preview("third").is_empty())
	cache.remember("third", {"text": "new"})
	cache.attach_connection(Connection.new())
	assert(cache.find_preview("third").is_empty())
	print("PROVIDENCE_ASSET_PREVIEW_CACHE_OK bounded-bytes bounded-entries recency rejection-not-cached connection-reset")
	quit()
