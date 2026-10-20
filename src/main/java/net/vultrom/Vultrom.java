package net.vultrom;

import net.minecraft.resources.Identifier;

import net.fabricmc.api.ModInitializer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import net.vultrom.block.ModBlocks;
import net.vultrom.block.entity.ModBlockEntities;
import net.vultrom.entity.ModEntityTypes;
import net.vultrom.menu.ModMenuTypes;
import net.vultrom.sound.ModSounds;

public class Vultrom implements ModInitializer {
	public static final String MOD_ID = "vultrom";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

	@Override
	public void onInitialize() {
		ModSounds.initialize();
		ModBlocks.initialize();
		ModBlockEntities.initialize();
		ModEntityTypes.registerModEntityTypes();
		ModEntityTypes.registerAttributes();
		ModMenuTypes.initialize();
		VultromEvents.register();
		LOGGER.info("Vultrom initialized — Security Guards ready");
	}

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}
}
