shader_type canvas_item;

void fragment() {
	vec4 pixel = texture(TEXTURE, UV);
	bool neutral = abs(pixel.r - pixel.g) < 0.001 && abs(pixel.g - pixel.b) < 0.001;
	if (neutral) {
		COLOR.a = 0.0;
	}
}
