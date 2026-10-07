extends RefCounted


static func waveform(stream: AudioStreamWAV, color: Color) -> Texture2D:
	if stream == null or stream.format not in [AudioStreamWAV.FORMAT_8_BITS, AudioStreamWAV.FORMAT_16_BITS]:
		return null
	var data := stream.data
	var stride := (1 if stream.format == AudioStreamWAV.FORMAT_8_BITS else 2) * (2 if stream.stereo else 1)
	var frames := data.size() / stride
	if frames == 0: return null
	var image := Image.create(64, 48, false, Image.FORMAT_RGBA8)
	image.fill(Color.TRANSPARENT)
	# Fixed samples per column keep large sounds inexpensive to browse.
	for x in 64:
		var peak := 0.0
		for sample in 8:
			var offset := mini(frames - 1, int((x * 8 + sample) * frames / 512.0)) * stride
			var value := data[offset] if stride / (2 if stream.stereo else 1) == 1 else data.decode_s16(offset)
			if stream.format == AudioStreamWAV.FORMAT_8_BITS and value > 127: value -= 256
			peak = maxf(peak, absf(value) / (128.0 if stream.format == AudioStreamWAV.FORMAT_8_BITS else 32768.0))
		var height := maxi(1, int(peak * 22))
		for y in range(24 - height, 24 + height): image.set_pixel(x, y, color)
	return ImageTexture.create_from_image(image)
