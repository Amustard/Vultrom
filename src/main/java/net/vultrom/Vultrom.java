package net.vultrom;

import net.minecraft.resources.Identifier;

import net.fabricmc.api.ModInitializer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import net.vultrom.block.ModBlocks;
import net.vultrom.block.entity.ModBlockEntities;
import net.vultrom.component.ModComponents;
import net.vultrom.entity.ModEntityTypes;
import net.vultrom.item.ModItems;
import net.vultrom.menu.ModMenuTypes;
import net.vultrom.network.ModNetworking;
import net.vultrom.sound.ModSounds;

public class Vultrom implements ModInitializer {
	public static final String MOD_ID = "vultrom";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

	@Override
	public void onInitialize() {
		ModComponents.initialize();
		ModSounds.initialize();
		ModBlocks.initialize();
		ModBlockEntities.initialize();
		ModItems.initialize();
		ModEntityTypes.registerModEntityTypes();
		ModEntityTypes.registerAttributes();
		ModMenuTypes.initialize();
		ModNetworking.registerPayloads();
		ModNetworking.registerServerReceivers();
		VultromEvents.register();
		LOGGER.info("Vultrom initialized — Guards + Camera + Trader Desk 0.3.1");
	}

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}
}
