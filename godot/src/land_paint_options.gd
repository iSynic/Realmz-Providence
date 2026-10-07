extends Window

signal options_accepted(options: Dictionary)

const SHAPES := ["freehand", "line", "rectangle", "ellipse", "connected"]
const MATCHES := ["connected-exact", "connected-family", "connected-behavior"]
const COMBINES := ["replace", "add", "subtract"]
const VARIATIONS := ["single", "cycle-group", "stable-random"]
var _focus: WeakRef


func _ready() -> void:
	%UseOptions.pressed.connect(_accept)
	%CancelOptions.pressed.connect(close)
	close_requested.connect(close)
	%Replacement.toggled.connect(func(enabled): %ReplaceTile.editable = enabled)


func open(options: Dictionary, origin: Control, destination := "") -> void:
	_focus = weakref(origin)
	%OptionsDestination.text = destination + " · provisional editor operation"
	%Shape.select(SHAPES.find(options.shape)); %Filled.set_pressed_no_signal(options.filled)
	%Match.select(MATCHES.find(options.match)); %Combine.select(COMBINES.find(options.combine))
	%Variation.select(VARIATIONS.find(options.variation)); %Chance.value = options.chance; %Seed.value = options.seed
	%Replacement.set_pressed_no_signal(options.replace); %ReplaceTile.value = options.replaceTile
	%ReplaceTile.editable = options.replace
	popup_centered(); %Shape.grab_focus()


func _accept() -> void:
	var options := {"shape": SHAPES[%Shape.selected], "filled": %Filled.button_pressed,
		"match": MATCHES[%Match.selected], "combine": COMBINES[%Combine.selected],
		"variation": VARIATIONS[%Variation.selected], "chance": int(%Chance.value), "seed": int(%Seed.value),
		"replace": %Replacement.button_pressed, "replaceTile": int(%ReplaceTile.value)}
	close(); options_accepted.emit(options)


func close() -> void:
	hide()
	if _focus != null and is_instance_valid(_focus.get_ref()): _focus.get_ref().grab_focus()


func _unhandled_key_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"): close(); set_input_as_handled()
