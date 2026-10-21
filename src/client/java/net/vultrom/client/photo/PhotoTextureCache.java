package net.vultrom.client.photo;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import com.mojang.blaze3d.platform.NativeImage;

import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.Identifier;

import net.vultrom.Vultrom;
import net.vultrom.component.PhotoData;

public final class PhotoTextureCache {
	private static final Map<UUID, Identifier> CACHE = new HashMap<>();

	private PhotoTextureCache() {
	}

	public static Identifier getOrRegister(PhotoData data) {
		UUID key = UUID.nameUUIDFromBytes(data.png());
		Identifier existing = CACHE.get(key);
		if (existing != null) {
			return existing;
		}
		try {
			NativeImage image = NativeImage.read(data.png());
			DynamicTexture texture = new DynamicTexture(() -> "vultrom-photo-" + key, image);
			Identifier id = Vultrom.id("dynamic/photo/" + key);
			Minecraft.getInstance().getTextureManager().register(id, texture);
			CACHE.put(key, id);
			return id;
		} catch (IOException e) {
			Vultrom.LOGGER.error("Bad photo PNG", e);
			return Identifier.withDefaultNamespace("missingno");
		}
	}

	public static void clear() {
		Minecraft mc = Minecraft.getInstance();
		for (Identifier id : CACHE.values()) {
			mc.getTextureManager().release(id);
		}
		CACHE.clear();
	}
}
