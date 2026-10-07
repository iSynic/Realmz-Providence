extends "res://src/monster_reference_picker.gd"


func receive_spell_preview(response: Dictionary, request_generation: int, value: int) -> void:
	if not visible or request_generation != generation or int(selected.get("value", -1)) != value: return
	var decoded := preload("res://src/spell_presentation.gd").decode(response)
	var textures: Array = decoded.get("textures", [])
	%Pictures.visible = not textures.is_empty()
	%Base.hide(); %Facing.hide()
	for index in 8:
		var frame: TextureRect = get_node("Margin/Layout/Panes/Preview/Pictures/SpellFrame" + str(index))
		frame.texture = textures[index] if index < textures.size() else null
		frame.visible = index < textures.size()
	var audio: AudioStreamWAV = decoded.get("audio")
	%ReferenceAudio.stream = audio
	%SoundPreview.visible = audio != null
	%PlaySound.disabled = audio == null
	%SoundWaveform.texture = preload("res://src/media_audio_presentation.gd").waveform(audio, %Name.get_theme_color("font_color", "Label"))
	%UseSelection.disabled = not selected.get("available", false) or not decoded.get("complete", false)
	if not decoded.get("complete", false): %Availability.text = str(decoded.get("error", "The exact presentation could not be loaded."))
	_accept_after_preview()
