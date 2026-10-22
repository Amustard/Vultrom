package net.vultrom.block.entity;

import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityType;

import net.fabricmc.fabric.api.object.builder.v1.block.entity.FabricBlockEntityTypeBuilder;

import net.vultrom.Vultrom;
import net.vultrom.block.ModBlocks;
import net.vultrom.block.entity.custom.GuardPostBlockEntity;
import net.vultrom.block.entity.custom.TraderDeskBlockEntity;

public final class ModBlockEntities {
	public static final BlockEntityType<GuardPostBlockEntity> GUARD_POST =
			register("guard_post", GuardPostBlockEntity::new, ModBlocks.GUARD_POST);

	public static final BlockEntityType<TraderDeskBlockEntity> TRADER_DESK =
			register("trader_desk", TraderDeskBlockEntity::new, ModBlocks.TRADER_DESK);

	private ModBlockEntities() {
	}

	private static <T extends BlockEntity> BlockEntityType<T> register(
			String name,
			FabricBlockEntityTypeBuilder.Factory<? extends T> entityFactory,
			Block... blocks
	) {
		Identifier id = Vultrom.id(name);
		return Registry.register(
				BuiltInRegistries.BLOCK_ENTITY_TYPE,
				id,
				FabricBlockEntityTypeBuilder.<T>create(entityFactory, blocks).build()
		);
	}

	public static void initialize() {
	}
}
