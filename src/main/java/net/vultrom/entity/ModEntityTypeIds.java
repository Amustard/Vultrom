package net.vultrom.entity;

import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.EntityType;

import net.vultrom.Vultrom;

public final class ModEntityTypeIds {
	public static final ResourceKey<EntityType<?>> SECURITY_GUARD = create("security_guard");

	private ModEntityTypeIds() {
	}

	private static ResourceKey<EntityType<?>> create(String name) {
		return ResourceKey.create(Registries.ENTITY_TYPE, Vultrom.id(name));
	}
}
