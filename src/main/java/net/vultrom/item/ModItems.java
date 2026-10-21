package net.vultrom.item;

import java.util.function.Function;

import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;

import net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents;

public final class ModItems {
	public static final Item CAMERA = register(
			ModItemIds.CAMERA,
			CameraItem::new,
			new Item.Properties().stacksTo(1)
	);

	public static final Item PHOTO = register(
			ModItemIds.PHOTO,
			PhotoItem::new,
			new Item.Properties().stacksTo(16)
	);

	private ModItems() {
	}

	private static Item register(ResourceKey<Item> id, Function<Item.Properties, Item> factory, Item.Properties properties) {
		Item item = factory.apply(properties.setId(id));
		return Registry.register(BuiltInRegistries.ITEM, id, item);
	}

	public static void initialize() {
		CreativeModeTabEvents.modifyOutputEvent(CreativeModeTabs.TOOLS_AND_UTILITIES).register(tab -> {
			tab.accept(CAMERA);
			tab.accept(PHOTO);
		});
	}
}
