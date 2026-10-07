extends Control

signal startup_completed

var startup_presentable := false
var allow_completion := false


func _ready() -> void:
	while not allow_completion:
		await get_tree().process_frame
	startup_presentable = true
	startup_completed.emit()
