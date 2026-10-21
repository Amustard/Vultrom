package net.vultrom.component;

import net.minecraft.core.Registry;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.registries.BuiltInRegistries;

import net.vultrom.Vultrom;

public final class ModComponents {
	public static final DataComponentType<PhotoData> PHOTO = Registry.register(
			BuiltInRegistries.DATA_COMPONENT_TYPE,
			Vultrom.id("photo"),
			DataComponentType.<PhotoData>builder()
					.persistent(PhotoData.CODEC)
					.networkSynchronized(PhotoData.STREAM_CODEC)
					.build()
	);

	public static final DataComponentType<BookPhotos> BOOK_PHOTOS = Registry.register(
			BuiltInRegistries.DATA_COMPONENT_TYPE,
			Vultrom.id("book_photos"),
			DataComponentType.<BookPhotos>builder()
					.persistent(BookPhotos.CODEC)
					.networkSynchronized(BookPhotos.STREAM_CODEC)
					.build()
	);

	private ModComponents() {
	}

	public static void initialize() {
		// registration via static fields
	}
}
