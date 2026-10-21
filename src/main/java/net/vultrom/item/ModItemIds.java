package net.vultrom.item;

import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.Item;

import net.vultrom.Vultrom;

public final class ModItemIds {
	public static final ResourceKey<Item> CAMERA = key("camera");
	public static final ResourceKey<Item> PHOTO = key("photo");

	private ModItemIds() {
	}

	private static ResourceKey<Item> key(String name) {
		return ResourceKey.create(Registries.ITEM, Vultrom.id(name));
	}
}
