package net.vultrom.component;

import java.util.Arrays;

import com.mojang.serialization.Codec;

import io.netty.buffer.ByteBuf;

import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.util.ExtraCodecs;

/**
 * Compressed PNG bytes for an in-game photo (kept small for item NBT / packets).
 */
public record PhotoData(byte[] png) {
	public static final int MAX_BYTES = 48_000;

	public static final Codec<PhotoData> CODEC = ExtraCodecs.BASE64_STRING.xmap(PhotoData::new, PhotoData::png);

	public static final StreamCodec<ByteBuf, PhotoData> STREAM_CODEC = StreamCodec.composite(
			ByteBufCodecs.byteArray(MAX_BYTES),
			PhotoData::png,
			PhotoData::new
	);

	public PhotoData {
		if (png == null) {
			throw new IllegalArgumentException("png");
		}
		if (png.length > MAX_BYTES) {
			throw new IllegalArgumentException("photo too large: " + png.length);
		}
		png = Arrays.copyOf(png, png.length);
	}

	@Override
	public byte[] png() {
		return Arrays.copyOf(this.png, this.png.length);
	}

	@Override
	public boolean equals(Object obj) {
		return obj instanceof PhotoData other && Arrays.equals(this.png, other.png);
	}

	@Override
	public int hashCode() {
		return Arrays.hashCode(this.png);
	}
}
