package net.vultrom.block;

import java.util.List;
import java.util.function.Function;
import java.util.function.UnaryOperator;

import net.minecraft.core.Registry;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.references.BlockItemId;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.component.ItemLore;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.material.MapColor;

import net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents;

import net.vultrom.block.custom.GuardPostBlock;
import net.vultrom.block.custom.TraderDeskBlock;

public final class ModBlocks {
	public static final Block GUARD_POST = register(
			ModBlockItemIds.GUARD_POST,
			GuardPostBlock::new,
			BlockBehaviour.Properties.of()
					.mapColor(MapColor.WOOD)
					.strength(2.5f)
					.sound(SoundType.WOOD)
					.requiresCorrectToolForDrops()
	);

	public static final Block TRADER_DESK = register(
			ModBlockItemIds.TRADER_DESK,
			TraderDeskBlock::new,
			BlockBehaviour.Properties.of()
					.mapColor(MapColor.WOOD)
					.strength(2.5f)
					.sound(SoundType.WOOD),
			props -> props.component(DataComponents.LORE, new ItemLore(List.of(
					Component.literal("Right-click: BUY (shop / market)"),
					Component.literal("Sneak + right-click: SELL your items"),
					Component.literal("Sell board: put item in slot → price → List")
			)))
	);

	private ModBlocks() {
	}

	private static Block register(ResourceKey<Block> id, Function<BlockBehaviour.Properties, Block> blockFactory, BlockBehaviour.Properties properties) {
		Block block = blockFactory.apply(properties.setId(id));
		return Registry.register(BuiltInRegistries.BLOCK, id, block);
	}

	private static Block register(BlockItemId id, Function<BlockBehaviour.Properties, Block> blockFactory, BlockBehaviour.Properties properties) {
		return register(id, blockFactory, properties, p -> p);
	}

	private static Block register(
			BlockItemId id,
			Function<BlockBehaviour.Properties, Block> blockFactory,
			BlockBehaviour.Properties properties,
			UnaryOperator<Item.Properties> itemProps
	) {
		Block block = register(id.block(), blockFactory, properties);
		Item.Properties props = itemProps.apply(new Item.Properties().useBlockDescriptionPrefix().setId(id.item()));
		BlockItem blockItem = new BlockItem(block, props);
		Registry.register(BuiltInRegistries.ITEM, id.item(), blockItem);
		return block;
	}

	public static void initialize() {
		CreativeModeTabEvents.modifyOutputEvent(CreativeModeTabs.FUNCTIONAL_BLOCKS).register(tab -> {
			tab.accept(ModBlocks.GUARD_POST.asItem());
			tab.accept(ModBlocks.TRADER_DESK.asItem());
		});
	}
}
