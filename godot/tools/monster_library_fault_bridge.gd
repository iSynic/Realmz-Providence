extends ProvidenceNativeBridge

var lose_next_monster_reply := false
var apply_requests := 0
var _requested_method := ""
var hold_catalog_frames := 0
var _held_page: Dictionary = {}


func begin_request(method: String, params: Dictionary, owner: int = 0) -> Dictionary:
	_requested_method = method
	if method == "monster-library.draft.apply": apply_requests += 1
	return super.begin_request(method, params, owner)


func poll_request() -> Dictionary:
	if not _held_page.is_empty():
		if hold_catalog_frames > 0:
			hold_catalog_frames -= 1
			return {"pending": true}
		var delivered := _held_page
		_held_page = {}
		return delivered
	var polled := super.poll_request()
	if not polled.get("pending", false) and _requested_method == "monster-library.list" and hold_catalog_frames > 0:
		_held_page = polled
		return {"pending": true}
	if not polled.get("pending", false) and _requested_method == "monster-library.draft.apply" and lose_next_monster_reply and polled.get("response", {}).get("ok", false):
		# The real adapter committed and checkpointed. Hide only its delivered reply
		# so the UI must reopen the same store and reconcile the original receipt.
		lose_next_monster_reply = false
		_requires_reopen = true
		polled.response = {"ok": false, "outcomeUnknown": true, "error": "The original Library reply was lost. Check result before continuing."}
	return polled
