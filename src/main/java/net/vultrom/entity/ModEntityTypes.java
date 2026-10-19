package net.vultrom.entity;

import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;

import net.fabricmc.fabric.api.object.builder.v1.entity.FabricDefaultAttributeRegistry;

import net.vultrom.Vultrom;

public final class ModEntityTypes {
	public static final EntityType<SecurityGuardEntity> SECURITY_GUARD = register(
			ModEntityTypeIds.SECURITY_GUARD,
			EntityType.Builder.<SecurityGuardEntity>of(SecurityGuardEntity::new, MobCategory.MISC)
					.sized(0.6f, 1.95f)
					.clientTrackingRange(10)
	);

	private ModEntityTypes() {
	}

	private static <T extends Entity> EntityType<T> register(ResourceKey<EntityType<?>> key, EntityType.Builder<T> builder) {
		return Registry.register(BuiltInRegistries.ENTITY_TYPE, key, builder.build(key));
	}

	public static void registerModEntityTypes() {
		Vultrom.LOGGER.info("Registering entity types for {}", Vultrom.MOD_ID);
	}

	public static void registerAttributes() {
		FabricDefaultAttributeRegistry.register(SECURITY_GUARD, SecurityGuardEntity.createAttributes());
	}
}
