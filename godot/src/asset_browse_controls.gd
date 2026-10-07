extends HBoxContainer

signal page_requested(offset: int)
signal settings_changed
signal card_size_changed(size: int)
@export var status_path: NodePath
@export var page_size_path: NodePath
@export var card_size_path: NodePath
var page_size := 25
var status := "all"
var _offset := 0
@onready var _status: OptionButton = get_node(status_path) if not status_path.is_empty() else $Status
@onready var _page_size: OptionButton = get_node(page_size_path) if not page_size_path.is_empty() else $PageSize
@onready var _card_size: OptionButton = get_node(card_size_path) if not card_size_path.is_empty() else $CardSize


func _ready() -> void:
	if not status_path.is_empty():
		$Status.hide(); $PageSize.hide(); $CardSize.hide()
	$Previous.pressed.connect(func(): page_requested.emit(maxi(0, _offset - page_size)))
	$Next.pressed.connect(func(): page_requested.emit(_offset + page_size))
	_page_size.item_selected.connect(func(index): page_size = [25, 50, 100][index]; settings_changed.emit())
	_status.item_selected.connect(func(index): status = ["all", "ready", "original"][index] if _status.get_item_text(1) == "Realmz-ready" else ["all", "used", "unused", "problems"][index]; settings_changed.emit())
	_card_size.item_selected.connect(func(index): card_size_changed.emit([64, 96, 128][index]))


func configure(scope: String) -> void:
	_status.clear()
	for label in ["All status", "Realmz-ready", "Original only"] if scope == "personal" else ["All status", "Used", "Unused", "With problems"]: _status.add_item(label)
	_status.visible = scope != "stock"
	status = "all"
	_status.select(0)


func present(page: Dictionary) -> void:
	_offset = int(page.get("offset", 0))
	var total := int(page.get("total", 0))
	$Previous.disabled = _offset == 0
	$Next.disabled = not page.get("truncated", false)
	$Page.text = "Page %d of %d" % [1 + _offset / page_size, maxi(1, ceili(float(total) / page_size))]


func clear() -> void:
	$Previous.disabled = true
	$Next.disabled = true
	$Page.text = "No results"
