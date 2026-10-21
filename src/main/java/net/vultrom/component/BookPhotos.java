package net.vultrom.component;

import java.util.ArrayList;
import java.util.List;

import com.mojang.serialization.Codec;

import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;

/**
 * Photos attached to a Book and Quill (or any item carrying this component).
 */
public record BookPhotos(List<PhotoData> photos) {
	public static final int MAX_PHOTOS = 8;
	public static final BookPhotos EMPTY = new BookPhotos(List.of());

	public static final Codec<BookPhotos> CODEC = PhotoData.CODEC.listOf()
			.xmap(BookPhotos::new, BookPhotos::photos);

	public static final StreamCodec<RegistryFriendlyByteBuf, BookPhotos> STREAM_CODEC = StreamCodec.composite(
			ByteBufCodecs.collection(ArrayList::new, PhotoData.STREAM_CODEC, MAX_PHOTOS),
			BookPhotos::photos,
			BookPhotos::new
	);

	public BookPhotos {
		photos = List.copyOf(photos);
	}

	public BookPhotos withAdded(PhotoData photo) {
		List<PhotoData> next = new ArrayList<>(this.photos);
		next.add(photo);
		return new BookPhotos(next);
	}
}
